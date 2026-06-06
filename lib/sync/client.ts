"use client";

import {
  applySyncPushResult,
  fetchBootstrap,
  fetchPullChanges,
  listPendingQueue,
  seedOfflineBootstrap,
  setLastPullAt,
  upsertConflictRecords,
  updateLocalSyncStatus,
  pushQueue,
} from "@/lib/offline-db/client";

let syncInFlight: Promise<void> | null = null;

export async function bootstrapOfflineState() {
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    return;
  }

  const payload = await fetchBootstrap();
  await seedOfflineBootstrap(payload);
}

export async function pullRemoteChanges() {
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    return;
  }

  const payload = await fetchPullChanges();
  await seedOfflineBootstrap(payload);
  await setLastPullAt(payload.fetchedAt);
}

export async function processSyncQueue() {
  if (syncInFlight) {
    return syncInFlight;
  }

  syncInFlight = (async () => {
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      return;
    }

    const queue = await listPendingQueue();

    if (queue.length === 0) {
      await pullRemoteChanges();
      return;
    }

    const result = await pushQueue(queue);
    await applySyncPushResult(result);
    await upsertConflictRecords(result.conflicts);

    for (const page of result.pages) {
      await updateLocalSyncStatus(page.id, page.syncStatus, page.lastSyncedAt ?? null);
    }
  })().finally(() => {
    syncInFlight = null;
  });

  return syncInFlight;
}
