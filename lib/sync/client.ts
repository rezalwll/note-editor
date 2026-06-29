"use client";

import {
  applyPullChanges,
  applySyncPushResult,
  clearOfflineStateForUser,
  fetchBootstrap,
  fetchPullChanges,
  hasOfflineBootstrap,
  listPendingQueue,
  seedOfflineBootstrap,
  setLastPullAt,
  upsertConflictRecords,
  updateLocalSyncStatus,
  pushQueue,
} from "@/lib/offline-db/client";
import type { SyncStatus } from "@/lib/offline-db/types";

let syncInFlight: Promise<void> | null = null;

function dispatchSyncIndicatorEvent(detail: {
  phase: "start" | "complete" | "error";
  syncStatus?: SyncStatus;
}) {
  if (typeof window === "undefined") {
    return;
  }

  window.dispatchEvent(new CustomEvent("notava-sync", { detail: { type: "global", ...detail } }));
}

export async function bootstrapOfflineState(userId: string) {
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    return;
  }

  if (await hasOfflineBootstrap(userId)) {
    await pullRemoteChanges(userId);
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
  await applyPullChanges(userId, payload);
  await setLastPullAt(userId, payload.fetchedAt);
}

export async function processSyncQueue(userId: string) {
  if (syncInFlight) {
    return syncInFlight;
  }

  syncInFlight = (async () => {
    dispatchSyncIndicatorEvent({ phase: "start", syncStatus: "pending" });

    if (typeof navigator !== "undefined" && !navigator.onLine) {
      dispatchSyncIndicatorEvent({ phase: "error", syncStatus: "failed" });
      return;
    }

    try {
      const queue = await listPendingQueue(userId);

      if (queue.length === 0) {
        await pullRemoteChanges(userId);
        dispatchSyncIndicatorEvent({ phase: "complete", syncStatus: "synced" });
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

      if (result.conflicts.length > 0) {
        dispatchSyncIndicatorEvent({ phase: "error", syncStatus: "conflict" });
        return;
      }

      const remainingQueue = await listPendingQueue(userId);
      const syncStatus = remainingQueue.length > 0 ? "pending" : "synced";

      dispatchSyncIndicatorEvent({ phase: "complete", syncStatus });
    } catch (error) {
      dispatchSyncIndicatorEvent({ phase: "error", syncStatus: "failed" });
      throw error;
    }
  })().finally(() => {
    syncInFlight = null;
  });

  return syncInFlight;
}

export async function resetOfflineState(userId: string) {
  await clearOfflineStateForUser(userId);
}
