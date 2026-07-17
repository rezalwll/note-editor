import { beforeEach, describe, expect, it, vi } from "vitest";

import type { SyncQueueItem } from "@/lib/offline-db/types";

const mocks = vi.hoisted(() => ({
  applyPullChanges: vi.fn(),
  applySyncPushResult: vi.fn(),
  clearOfflineStateForUser: vi.fn(),
  fetchBootstrap: vi.fn(),
  fetchPullChanges: vi.fn(),
  hasOfflineBootstrap: vi.fn(),
  listPendingQueue: vi.fn(),
  pushQueue: vi.fn(),
  seedOfflineBootstrap: vi.fn(),
}));

vi.mock("@/lib/offline-db/client", () => mocks);

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });

  return { promise, resolve, reject };
}

async function flushMicrotasks() {
  await Promise.resolve();
  await Promise.resolve();
}

function installExclusiveLockManager() {
  type PendingLockRequest = {
    callback: (lock: Lock) => Promise<unknown> | unknown;
    reject: (reason?: unknown) => void;
    resolve: (value: unknown) => void;
    signal?: AbortSignal;
    aborted: boolean;
    abortHandler?: () => void;
  };

  const heldLocks = new Set<string>();
  const pendingLocks = new Map<string, PendingLockRequest[]>();

  const drain = (name: string) => {
    if (heldLocks.has(name)) {
      return;
    }

    const queue = pendingLocks.get(name);
    const next = queue?.shift();
    if (!next) {
      pendingLocks.delete(name);
      return;
    }

    if (next.aborted || next.signal?.aborted) {
      drain(name);
      return;
    }

    heldLocks.add(name);
    if (next.signal && next.abortHandler) {
      next.signal.removeEventListener("abort", next.abortHandler);
    }

    void Promise.resolve()
      .then(() => next.callback({ name, mode: "exclusive" } as Lock))
      .then(next.resolve, next.reject)
      .finally(() => {
        heldLocks.delete(name);
        drain(name);
      });
  };

  const request = vi.fn(
    (
      name: string,
      options: LockOptions,
      callback: (lock: Lock) => Promise<unknown> | unknown,
    ) =>
      new Promise<unknown>((resolve, reject) => {
        const entry: PendingLockRequest = {
          callback,
          reject,
          resolve,
          signal: options.signal,
          aborted: false,
        };
        entry.abortHandler = () => {
          if (entry.aborted) {
            return;
          }
          entry.aborted = true;
          reject(new DOMException("Aborted", "AbortError"));
          drain(name);
        };
        if (entry.signal?.aborted) {
          entry.abortHandler();
          return;
        }
        entry.signal?.addEventListener("abort", entry.abortHandler, { once: true });

        const queue = pendingLocks.get(name) ?? [];
        queue.push(entry);
        pendingLocks.set(name, queue);
        drain(name);
      }),
  );

  Object.defineProperty(navigator, "locks", {
    configurable: true,
    value: { request },
  });

  return { request };
}

