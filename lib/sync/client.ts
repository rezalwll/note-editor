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
} from "@/lib/offline-db/client";
import type { SyncStatus } from "@/lib/offline-db/types";
import {
  reportClientError,
  reportClientMetric,
} from "@/lib/client-observability";
import { isPrivateDataWriteSuspended } from "@/lib/private-data-epoch";

const SYNC_PUSH_BATCH_SIZE = 50;
const SYNC_QUIESCE_TIMEOUT_MS = 3_000;
const SYNC_LOCK_PREFIX = "notava-sync";

type UserSyncRuntimeState = {
  generation: number;
  suspended: boolean;
  abortController: AbortController;
  syncInFlight: Promise<void> | null;
  syncRerunRequested: boolean;
  syncRetryCount: number;
  activeOperations: Set<Promise<unknown>>;
  resetInFlight: Promise<void> | null;
};

const userSyncRuntime = new Map<string, UserSyncRuntimeState>();

class SyncSessionInvalidatedError extends Error {
  constructor() {
    super("SYNC_SESSION_INVALIDATED");
    this.name = "SyncSessionInvalidatedError";
  }
}

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

function getUserSyncRuntime(userId: string) {
  const existingState = userSyncRuntime.get(userId);
  if (existingState) {
    return existingState;
  }

  const state: UserSyncRuntimeState = {
    generation: 0,
    suspended: false,
    abortController: new AbortController(),
    syncInFlight: null,
    syncRerunRequested: false,
    syncRetryCount: 0,
    activeOperations: new Set(),
    resetInFlight: null,
  };
  userSyncRuntime.set(userId, state);
  return state;
}

function assertCurrentSession(state: UserSyncRuntimeState, generation: number) {
  if (state.generation !== generation) {
    throw new SyncSessionInvalidatedError();
  }
}

function runWithCrossTabSyncLock<T>(
  userId: string,
  signal: AbortSignal,
  operation: () => Promise<T>,
) {
  if (typeof navigator === "undefined" || !navigator.locks?.request) {
    return operation();
  }

  return navigator.locks.request(
    `${SYNC_LOCK_PREFIX}:${userId}`,
    { mode: "exclusive", signal },
    operation,
  );
}

function trackUserOperation<T>(state: UserSyncRuntimeState, operation: Promise<T>) {
  state.activeOperations.add(operation);
  const removeOperation = () => {
    state.activeOperations.delete(operation);
  };
  void operation.then(removeOperation, removeOperation);
  return operation;
}

async function waitForActiveOperations(
  operations: Promise<unknown>[],
  timeoutMs = SYNC_QUIESCE_TIMEOUT_MS,
) {
  if (operations.length === 0) {
    return;
  }

  let timeout: ReturnType<typeof setTimeout> | undefined;
  const settled = Promise.allSettled(operations).then(() => true);
  const timedOut = new Promise<boolean>((resolve) => {
    timeout = setTimeout(() => resolve(false), timeoutMs);
  });
  const completed = await Promise.race([settled, timedOut]);
  if (timeout) {
    clearTimeout(timeout);
  }
  if (!completed) {
    throw new Error("SYNC_QUIESCE_TIMEOUT");
  }
}

function invalidateUserSync(state: UserSyncRuntimeState, suspend: boolean) {
  if (suspend) {
    state.suspended = true;
  }
  state.generation += 1;
  state.syncRerunRequested = false;
  state.abortController.abort();
  state.abortController = new AbortController();
  return [...state.activeOperations];
}

async function runSessionOperation(
  userId: string,
  operation: (state: UserSyncRuntimeState, generation: number) => Promise<void>,
) {
  const state = getUserSyncRuntime(userId);
  if (state.suspended) {
    return;
  }

  if (state.resetInFlight) {
    await state.resetInFlight;
    return runSessionOperation(userId, operation);
  }

  const generation = state.generation;
  const promise = (async () => {
    try {
      await operation(state, generation);
    } catch (error) {
      if (
        error instanceof SyncSessionInvalidatedError ||
        state.generation !== generation
      ) {
        return;
      }
      throw error;
    }
  })();

  return trackUserOperation(state, promise);
}

export async function bootstrapOfflineState(userId: string) {
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    return;
  }

  return runSessionOperation(userId, async (state, generation) => {
    if (await hasOfflineBootstrap(userId)) {
      assertCurrentSession(state, generation);
      await pullRemoteChangesForSession(userId, state, generation);
      return;
    }

    assertCurrentSession(state, generation);
    let cursor: string | null = null;
    let isFirstPage = true;
    do {
      const payload = await fetchBootstrap(cursor, state.abortController.signal);
      assertCurrentSession(state, generation);
      if (isFirstPage) {
        await seedOfflineBootstrap(userId, payload);
        isFirstPage = false;
      } else {
        await applyPullChanges(userId, payload);
      }
      assertCurrentSession(state, generation);
      cursor = payload.nextCursor ?? null;
      if (!payload.hasMore) break;
      if (!cursor) throw new Error("INVALID_BOOTSTRAP_CURSOR");
    } while (true);
  });
}

export async function pullRemoteChanges(userId: string) {
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    return;
  }

  return runSessionOperation(userId, (state, generation) =>
    pullRemoteChangesForSession(userId, state, generation),
  );
}

