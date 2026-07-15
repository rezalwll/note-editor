"use client";

import {
  applyPullChanges,
  applySyncPushResult,
  clearOfflineStateForUser,
  fetchBootstrap,
  fetchPullChanges,
  hasOfflineBootstrap,
  listPendingQueue,
  pushQueue,
  seedOfflineBootstrap,
  setLastPullAt,
  upsertConflictRecords,
  updateLocalSyncStatus,
} from "@/lib/offline-db/client";
import type { SyncStatus } from "@/lib/offline-db/types";
import {
  reportClientError,
  reportClientMetric,
} from "@/lib/client-observability";

let syncInFlight: Promise<void> | null = null;
let syncRerunRequested = false;
let syncRetryCount = 0;

type SyncPassResult = {
  status: SyncStatus;
  operationCount: number;
  conflictCount: number;
};

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
    syncRerunRequested = true;
    syncRetryCount += 1;
    return syncInFlight;
  }

  syncInFlight = (async () => {
    const startedAt = performance.now();
    syncRetryCount = 0;
    dispatchSyncIndicatorEvent({ phase: "start", syncStatus: "pending" });

    if (typeof navigator !== "undefined" && !navigator.onLine) {
      dispatchSyncIndicatorEvent({ phase: "error", syncStatus: "failed" });
      reportClientMetric("sync.failure", 1, {
        source: "sync.client",
        metadata: { reason: "offline" },
      });
      return;
    }

    try {
      let syncStatus: SyncStatus = "synced";
      let operationCount = 0;
      let conflictCount = 0;

      do {
        syncRerunRequested = false;
        const result = await processSyncQueueOnce(userId);
        syncStatus = result.status;
        operationCount += result.operationCount;
        conflictCount += result.conflictCount;
      } while (syncRerunRequested);

      const metadata = {
        latencyMs: Math.round((performance.now() - startedAt) * 100) / 100,
        operationCount,
        conflictCount,
        retryCount: syncRetryCount,
        status: syncStatus,
      };
      reportClientMetric("sync.duration", metadata.latencyMs, {
        source: "sync.client",
        metadata: { ...metadata, unit: "ms" },
      });
      reportClientMetric("sync.operations", operationCount, {
        source: "sync.client",
        metadata,
      });
      if (conflictCount > 0) {
        reportClientMetric("sync.conflicts", conflictCount, {
          source: "sync.client",
          metadata,
        });
      }
      if (syncRetryCount > 0) {
        reportClientMetric("sync.retries", syncRetryCount, {
          source: "sync.client",
          metadata,
        });
      }

      if (syncStatus === "conflict" || syncStatus === "failed") {
        dispatchSyncIndicatorEvent({ phase: "error", syncStatus });
        return;
      }

      dispatchSyncIndicatorEvent({ phase: "complete", syncStatus });
    } catch (error) {
      dispatchSyncIndicatorEvent({ phase: "error", syncStatus: "failed" });
      reportClientMetric("sync.failure", 1, {
        source: "sync.client",
        metadata: {
          latencyMs: Math.round((performance.now() - startedAt) * 100) / 100,
          retryCount: syncRetryCount,
        },
      });
      reportClientError(error, {
        source: "sync.client",
        metadata: { retryCount: syncRetryCount },
      });
      throw error;
    }
  })().finally(() => {
    syncInFlight = null;
  });

  return syncInFlight;
}

async function processSyncQueueOnce(userId: string): Promise<SyncPassResult> {
  const queue = await listPendingQueue(userId);

  if (queue.length === 0) {
    await pullRemoteChanges(userId);
    return { status: "synced", operationCount: 0, conflictCount: 0 };
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
    return {
      status: "conflict",
      operationCount: queue.length,
      conflictCount: result.conflicts.length,
    };
  }

  const remainingQueue = await listPendingQueue(userId);
  return {
    status: remainingQueue.length > 0 ? "pending" : "synced",
    operationCount: queue.length,
    conflictCount: 0,
  };
}

export async function resetOfflineState(userId: string) {
  await clearOfflineStateForUser(userId);
}
