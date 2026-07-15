import Dexie from "dexie";

import { offlineDb } from "@/lib/offline-db/db";
import type {
  ConflictRecord,
  LocalNotebook,
  LocalPage,
  SyncBootstrapPayload,
  SyncQueueItem,
  SyncPushResult,
  SyncStatus,
} from "@/lib/offline-db/types";

function dispatchSyncEvent(detail: Record<string, unknown>) {
  if (typeof window === "undefined") {
    return;
  }

  window.dispatchEvent(new CustomEvent("notava-sync", { detail }));
}

function metaKey(userId: string, key: string) {
  return `${userId}:${key}`;
}

export async function setLastPullAt(userId: string, value: string) {
  await offlineDb.meta.put({ key: metaKey(userId, "lastPullAt"), value });
}

export async function getLastPullAt(userId: string) {
  return (await offlineDb.meta.get(metaKey(userId, "lastPullAt")))?.value ?? null;
}

export async function clearOfflineStateForUser(userId: string) {
  await offlineDb.transaction(
    "rw",
    [
      offlineDb.notebooks,
      offlineDb.pages,
      offlineDb.queue,
      offlineDb.conflicts,
      offlineDb.meta,
    ],
    async () => {
      await offlineDb.notebooks.where("userId").equals(userId).delete();
      await offlineDb.pages.where("userId").equals(userId).delete();
      const meta = await offlineDb.meta.toArray();
      await offlineDb.queue.where("userId").equals(userId).delete();
      await offlineDb.conflicts.where("userId").equals(userId).delete();
      await Promise.all(
        meta
          .filter((item) => item.key.startsWith(`${userId}:`))
          .map((item) => offlineDb.meta.delete(item.key)),
      );
    },
  );
}

export async function seedOfflineBootstrap(
  userId: string,
  payload: SyncBootstrapPayload,
) {
  await offlineDb.transaction(
    "rw",
    offlineDb.notebooks,
    offlineDb.pages,
    offlineDb.meta,
    async () => {
      await offlineDb.notebooks.where("userId").equals(userId).delete();
      await offlineDb.pages.where("userId").equals(userId).delete();
      await offlineDb.notebooks.bulkPut(payload.notebooks);
      await offlineDb.pages.bulkPut(payload.pages);
      if (!payload.hasMore) {
        await setLastPullAt(userId, payload.fetchedAt);
      }
    },
  );
}

export async function hasOfflineBootstrap(userId: string) {
  const [notebookCount, pageCount] = await Promise.all([
    offlineDb.notebooks.where("userId").equals(userId).count(),
    offlineDb.pages.where("userId").equals(userId).count(),
  ]);

  return notebookCount > 0 || pageCount > 0;
}

async function applyRemoteTombstones(
  userId: string,
  tombstones: NonNullable<SyncBootstrapPayload["tombstones"]>,
) {
  for (const tombstone of tombstones) {
    const entityKey = [userId, tombstone.entityType, tombstone.entityId];
    const queueKeys = await offlineDb.queue
      .where("[userId+entityType+entityId]")
      .equals(entityKey)
      .primaryKeys();
    const conflictKeys = await offlineDb.conflicts
      .where("[userId+entityType+entityId]")
      .equals(entityKey)
      .primaryKeys();

    if (tombstone.entityType === "page") {
      const localPage = await offlineDb.pages.get(tombstone.entityId);
      if (localPage?.userId === userId) {
        await offlineDb.pages.delete(tombstone.entityId);
      }
    } else {
      const localNotebook = await offlineDb.notebooks.get(tombstone.entityId);
      if (localNotebook?.userId === userId) {
        await offlineDb.notebooks.delete(tombstone.entityId);
      }
      const childPageKeys = await offlineDb.pages
        .where("[userId+notebookId]")
        .equals([userId, tombstone.entityId])
        .primaryKeys();
      if (childPageKeys.length > 0) {
        const childEntityKeys = childPageKeys.map((pageId) => [
          userId,
          "page",
          pageId,
        ]);
        queueKeys.push(
          ...(await offlineDb.queue
            .where("[userId+entityType+entityId]")
            .anyOf(childEntityKeys)
            .primaryKeys()),
        );
        conflictKeys.push(
          ...(await offlineDb.conflicts
            .where("[userId+entityType+entityId]")
            .anyOf(childEntityKeys)
            .primaryKeys()),
        );
      }
      await offlineDb.pages.bulkDelete(childPageKeys);
    }

    await offlineDb.queue.bulkDelete(queueKeys);
    await offlineDb.conflicts.bulkDelete(conflictKeys);
    dispatchSyncEvent({
      type: "tombstone",
      userId,
      entityType: tombstone.entityType,
      entityId: tombstone.entityId,
    });
  }
}