async function pullRemoteChangesForSession(
  userId: string,
  state: UserSyncRuntimeState,
  generation: number,
) {
  let cursor: string | null = null;
  do {
    const payload = await fetchPullChanges(
      userId,
      cursor,
      state.abortController.signal,
    );
    assertCurrentSession(state, generation);
    await applyPullChanges(userId, payload);
    assertCurrentSession(state, generation);
    cursor = payload.nextCursor ?? null;
    if (!payload.hasMore) break;
    if (!cursor) throw new Error("INVALID_PULL_CURSOR");
  } while (true);
}

export async function processSyncQueue(userId: string) {
  const state = getUserSyncRuntime(userId);
  if (state.suspended) {
    return;
  }

  if (state.resetInFlight) {
    await state.resetInFlight;
    return processSyncQueue(userId);
  }

  if (state.syncInFlight) {
    state.syncRerunRequested = true;
    state.syncRetryCount += 1;
    return state.syncInFlight;
  }

  const generation = state.generation;
  const operation = (async () => {
    const startedAt = performance.now();
    state.syncRetryCount = 0;
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
      const signal = state.abortController.signal;
      await runWithCrossTabSyncLock(userId, signal, async () => {
        assertCurrentSession(state, generation);

        let syncStatus: SyncStatus = "synced";
        let operationCount = 0;
        let conflictCount = 0;

        do {
          state.syncRerunRequested = false;
          const result = await processSyncQueueOnce(userId, state, generation);
          syncStatus = result.status;
          operationCount += result.operationCount;
          conflictCount += result.conflictCount;
          if (result.status === "conflict" || result.status === "failed") break;
        } while (state.syncRerunRequested || syncStatus === "pending");

        const metadata = {
          latencyMs: Math.round((performance.now() - startedAt) * 100) / 100,
          operationCount,
          conflictCount,
          retryCount: state.syncRetryCount,
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
        if (state.syncRetryCount > 0) {
          reportClientMetric("sync.retries", state.syncRetryCount, {
            source: "sync.client",
            metadata,
          });
        }

        if (syncStatus === "conflict" || syncStatus === "failed") {
          dispatchSyncIndicatorEvent({ phase: "error", syncStatus });
          return;
        }

        dispatchSyncIndicatorEvent({ phase: "complete", syncStatus });
      });
    } catch (error) {
      if (
        error instanceof SyncSessionInvalidatedError ||
        state.generation !== generation
      ) {
        return;
      }
      dispatchSyncIndicatorEvent({ phase: "error", syncStatus: "failed" });
      reportClientMetric("sync.failure", 1, {
        source: "sync.client",
        metadata: {
          latencyMs: Math.round((performance.now() - startedAt) * 100) / 100,
          retryCount: state.syncRetryCount,
        },
      });
      reportClientError(error, {
        source: "sync.client",
        metadata: { retryCount: state.syncRetryCount },
      });
      throw error;
    }
  })();

  const trackedOperation = trackUserOperation(state, operation);
  state.syncInFlight = trackedOperation;
  const clearInFlight = () => {
    if (state.syncInFlight === trackedOperation) {
      state.syncInFlight = null;
    }
  };
  void trackedOperation.then(clearInFlight, clearInFlight);

  return trackedOperation;
}

async function processSyncQueueOnce(
  userId: string,
  state: UserSyncRuntimeState,
  generation: number,
): Promise<SyncPassResult> {
  const queue = await listPendingQueue(userId, SYNC_PUSH_BATCH_SIZE);
  assertCurrentSession(state, generation);

  if (queue.length === 0) {
    await pullRemoteChangesForSession(userId, state, generation);
    return { status: "synced", operationCount: 0, conflictCount: 0 };
  }

  const result = await pushQueue(queue, state.abortController.signal);
  assertCurrentSession(state, generation);
  await applySyncPushResult(userId, result, queue);
  assertCurrentSession(state, generation);

  if (result.conflicts.length > 0) {
    return {
      status: "conflict",
      operationCount: queue.length,
      conflictCount: result.conflicts.length,
    };
  }

  const remainingQueue = await listPendingQueue(userId, 1);
  assertCurrentSession(state, generation);
  return {
    status: remainingQueue.length > 0 ? "pending" : "synced",
    operationCount: queue.length,
    conflictCount: 0,
  };
}

export function activateOfflineSync(userId: string) {
  const state = getUserSyncRuntime(userId);
  if (isPrivateDataWriteSuspended(userId)) {
    state.suspended = true;
    return false;
  }
  state.suspended = false;
  return true;
}

export async function suspendOfflineSync(
  userId: string,
  timeoutMs = SYNC_QUIESCE_TIMEOUT_MS,
) {
  const state = getUserSyncRuntime(userId);
  if (state.resetInFlight) {
    await state.resetInFlight;
  }
  const activeOperations = invalidateUserSync(state, true);
  await waitForActiveOperations(activeOperations, timeoutMs);
}

export function resetOfflineState(
  userId: string,
  options: { suspend?: boolean } = {},
) {
  const state = getUserSyncRuntime(userId);
  if (options.suspend) {
    state.suspended = true;
  }
  if (state.resetInFlight) {
    return state.resetInFlight;
  }

  const activeOperations = invalidateUserSync(state, Boolean(options.suspend));
  const resetOperation = (async () => {
    await waitForActiveOperations(activeOperations);
    await clearOfflineStateForUser(userId);
  })();
  state.resetInFlight = resetOperation;

  const clearReset = () => {
    if (state.resetInFlight === resetOperation) {
      state.resetInFlight = null;
    }
  };
  void resetOperation.then(clearReset, clearReset);
  return resetOperation;
}
