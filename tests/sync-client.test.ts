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
  setLastPullAt: vi.fn(),
  upsertConflictRecords: vi.fn(),
  updateLocalSyncStatus: vi.fn(),
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

describe("processSyncQueue", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    Object.defineProperty(navigator, "onLine", {
      configurable: true,
      value: true,
    });
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
    mocks.setLastPullAt.mockResolvedValue(undefined);
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
    mocks.upsertConflictRecords.mockResolvedValue(undefined);
    mocks.updateLocalSyncStatus.mockResolvedValue(undefined);

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
    expect(mocks.pushQueue).toHaveBeenCalledWith([pendingItem]);
    expect(mocks.updateLocalSyncStatus).toHaveBeenCalledWith(
      "user-1",
      "page-1",
      "synced",
      "2026-06-30T00:00:01.000Z",
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
});