export async function applyPullChanges(
  userId: string,
  payload: SyncBootstrapPayload,
) {
  await offlineDb.transaction(
    "rw",
    [
      offlineDb.notebooks,
      offlineDb.pages,
      offlineDb.queue,
      offlineDb.conflicts,
      offlineDb.meta,
    ],
    async () => {
      const [localNotebooks, localPages] = await Promise.all([
        offlineDb.notebooks.bulkGet(payload.notebooks.map((item) => item.id)),
        offlineDb.pages.bulkGet(payload.pages.map((item) => item.id)),
      ]);
      const canApplyRemote = (local: { syncStatus: SyncStatus } | undefined) =>
        !local || local.syncStatus === "synced";
      const notebooksToApply = payload.notebooks.filter((_, index) =>
        canApplyRemote(localNotebooks[index]),
      );
      const pagesToApply = payload.pages.filter((_, index) =>
        canApplyRemote(localPages[index]),
      );

      if (notebooksToApply.length > 0) {
        await offlineDb.notebooks.bulkPut(notebooksToApply);
      }

      if (pagesToApply.length > 0) {
        await offlineDb.pages.bulkPut(pagesToApply);
      }

      await applyRemoteTombstones(userId, payload.tombstones ?? []);

      if (!payload.hasMore) {
        await setLastPullAt(userId, payload.fetchedAt);
      }
    },
  );
}

export async function upsertLocalPage(page: LocalPage) {
  await offlineDb.pages.put(page);
  dispatchSyncEvent({
    type: "page",
    userId: page.userId,
    pageId: page.id,
    syncStatus: page.syncStatus,
  });
}

export async function getLocalPage(userId: string, pageId: string) {
  const page = await offlineDb.pages.get(pageId);
  return page?.userId === userId ? page : undefined;
}

export async function getLocalNotebooks(userId: string) {
  const notebooks = await offlineDb.notebooks.where("userId").equals(userId).toArray();
  const pages = await offlineDb.pages.where("userId").equals(userId).toArray();

  return notebooks
    .filter((notebook) => !notebook.archived)
    .map((notebook) => ({
      ...notebook,
      pages: pages
        .filter((page) => page.notebookId === notebook.id && !page.archived)
        .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt)),
    }))
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

export async function updateLocalSyncStatus(
  userId: string,
  pageId: string,
  syncStatus: SyncStatus,
  lastSyncedAt?: string | null,
) {
  const page = await getLocalPage(userId, pageId);

  if (!page) {
    return;
  }

  await offlineDb.pages.put({
    ...page,
    syncStatus,
    lastSyncedAt: lastSyncedAt ?? page.lastSyncedAt ?? null,
  });
  dispatchSyncEvent({ type: "page", userId, pageId, syncStatus, lastSyncedAt });
}

export async function enqueuePageUpsert(page: LocalPage, baseUpdatedAt?: string | null) {
  await offlineDb.transaction("rw", offlineDb.queue, async () => {
    const existing = await offlineDb.queue
      .where("[userId+entityType+entityId]")
      .equals([page.userId, "page", page.id])
      .and((item) => item.operation === "upsert")
      .first();

    const nextQueueItem = {
      userId: page.userId,
      entityType: "page",
      entityId: page.id,
      operation: "upsert",
      payload: page,
      baseUpdatedAt: existing?.baseUpdatedAt ?? baseUpdatedAt,
      createdAt: new Date().toISOString(),
      status: "pending",
    } satisfies SyncQueueItem;

    if (existing?.id) {
      await offlineDb.queue.put({ ...nextQueueItem, id: existing.id });
    } else {
      await offlineDb.queue.add(nextQueueItem);
    }
  });

  await updateLocalSyncStatus(page.userId, page.id, "pending", page.lastSyncedAt ?? null);
}

