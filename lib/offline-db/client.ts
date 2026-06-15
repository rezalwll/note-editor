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
      const queue = await offlineDb.queue.toArray();
      const conflicts = await offlineDb.conflicts.toArray();
      const meta = await offlineDb.meta.toArray();

      await Promise.all(
        queue
          .filter((item) => (item.payload as { userId?: string }).userId === userId)
          .map((item) => (item.id ? offlineDb.queue.delete(item.id) : Promise.resolve())),
      );
      await Promise.all(
        conflicts
          .filter((item) => item.id.startsWith(`${userId}:`))
          .map((item) => offlineDb.conflicts.delete(item.id)),
      );
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
      await setLastPullAt(userId, payload.fetchedAt);
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

export async function applyPullChanges(
  userId: string,
  payload: SyncBootstrapPayload,
) {
  await offlineDb.transaction(
    "rw",
    offlineDb.notebooks,
    offlineDb.pages,
    offlineDb.meta,
    async () => {
      if (payload.notebooks.length > 0) {
        await offlineDb.notebooks.bulkPut(payload.notebooks);
      }

      if (payload.pages.length > 0) {
        await offlineDb.pages.bulkPut(payload.pages);
      }

      await setLastPullAt(userId, payload.fetchedAt);
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
  const existing = await offlineDb.queue
    .where("entityId")
    .equals(page.id)
    .and(
      (item) =>
        item.entityType === "page" &&
        item.operation === "upsert" &&
        (item.payload as { userId?: string }).userId === page.userId,
    )
    .first();

  const nextQueueItem = {
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

  await updateLocalSyncStatus(page.userId, page.id, "pending", page.lastSyncedAt ?? null);
}

export async function enqueueNotebookUpsert(
  notebook: LocalNotebook,
  baseUpdatedAt?: string | null,
) {
  const existing = await offlineDb.queue
    .where("entityId")
    .equals(notebook.id)
    .and(
      (item) =>
        item.entityType === "notebook" &&
        item.operation === "upsert" &&
        (item.payload as { userId?: string }).userId === notebook.userId,
    )
    .first();

  const nextQueueItem = {
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
}

export async function enqueuePageArchive(page: LocalPage, baseUpdatedAt?: string | null) {
  const queue = await offlineDb.queue.toArray();
  await Promise.all(
    queue
      .filter(
        (item) =>
          item.entityId === page.id &&
          item.entityType === "page" &&
          (item.payload as { userId?: string }).userId === page.userId &&
          item.id,
      )
      .map((item) => offlineDb.queue.delete(item.id!)),
  );

  await offlineDb.queue.add({
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
  const queue = await offlineDb.queue.toArray();
  await Promise.all(
    queue
      .filter(
        (item) =>
          item.entityId === notebook.id &&
          item.entityType === "notebook" &&
          (item.payload as { userId?: string }).userId === notebook.userId &&
          item.id,
      )
      .map((item) => offlineDb.queue.delete(item.id!)),
  );

  await offlineDb.queue.add({
    entityType: "notebook",
    entityId: notebook.id,
    operation: "archive",
    payload: notebook,
    baseUpdatedAt,
    createdAt: new Date().toISOString(),
    status: "pending",
  });
}

export async function listPendingQueue(userId: string) {
  const queue = await offlineDb.queue.orderBy("createdAt").toArray();
  return queue.filter((item) => (item.payload as { userId?: string }).userId === userId);
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
      if (result.notebooks.length > 0) {
        await offlineDb.notebooks.bulkPut(result.notebooks);
      }

      if (result.pages.length > 0) {
        await offlineDb.pages.bulkPut(result.pages);
      }

      for (const applied of result.applied) {
        if (applied.queueId) {
          await offlineDb.queue.delete(applied.queueId);
        }
      }

      for (const conflict of result.conflicts) {
        await offlineDb.conflicts.put({
          ...conflict,
          id: `${userId}:${conflict.id}`,
        });
        dispatchSyncEvent({
          type: "page",
          userId,
          pageId: conflict.entityId,
          syncStatus: "conflict",
          conflict,
        });
      }

      await setLastPullAt(userId, result.pulledAt);
    },
  );
}

export async function fetchBootstrap() {
  const response = await fetch("/api/sync/bootstrap", {
    credentials: "same-origin",
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error("BOOTSTRAP_FAILED");
  }

  return (await response.json()) as SyncBootstrapPayload;
}

export async function fetchPullChanges(userId: string) {
  const since = await getLastPullAt(userId);
  const response = await fetch(
    `/api/sync/pull${since ? `?since=${encodeURIComponent(since)}` : ""}`,
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
    throw new Error("PUSH_FAILED");
  }

  return (await response.json()) as SyncPushResult;
}

export async function upsertConflictRecords(userId: string, conflicts: ConflictRecord[]) {
  if (conflicts.length === 0) {
    return;
  }

  await offlineDb.conflicts.bulkPut(
    conflicts.map((conflict) => ({ ...conflict, id: `${userId}:${conflict.id}` })),
  );
}