describe("processSyncQueue", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    window.localStorage.clear();
    Object.defineProperty(navigator, "onLine", {
      configurable: true,
      value: true,
    });
    Object.defineProperty(navigator, "locks", {
      configurable: true,
      value: undefined,
    });
  });

  it("requests a user-scoped exclusive browser lock for the complete sync pass", async () => {
    const { request } = installExclusiveLockManager();
    const pullPayload = {
      fetchedAt: "2026-07-15T10:00:01.000Z",
      notebooks: [] as const,
      pages: [] as const,
      tombstones: [] as const,
      hasMore: false as const,
      nextCursor: null,
    };
    mocks.listPendingQueue.mockResolvedValue([]);
    mocks.fetchPullChanges.mockResolvedValue(pullPayload);
    mocks.applyPullChanges.mockResolvedValue(undefined);

    const { processSyncQueue } = await import("@/lib/sync/client");
    await processSyncQueue("user-1");

    expect(request).toHaveBeenCalledTimes(1);
    expect(request).toHaveBeenCalledWith(
      "notava-sync:user-1",
      {
        mode: "exclusive",
        signal: expect.any(AbortSignal),
      },
      expect.any(Function),
    );
    expect(mocks.applyPullChanges).toHaveBeenCalledWith("user-1", pullPayload);
  });

  it("serializes the full sync critical section across independent tab runtimes", async () => {
    installExclusiveLockManager();
    const firstPull = createDeferred<{
      fetchedAt: string;
      notebooks: [];
      pages: [];
      tombstones: [];
      hasMore: false;
      nextCursor: null;
    }>();
    const secondPull = {
      fetchedAt: "2026-07-15T10:00:02.000Z",
      notebooks: [] as const,
      pages: [] as const,
      tombstones: [] as const,
      hasMore: false as const,
      nextCursor: null,
    };
    mocks.listPendingQueue.mockResolvedValue([]);
    mocks.fetchPullChanges
      .mockReturnValueOnce(firstPull.promise)
      .mockResolvedValueOnce(secondPull);
    mocks.applyPullChanges.mockResolvedValue(undefined);

    const firstTab = await import("@/lib/sync/client");
    const firstSync = firstTab.processSyncQueue("user-1");
    await flushMicrotasks();
    await flushMicrotasks();
    expect(mocks.fetchPullChanges).toHaveBeenCalledTimes(1);

    vi.resetModules();
    const secondTab = await import("@/lib/sync/client");
    const secondSync = secondTab.processSyncQueue("user-1");
    await flushMicrotasks();
    await flushMicrotasks();

    expect(mocks.listPendingQueue).toHaveBeenCalledTimes(1);
    expect(mocks.fetchPullChanges).toHaveBeenCalledTimes(1);

    firstPull.resolve({
      fetchedAt: "2026-07-15T10:00:01.000Z",
      notebooks: [],
      pages: [],
      tombstones: [],
      hasMore: false,
      nextCursor: null,
    });
    await firstSync;
    await secondSync;

    expect(mocks.listPendingQueue).toHaveBeenCalledTimes(2);
    expect(mocks.fetchPullChanges).toHaveBeenCalledTimes(2);
    expect(mocks.applyPullChanges).toHaveBeenNthCalledWith(
      2,
      "user-1",
      secondPull,
    );
  });

  it("aborts a tab that is waiting for the sync lock when its session is suspended", async () => {
    installExclusiveLockManager();
    const firstPull = createDeferred<{
      fetchedAt: string;
      notebooks: [];
      pages: [];
      tombstones: [];
      hasMore: false;
      nextCursor: null;
    }>();
    mocks.listPendingQueue.mockResolvedValue([]);
    mocks.fetchPullChanges.mockReturnValue(firstPull.promise);
    mocks.applyPullChanges.mockResolvedValue(undefined);

    const firstTab = await import("@/lib/sync/client");
    const firstSync = firstTab.processSyncQueue("user-1");
    await flushMicrotasks();
    await flushMicrotasks();
    expect(mocks.fetchPullChanges).toHaveBeenCalledTimes(1);

    vi.resetModules();
    const secondTab = await import("@/lib/sync/client");
    const waitingSync = secondTab.processSyncQueue("user-1");
    await flushMicrotasks();
    expect(mocks.listPendingQueue).toHaveBeenCalledTimes(1);

    await secondTab.suspendOfflineSync("user-1");
    await waitingSync;
    expect(mocks.listPendingQueue).toHaveBeenCalledTimes(1);

    firstPull.resolve({
      fetchedAt: "2026-07-15T10:00:01.000Z",
      notebooks: [],
      pages: [],
      tombstones: [],
      hasMore: false,
      nextCursor: null,
    });
    await firstSync;
    expect(mocks.fetchPullChanges).toHaveBeenCalledTimes(1);
  });

  it("runs one more sync pass when a save is queued during an in-flight sync", async () => {
    const observabilityEvents: Array<{
      kind: string;
      name: string;
      value?: number;
      metadata?: Record<string, unknown>;
    }> = [];
    const handleObservability = (event: Event) => {
      observabilityEvents.push((event as CustomEvent).detail);
    };
    window.addEventListener("notava-observability", handleObservability);
    const pull = createDeferred<{
      fetchedAt: string;
      notebooks: [];
      pages: [];
    }>();
    const pendingItem: SyncQueueItem = {
      id: 1,
      userId: "user-1",
      entityType: "page",
      entityId: "page-1",
      operation: "upsert",
      payload: {
        id: "page-1",
        userId: "user-1",
        notebookId: "notebook-1",
        title: "آموزش بیلد کانکتور",
        bodyHtml: "",
        bodyText: "",
        archived: false,
        updatedAt: "2026-06-30T00:00:00.000Z",
        syncStatus: "pending",
      },
      createdAt: "2026-06-30T00:00:00.000Z",
      status: "pending",
    };

    mocks.listPendingQueue
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([pendingItem])
      .mockResolvedValueOnce([]);
    mocks.fetchPullChanges.mockReturnValueOnce(pull.promise);
    mocks.applyPullChanges.mockResolvedValue(undefined);
    mocks.pushQueue.mockResolvedValue({
      applied: [
        {
          queueId: 1,
          entityType: "page",
          entityId: "page-1",
          operation: "upsert",
        },
      ],
      conflicts: [],
      notebooks: [],
      pages: [
        {
          id: "page-1",
          userId: "user-1",
          notebookId: "notebook-1",
          title: "آموزش بیلد کانکتور",
          bodyHtml: "",
          bodyText: "",
          archived: false,
          updatedAt: "2026-06-30T00:00:01.000Z",
          lastSyncedAt: "2026-06-30T00:00:01.000Z",
          deletedAt: null,
          syncStatus: "synced",
        },
      ],
      pulledAt: "2026-06-30T00:00:01.000Z",
    });
    mocks.applySyncPushResult.mockResolvedValue(undefined);

    const { processSyncQueue } = await import("@/lib/sync/client");
    const firstSync = processSyncQueue("user-1");

    await flushMicrotasks();
    expect(mocks.fetchPullChanges).toHaveBeenCalledTimes(1);

    const secondSync = processSyncQueue("user-1");
    pull.resolve({
      fetchedAt: "2026-06-30T00:00:00.500Z",
      notebooks: [],
      pages: [],
    });

    await firstSync;
    await secondSync;

    expect(mocks.pushQueue).toHaveBeenCalledTimes(1);
    expect(mocks.pushQueue).toHaveBeenCalledWith(
      [pendingItem],
      expect.any(AbortSignal),
    );
    expect(mocks.applySyncPushResult).toHaveBeenCalledWith(
      "user-1",
      expect.objectContaining({ pages: [expect.objectContaining({ id: "page-1" })] }),
      [pendingItem],
    );
    expect(observabilityEvents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "sync.operations", value: 1 }),
        expect.objectContaining({ name: "sync.retries", value: 1 }),
        expect.objectContaining({ name: "sync.duration" }),
      ]),
    );
    window.removeEventListener("notava-observability", handleObservability);
  });

  it("consumes every bootstrap page before marking initialization complete", async () => {
    mocks.hasOfflineBootstrap.mockResolvedValue(false);
    mocks.fetchBootstrap
      .mockResolvedValueOnce({
        fetchedAt: "2026-07-15T10:00:00.000Z",
        notebooks: [{ id: "notebook-1" }],
        pages: [],
        tombstones: [],
        hasMore: true,
        nextCursor: "cursor-2",
      })
      .mockResolvedValueOnce({
        fetchedAt: "2026-07-15T10:00:00.000Z",
        notebooks: [],
        pages: [{ id: "page-1" }],
        tombstones: [],
        hasMore: false,
        nextCursor: null,
      });
    mocks.seedOfflineBootstrap.mockResolvedValue(undefined);
    mocks.applyPullChanges.mockResolvedValue(undefined);

    const { bootstrapOfflineState } = await import("@/lib/sync/client");
    await bootstrapOfflineState("user-1");

    expect(mocks.fetchBootstrap).toHaveBeenNthCalledWith(
      1,
      null,
      expect.any(AbortSignal),
    );
    expect(mocks.fetchBootstrap).toHaveBeenNthCalledWith(
      2,
      "cursor-2",
      expect.any(AbortSignal),
    );
    expect(mocks.seedOfflineBootstrap).toHaveBeenCalledTimes(1);
    expect(mocks.applyPullChanges).toHaveBeenCalledTimes(1);
  });

  it("drains a large queue through bounded push batches", async () => {
    const firstItem = {
      id: 1,
      userId: "user-1",
      entityType: "page" as const,
      entityId: "page-1",
      operation: "upsert" as const,
      payload: { userId: "user-1" },
      createdAt: "2026-07-15T10:00:00.000Z",
      status: "pending" as const,
    };
    const secondItem = { ...firstItem, id: 2, entityId: "page-2" };
    mocks.listPendingQueue
      .mockResolvedValueOnce([firstItem])
      .mockResolvedValueOnce([secondItem])
      .mockResolvedValueOnce([secondItem])
      .mockResolvedValueOnce([]);
    mocks.pushQueue
      .mockResolvedValueOnce({
        applied: [{ ...firstItem, queueId: 1 }],
        conflicts: [],
        notebooks: [],
        pages: [],
        pulledAt: "2026-07-15T10:00:01.000Z",
      })
      .mockResolvedValueOnce({
        applied: [{ ...secondItem, queueId: 2 }],
        conflicts: [],
        notebooks: [],
        pages: [],
        pulledAt: "2026-07-15T10:00:02.000Z",
      });
    mocks.applySyncPushResult.mockResolvedValue(undefined);

    const { processSyncQueue } = await import("@/lib/sync/client");
    await processSyncQueue("user-1");

    expect(mocks.pushQueue).toHaveBeenNthCalledWith(
      1,
      [firstItem],
      expect.any(AbortSignal),
    );
    expect(mocks.pushQueue).toHaveBeenNthCalledWith(
      2,
      [secondItem],
      expect.any(AbortSignal),
    );
    expect(mocks.listPendingQueue).toHaveBeenCalledWith("user-1", 50);
    expect(mocks.listPendingQueue).toHaveBeenCalledWith("user-1", 1);
  });

  it("lets another user sync independently while the first user's pull is in flight", async () => {
    const firstUserPull = createDeferred<{
      fetchedAt: string;
      notebooks: [];
      pages: [];
      tombstones: [];
      hasMore: false;
      nextCursor: null;
    }>();
    const secondUserPayload = {
      fetchedAt: "2026-07-15T10:00:02.000Z",
      notebooks: [] as const,
      pages: [] as const,
      tombstones: [] as const,
      hasMore: false as const,
      nextCursor: null,
    };
    mocks.listPendingQueue.mockResolvedValue([]);
    mocks.fetchPullChanges.mockImplementation((requestedUserId: string) =>
      requestedUserId === "user-a"
        ? firstUserPull.promise
        : Promise.resolve(secondUserPayload),
    );
    mocks.applyPullChanges.mockResolvedValue(undefined);

    const { processSyncQueue } = await import("@/lib/sync/client");
    const firstSync = processSyncQueue("user-a");
    await flushMicrotasks();
    expect(mocks.fetchPullChanges).toHaveBeenCalledWith(
      "user-a",
      null,
      expect.any(AbortSignal),
    );

    const secondSync = processSyncQueue("user-b");
    await flushMicrotasks();
    await flushMicrotasks();

    expect(mocks.fetchPullChanges).toHaveBeenCalledWith(
      "user-b",
      null,
      expect.any(AbortSignal),
    );
    expect(mocks.applyPullChanges).toHaveBeenCalledWith("user-b", secondUserPayload);

    firstUserPull.resolve({
      fetchedAt: "2026-07-15T10:00:01.000Z",
      notebooks: [],
      pages: [],
      tombstones: [],
      hasMore: false,
      nextCursor: null,
    });
    await Promise.all([firstSync, secondSync]);
  });

  it("does not apply a late pull response after that user's offline state is reset", async () => {
    const pull = createDeferred<{
      fetchedAt: string;
      notebooks: [];
      pages: [];
      tombstones: [];
      hasMore: false;
      nextCursor: null;
    }>();
    mocks.fetchPullChanges.mockReturnValue(pull.promise);
    mocks.clearOfflineStateForUser.mockResolvedValue(undefined);

    const { pullRemoteChanges, resetOfflineState } = await import("@/lib/sync/client");
    const pullOperation = pullRemoteChanges("user-1");
    expect(mocks.fetchPullChanges).toHaveBeenCalledWith(
      "user-1",
      null,
      expect.any(AbortSignal),
    );

    const resetOperation = resetOfflineState("user-1");
    pull.resolve({
      fetchedAt: "2026-07-15T10:00:01.000Z",
      notebooks: [],
      pages: [],
      tombstones: [],
      hasMore: false,
      nextCursor: null,
    });
    await Promise.all([pullOperation, resetOperation]);

    expect(mocks.applyPullChanges).not.toHaveBeenCalled();
    expect(mocks.clearOfflineStateForUser).toHaveBeenCalledOnce();
    expect(mocks.clearOfflineStateForUser).toHaveBeenCalledWith("user-1");
  });

  it("does not apply a late push acknowledgement after reset", async () => {
    const pendingItem: SyncQueueItem = {
      id: 1,
      userId: "user-1",
      entityType: "page",
      entityId: "page-1",
      operation: "upsert",
      payload: { id: "page-1", userId: "user-1" },
      createdAt: "2026-07-15T10:00:00.000Z",
      status: "pending",
    };
    const push = createDeferred<{
      applied: [];
      conflicts: [];
      notebooks: [];
      pages: [];
      tombstones: [];
      pulledAt: string;
    }>();
    mocks.listPendingQueue.mockResolvedValue([pendingItem]);
    mocks.pushQueue.mockReturnValue(push.promise);
    mocks.clearOfflineStateForUser.mockResolvedValue(undefined);

    const { processSyncQueue, resetOfflineState } = await import("@/lib/sync/client");
    const syncOperation = processSyncQueue("user-1");
    await flushMicrotasks();
    await flushMicrotasks();
    expect(mocks.pushQueue).toHaveBeenCalledWith(
      [pendingItem],
      expect.any(AbortSignal),
    );

    const resetOperation = resetOfflineState("user-1");
    push.resolve({
      applied: [],
      conflicts: [],
      notebooks: [],
      pages: [],
      tombstones: [],
      pulledAt: "2026-07-15T10:00:01.000Z",
    });
    await Promise.all([syncOperation, resetOperation]);

    expect(mocks.applySyncPushResult).not.toHaveBeenCalled();
    expect(mocks.clearOfflineStateForUser).toHaveBeenCalledWith("user-1");
  });

  it("keeps a logged-out user's sync suspended until a new authenticated runtime activates it", async () => {
    mocks.clearOfflineStateForUser.mockResolvedValue(undefined);
    mocks.listPendingQueue.mockResolvedValue([]);
    mocks.fetchPullChanges.mockResolvedValue({
      fetchedAt: "2026-07-15T10:00:01.000Z",
      notebooks: [],
      pages: [],
      tombstones: [],
      hasMore: false,
      nextCursor: null,
    });
    mocks.applyPullChanges.mockResolvedValue(undefined);

    const {
      activateOfflineSync,
      processSyncQueue,
      resetOfflineState,
    } = await import("@/lib/sync/client");
    await resetOfflineState("user-1", { suspend: true });
    await processSyncQueue("user-1");

    expect(mocks.listPendingQueue).not.toHaveBeenCalled();

    activateOfflineSync("user-1");
    await processSyncQueue("user-1");

    expect(mocks.listPendingQueue).toHaveBeenCalledWith("user-1", 50);
    expect(mocks.fetchPullChanges).toHaveBeenCalledWith(
      "user-1",
      null,
      expect.any(AbortSignal),
    );
  });

  it("aborts an outstanding pull before clearing offline state", async () => {
    let requestSignal: AbortSignal | undefined;
    mocks.fetchPullChanges.mockImplementation(
      (_userId: string, _cursor: string | null, signal: AbortSignal) => {
        requestSignal = signal;
        return new Promise((_resolve, reject) => {
          signal.addEventListener("abort", () => {
            reject(new DOMException("Aborted", "AbortError"));
          });
        });
      },
    );
    mocks.clearOfflineStateForUser.mockResolvedValue(undefined);

    const { pullRemoteChanges, resetOfflineState } = await import("@/lib/sync/client");
    const pullOperation = pullRemoteChanges("user-1");
    expect(requestSignal?.aborted).toBe(false);

    await resetOfflineState("user-1");
    await pullOperation;

    expect(requestSignal?.aborted).toBe(true);
    expect(mocks.applyPullChanges).not.toHaveBeenCalled();
    expect(mocks.clearOfflineStateForUser).toHaveBeenCalledWith("user-1");
  });
});