export async function enqueueNotebookUpsert(
  notebook: LocalNotebook,
  baseUpdatedAt?: string | null,
) {
  await offlineDb.transaction("rw", offlineDb.queue, async () => {
    const existing = await offlineDb.queue
      .where("[userId+entityType+entityId]")
      .equals([notebook.userId, "notebook", notebook.id])
      .and((item) => item.operation === "upsert")
      .first();

    const nextQueueItem = {
      userId: notebook.userId,
      entityType: "notebook",
      entityId: notebook.id,
      operation: "upsert",
      payload: notebook,
      baseUpdatedAt: existing?.baseUpdatedAt ?? baseUpdatedAt,
      createdAt: new Date().toISOString(),
      status: "pending",
    } satisfies SyncQueueItem;

    if (existing?.id) {
      await offlineDb.queue.put({ ...nextQueueItem, id: existing.id });
    } else {
      await offlineDb.queue.add(nextQueueItem);
    }
  });
}

export async function enqueuePageArchive(page: LocalPage, baseUpdatedAt?: string | null) {
  await offlineDb.queue
    .where("[userId+entityType+entityId]")
    .equals([page.userId, "page", page.id])
    .delete();

  await offlineDb.queue.add({
    userId: page.userId,
    entityType: "page",
    entityId: page.id,
    operation: "archive",
    payload: page,
    baseUpdatedAt,
    createdAt: new Date().toISOString(),
    status: "pending",
  });
  await updateLocalSyncStatus(page.userId, page.id, "pending", page.lastSyncedAt ?? null);
}

export async function enqueueNotebookArchive(
  notebook: LocalNotebook,
  baseUpdatedAt?: string | null,
) {
  await offlineDb.queue
    .where("[userId+entityType+entityId]")
    .equals([notebook.userId, "notebook", notebook.id])
    .delete();

  await offlineDb.queue.add({
    userId: notebook.userId,
    entityType: "notebook",
    entityId: notebook.id,
    operation: "archive",
    payload: notebook,
    baseUpdatedAt,
    createdAt: new Date().toISOString(),
    status: "pending",
  });
}

export async function listPendingQueue(userId: string, limit = 50) {
  const queue = (
    await Promise.all(
      (["pending", "failed"] as const).map((status) =>
        offlineDb.queue
          .where("[userId+status+createdAt]")
          .between(
            [userId, status, Dexie.minKey],
            [userId, status, Dexie.maxKey],
          )
          .limit(limit)
          .toArray(),
      ),
    )
  ).flat();
  return queue
    .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
    .slice(0, limit);
}

export async function applySyncPushResult(userId: string, result: SyncPushResult) {
  await offlineDb.transaction(
    "rw",
    [
      offlineDb.notebooks,
      offlineDb.pages,
      offlineDb.queue,
      offlineDb.conflicts,
      offlineDb.meta,
    ],
    async () => {
      const conflictedNotebookIds = new Set(
        result.conflicts
          .filter((item) => item.entityType === "notebook")
          .map((item) => item.entityId),
      );
      const conflictedPageIds = new Set(
        result.conflicts
          .filter((item) => item.entityType === "page")
          .map((item) => item.entityId),
      );
      const notebooksToApply = result.notebooks.filter(
        (item) => !conflictedNotebookIds.has(item.id),
      );
      const pagesToApply = result.pages.filter((item) => !conflictedPageIds.has(item.id));

      if (notebooksToApply.length > 0) {
        await offlineDb.notebooks.bulkPut(notebooksToApply);
      }

      if (pagesToApply.length > 0) {
        await offlineDb.pages.bulkPut(pagesToApply);
      }

      await applyRemoteTombstones(userId, result.tombstones ?? []);

      for (const applied of result.applied) {
        if (applied.queueId) {
          await offlineDb.queue.delete(applied.queueId);
        }
      }

      for (const conflict of result.conflicts) {
        if (conflict.entityType === "page") {
          await offlineDb.pages.update(conflict.entityId, { syncStatus: "conflict" });
        } else {
          await offlineDb.notebooks.update(conflict.entityId, { syncStatus: "conflict" });
        }

        await offlineDb.conflicts.put({
          ...conflict,
          userId,
          id: `${userId}:${conflict.id}`,
        });
        dispatchSyncEvent({
          type: "page",
          userId,
          pageId: conflict.entityId,
          syncStatus: "conflict",
          conflict,
        });

        const queuedItems = await offlineDb.queue
          .where("[userId+entityType+entityId]")
          .equals([userId, conflict.entityType, conflict.entityId])
          .toArray();
        await Promise.all(
          queuedItems.map((item) =>
            item.id
              ? offlineDb.queue.update(item.id, { status: "conflict" })
              : Promise.resolve(0),
          ),
        );
      }

    },
  );
}

