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

export async function setLastPullAt(value: string) {
  await offlineDb.meta.put({ key: "lastPullAt", value });
}

export async function getLastPullAt() {
  return (await offlineDb.meta.get("lastPullAt"))?.value ?? null;
}

export async function seedOfflineBootstrap(payload: SyncBootstrapPayload) {
  await offlineDb.transaction(
    "rw",
    offlineDb.notebooks,
    offlineDb.pages,
    offlineDb.meta,
    async () => {
      await offlineDb.notebooks.bulkPut(payload.notebooks);
      await offlineDb.pages.bulkPut(payload.pages);
      await setLastPullAt(payload.fetchedAt);
    },
  );
}

export async function upsertLocalPage(page: LocalPage) {
  await offlineDb.pages.put(page);
  dispatchSyncEvent({ type: "page", pageId: page.id, syncStatus: page.syncStatus });
}

export async function getLocalPage(pageId: string) {
  return offlineDb.pages.get(pageId);
}

export async function getLocalNotebooks() {
  const notebooks = await offlineDb.notebooks.toArray();
  const pages = await offlineDb.pages.toArray();

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
  pageId: string,
  syncStatus: SyncStatus,
  lastSyncedAt?: string | null,
) {
  const page = await offlineDb.pages.get(pageId);

  if (!page) {
    return;
  }

  await offlineDb.pages.put({
    ...page,
    syncStatus,
    lastSyncedAt: lastSyncedAt ?? page.lastSyncedAt ?? null,
  });
  dispatchSyncEvent({ type: "page", pageId, syncStatus, lastSyncedAt });
}

export async function enqueuePageUpsert(page: LocalPage, baseUpdatedAt?: string | null) {
  const existing = await offlineDb.queue
    .where("entityId")
    .equals(page.id)
    .and((item) => item.entityType === "page" && item.operation === "upsert")
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

  await updateLocalSyncStatus(page.id, "pending", page.lastSyncedAt ?? null);
}

export async function enqueueNotebookUpsert(
  notebook: LocalNotebook,
  baseUpdatedAt?: string | null,
) {
  const existing = await offlineDb.queue
    .where("entityId")
    .equals(notebook.id)
    .and(
      (item) => item.entityType === "notebook" && item.operation === "upsert",
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
  await offlineDb.queue
    .where("entityId")
    .equals(page.id)
    .and((item) => item.entityType === "page")
    .delete();

  await offlineDb.queue.add({
    entityType: "page",
    entityId: page.id,
    operation: "archive",
    payload: page,
    baseUpdatedAt,
    createdAt: new Date().toISOString(),
    status: "pending",
  });
  await updateLocalSyncStatus(page.id, "pending", page.lastSyncedAt ?? null);
}

export async function enqueueNotebookArchive(
  notebook: LocalNotebook,
  baseUpdatedAt?: string | null,
) {
  await offlineDb.queue
    .where("entityId")
    .equals(notebook.id)
    .and((item) => item.entityType === "notebook")
    .delete();

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

export async function listPendingQueue() {
  return offlineDb.queue.orderBy("createdAt").toArray();
}

export async function applySyncPushResult(result: SyncPushResult) {
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
        await offlineDb.conflicts.put(conflict);
        dispatchSyncEvent({
          type: "page",
          pageId: conflict.entityId,
          syncStatus: "conflict",
          conflict,
        });
      }

      await setLastPullAt(result.pulledAt);
    },
  );
}

export async function fetchBootstrap() {
  const response = await fetch("/api/sync/bootstrap", {
    credentials: "same-origin",
  });

  if (!response.ok) {
    throw new Error("BOOTSTRAP_FAILED");
  }

  return (await response.json()) as SyncBootstrapPayload;
}

export async function fetchPullChanges() {
  const since = await getLastPullAt();
  const response = await fetch(
    `/api/sync/pull${since ? `?since=${encodeURIComponent(since)}` : ""}`,
    {
      credentials: "same-origin",
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

export async function upsertConflictRecords(conflicts: ConflictRecord[]) {
  if (conflicts.length === 0) {
    return;
  }

  await offlineDb.conflicts.bulkPut(conflicts);
}
