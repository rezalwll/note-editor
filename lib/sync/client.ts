"use client";

import {
  applySyncPushResult,
  clearOfflineStateForUser,
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

export async function bootstrapOfflineState(userId: string) {
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    return;
  }

  const payload = await fetchBootstrap();
  await seedOfflineBootstrap(userId, payload);
}

export async function pullRemoteChanges(userId: string) {
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    return;
  }

  const payload = await fetchPullChanges(userId);
  await seedOfflineBootstrap(userId, payload);
  await setLastPullAt(userId, payload.fetchedAt);
}

export async function processSyncQueue(userId: string) {
  if (syncInFlight) {
    return syncInFlight;
  }

  syncInFlight = (async () => {
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      return;
    }

    const queue = await listPendingQueue(userId);

    if (queue.length === 0) {
      await pullRemoteChanges(userId);
      return;
    }

    const result = await pushQueue(queue);
    await applySyncPushResult(userId, result);
    await upsertConflictRecords(userId, result.conflicts);

    for (const page of result.pages) {
      await updateLocalSyncStatus(
        userId,
        page.id,
        page.syncStatus,
        page.lastSyncedAt ?? null,
      );
    }
  })().finally(() => {
    syncInFlight = null;
  });

  return syncInFlight;
}

export async function resetOfflineState(userId: string) {
  await clearOfflineStateForUser(userId);
}