export async function fetchBootstrap(cursor?: string | null) {
  const response = await fetch(
    `/api/sync/bootstrap${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`,
    {
      credentials: "same-origin",
      cache: "no-store",
    },
  );

  if (!response.ok) {
    throw new Error("BOOTSTRAP_FAILED");
  }

  return (await response.json()) as SyncBootstrapPayload;
}

export async function fetchPullChanges(userId: string, cursor?: string | null) {
  const since = cursor ? null : await getLastPullAt(userId);
  const query = cursor
    ? `?cursor=${encodeURIComponent(cursor)}`
    : since
      ? `?since=${encodeURIComponent(since)}`
      : "";
  const response = await fetch(
    `/api/sync/pull${query}`,
    {
      credentials: "same-origin",
      cache: "no-store",
    },
  );

  if (!response.ok) {
    throw new Error("PULL_FAILED");
  }

  return (await response.json()) as SyncBootstrapPayload;
}

export async function pushQueue(items: SyncQueueItem[]) {
  const response = await fetch("/api/sync/push", {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ operations: items }),
  });

  if (!response.ok) {
    let detail = "";

    try {
      const payload = (await response.json()) as {
        error?: string;
        issues?: Array<{ path?: string; message?: string }>;
      };
      const issueText = payload.issues
        ?.map((issue) => [issue.path, issue.message].filter(Boolean).join(": "))
        .filter(Boolean)
        .join("; ");

      detail = [payload.error, issueText].filter(Boolean).join(" - ");
    } catch {
      detail = await response.text().catch(() => "");
    }

    throw new Error(
      ["PUSH_FAILED", response.status, detail].filter(Boolean).join(" "),
    );
  }

  return (await response.json()) as SyncPushResult;
}

export async function upsertConflictRecords(userId: string, conflicts: ConflictRecord[]) {
  if (conflicts.length === 0) {
    return;
  }

  await offlineDb.conflicts.bulkPut(
    conflicts.map((conflict) => ({
      ...conflict,
      userId,
      id: `${userId}:${conflict.id}`,
    })),
  );
}

export async function listConflictRecords(userId: string) {
  const conflicts = await offlineDb.conflicts
    .where("userId")
    .equals(userId)
    .sortBy("createdAt");
  return conflicts.reverse();
}

function isRemotePagePayload(
  payload: Record<string, unknown> | undefined,
): payload is LocalPage {
  return Boolean(
    payload &&
      typeof payload.id === "string" &&
      typeof payload.userId === "string" &&
      typeof payload.notebookId === "string" &&
      typeof payload.title === "string" &&
      typeof payload.bodyHtml === "string" &&
      typeof payload.bodyText === "string" &&
      typeof payload.updatedAt === "string",
  );
}

function isRemoteNotebookPayload(
  payload: Record<string, unknown> | undefined,
): payload is LocalNotebook {
  return Boolean(
    payload &&
      typeof payload.id === "string" &&
      typeof payload.userId === "string" &&
      typeof payload.groupId === "string" &&
      typeof payload.name === "string" &&
      typeof payload.updatedAt === "string",
  );
}

async function deleteEntityConflictState(conflict: ConflictRecord) {
  const [conflicts, queue] = await Promise.all([
    offlineDb.conflicts
      .where("[userId+entityType+entityId]")
      .equals([conflict.userId, conflict.entityType, conflict.entityId])
      .toArray(),
    offlineDb.queue
      .where("[userId+entityType+entityId]")
      .equals([conflict.userId, conflict.entityType, conflict.entityId])
      .toArray(),
  ]);

  await Promise.all([
    ...conflicts.map((item) => offlineDb.conflicts.delete(item.id)),
    ...queue.map((item) =>
      item.id ? offlineDb.queue.delete(item.id) : Promise.resolve(),
    ),
  ]);
}

export async function resolveConflictWithRemote(userId: string, conflictId: string) {
  const conflict = await offlineDb.conflicts.get(conflictId);
  if (!conflict || conflict.userId !== userId) {
    throw new Error("CONFLICT_NOT_FOUND");
  }

  await offlineDb.transaction(
    "rw",
    offlineDb.notebooks,
    offlineDb.pages,
    offlineDb.queue,
    offlineDb.conflicts,
    async () => {
      if (conflict.entityType === "page") {
        if (!isRemotePagePayload(conflict.remotePayload)) {
          throw new Error("INVALID_REMOTE_CONFLICT_PAYLOAD");
        }
        await offlineDb.pages.put({
          ...conflict.remotePayload,
          syncStatus: "synced",
          lastSyncedAt: conflict.remotePayload.updatedAt,
        });
      } else {
        if (!isRemoteNotebookPayload(conflict.remotePayload)) {
          throw new Error("INVALID_REMOTE_CONFLICT_PAYLOAD");
        }
        await offlineDb.notebooks.put({
          ...conflict.remotePayload,
          syncStatus: "synced",
          lastSyncedAt: conflict.remotePayload.updatedAt,
        });
      }

      await deleteEntityConflictState(conflict);
    },
  );

  dispatchSyncEvent({
    type: "conflict-resolved",
    userId,
    pageId: conflict.entityType === "page" ? conflict.entityId : undefined,
    entityType: conflict.entityType,
    entityId: conflict.entityId,
    syncStatus: "synced",
  });
}

export async function resolveConflictWithLocal(userId: string, conflictId: string) {
  const conflict = await offlineDb.conflicts.get(conflictId);
  if (!conflict || conflict.userId !== userId) {
    throw new Error("CONFLICT_NOT_FOUND");
  }

  const remoteUpdatedAt =
    typeof conflict.remotePayload?.updatedAt === "string"
      ? conflict.remotePayload.updatedAt
      : null;
  if (!remoteUpdatedAt) {
    throw new Error("INVALID_REMOTE_CONFLICT_PAYLOAD");
  }

  await offlineDb.transaction(
    "rw",
    offlineDb.notebooks,
    offlineDb.pages,
    offlineDb.queue,
    offlineDb.conflicts,
    async () => {
      const local =
        conflict.entityType === "page"
          ? await offlineDb.pages.get(conflict.entityId)
          : await offlineDb.notebooks.get(conflict.entityId);
      if (!local || local.userId !== userId) {
        throw new Error("LOCAL_CONFLICT_ENTITY_NOT_FOUND");
      }

      await deleteEntityConflictState(conflict);
      if (conflict.entityType === "page") {
        const page = { ...(local as LocalPage), syncStatus: "pending" as const };
        await offlineDb.pages.put(page);
        await offlineDb.queue.add({
          userId,
          entityType: "page",
          entityId: page.id,
          operation: "upsert",
          payload: page,
          baseUpdatedAt: remoteUpdatedAt,
          createdAt: new Date().toISOString(),
          status: "pending",
        });
      } else {
        const notebook = {
          ...(local as LocalNotebook),
          syncStatus: "pending" as const,
        };
        await offlineDb.notebooks.put(notebook);
        await offlineDb.queue.add({
          userId,
          entityType: "notebook",
          entityId: notebook.id,
          operation: "upsert",
          payload: notebook,
          baseUpdatedAt: remoteUpdatedAt,
          createdAt: new Date().toISOString(),
          status: "pending",
        });
      }
    },
  );

  dispatchSyncEvent({
    type: "conflict-resolved",
    userId,
    pageId: conflict.entityType === "page" ? conflict.entityId : undefined,
    entityType: conflict.entityType,
    entityId: conflict.entityId,
    syncStatus: "pending",
  });
}
