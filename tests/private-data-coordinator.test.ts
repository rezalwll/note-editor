import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  activateSync: vi.fn(),
  closeDatabase: vi.fn(),
  drainMutations: vi.fn(),
  flushDrafts: vi.fn(),
  openDatabase: vi.fn(),
  randomUUID: vi.fn(),
  readStoredRequest: vi.fn(),
  resumeWrites: vi.fn(),
  suspendSync: vi.fn(),
  suspendWrites: vi.fn(),
}));

vi.mock("@/lib/offline-db/db", () => ({
  offlineDb: {
    close: mocks.closeDatabase,
    open: mocks.openDatabase,
  },
}));

vi.mock("@/lib/private-data-epoch", () => ({
  drainPrivateDataMutations: mocks.drainMutations,
  flushPrivateDataDrafts: mocks.flushDrafts,
  PRIVATE_DATA_REQUEST_KEY: "notava-private-data:request",
  PRIVATE_DATA_STORAGE_PREFIX: "notava-private-data:",
  readStoredPrivateDataRequest: mocks.readStoredRequest,
  resumePrivateDataWrites: mocks.resumeWrites,
  suspendPrivateDataWrites: mocks.suspendWrites,
}));

vi.mock("@/lib/sync/client", () => ({
  activateOfflineSync: mocks.activateSync,
  suspendOfflineSync: mocks.suspendSync,
}));

const REQUEST_KEY = "notava-private-data:request";
const EVENT_KEY = "notava-private-data:event";
const TAB_PREFIX = "notava-private-data:tab:";

let cleanups: Array<() => void> = [];

async function loadCoordinator() {
  vi.resetModules();
  return import("@/lib/private-data-coordinator");
}

function arrangeIds() {
  mocks.randomUUID
    .mockReturnValueOnce("tab-local")
    .mockReturnValueOnce("request-1")
    .mockReturnValue("nonce");
}

function dispatchCoordinatorMessage(message: Record<string, string>) {
  window.dispatchEvent(
    new StorageEvent("storage", {
      key: EVENT_KEY,
      newValue: JSON.stringify(message),
    }),
  );
}

async function flushAsyncHandlers() {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

describe("private data cross-tab coordinator", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
    window.localStorage.clear();
    vi.clearAllMocks();
    cleanups = [];
    mocks.openDatabase.mockResolvedValue(undefined);
    mocks.flushDrafts.mockResolvedValue(undefined);
    mocks.suspendSync.mockResolvedValue(undefined);
    mocks.drainMutations.mockResolvedValue(undefined);
    mocks.readStoredRequest.mockImplementation(() => {
      const raw = window.localStorage.getItem(REQUEST_KEY);
      return raw ? JSON.parse(raw) : null;
    });
    vi.stubGlobal("BroadcastChannel", undefined);
    vi.stubGlobal("crypto", { randomUUID: mocks.randomUUID });
    arrangeIds();
  });

  afterEach(() => {
    for (const cleanup of cleanups.reverse()) cleanup();
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    window.localStorage.clear();
  });

  it("fences writes and waits for a stable tab set before preparing deletion", async () => {
    const coordinator = await loadCoordinator();
    cleanups.push(coordinator.registerPrivateDataTab("user-1"));

    const preparing = coordinator.preparePrivateDataClear("user-1");
    await vi.advanceTimersByTimeAsync(50);
    const result = await preparing;

    expect(result).toEqual({
      userId: "user-1",
      requestId: "request-1",
      epoch: "1767225600000:request-1",
    });
    expect(mocks.suspendWrites).toHaveBeenCalledWith(
      "user-1",
      result.epoch,
    );
    expect(mocks.flushDrafts).toHaveBeenCalledOnce();
    expect(mocks.suspendSync).toHaveBeenCalledWith("user-1");
    expect(mocks.drainMutations).toHaveBeenCalledOnce();
    expect(mocks.closeDatabase).not.toHaveBeenCalled();
    expect(JSON.parse(window.localStorage.getItem(REQUEST_KEY) ?? "null")).toMatchObject(
      {
        userId: "user-1",
        requestId: "request-1",
        sourceTabId: "tab-local",
        phase: "suspended",
      },
    );
  });

  it("keeps writes open during the preparing phase until local drafts are clean", async () => {
    let finishDraftFlush!: () => void;
    mocks.flushDrafts.mockReturnValueOnce(
      new Promise<void>((resolve) => {
        finishDraftFlush = resolve;
      }),
    );
    const coordinator = await loadCoordinator();
    cleanups.push(coordinator.registerPrivateDataTab("user-1"));

    const preparing = coordinator.preparePrivateDataClear("user-1");
    await flushAsyncHandlers();

    expect(mocks.suspendWrites).not.toHaveBeenCalled();
    expect(JSON.parse(window.localStorage.getItem(REQUEST_KEY) ?? "null")).toMatchObject(
      { phase: "preparing" },
    );

    finishDraftFlush();
    await flushAsyncHandlers();
    expect(mocks.suspendWrites).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(50);
    await expect(preparing).resolves.toMatchObject({ requestId: "request-1" });
  });

  it("reopens IndexedDB before lifting a cancelled deletion fence", async () => {
    const coordinator = await loadCoordinator();
    cleanups.push(coordinator.registerPrivateDataTab("user-1"));
    const preparing = coordinator.preparePrivateDataClear("user-1");
    await vi.advanceTimersByTimeAsync(50);
    const preparation = await preparing;

    await coordinator.resumePrivateDataClear(preparation);

    expect(mocks.openDatabase).toHaveBeenCalledOnce();
    expect(mocks.resumeWrites).toHaveBeenCalledWith(
      "user-1",
      preparation.epoch,
    );
    expect(mocks.activateSync).toHaveBeenCalledWith("user-1");
    expect(mocks.openDatabase.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.resumeWrites.mock.invocationCallOrder[0],
    );
    expect(window.localStorage.getItem(REQUEST_KEY)).toBeNull();
    expect(JSON.parse(window.localStorage.getItem(EVENT_KEY) ?? "null")).toMatchObject(
      { type: "resume", requestId: "request-1" },
    );
  });

  it("resumes automatically when local mutation draining fails", async () => {
    mocks.drainMutations.mockRejectedValue(new Error("DRAIN_FAILED"));
    const coordinator = await loadCoordinator();
    cleanups.push(coordinator.registerPrivateDataTab("user-1"));

    await expect(
      coordinator.preparePrivateDataClear("user-1"),
    ).rejects.toThrow("DRAIN_FAILED");

    expect(mocks.openDatabase).toHaveBeenCalledOnce();
    expect(mocks.resumeWrites).toHaveBeenCalledOnce();
    expect(mocks.activateSync).toHaveBeenCalledOnce();
    expect(window.localStorage.getItem(REQUEST_KEY)).toBeNull();
  });

  it("suspends a remote tab, closes its database, and emits an ACK", async () => {
    const coordinator = await loadCoordinator();
    cleanups.push(coordinator.registerPrivateDataTab("user-1"));
    const message = {
      type: "suspend",
      userId: "user-1",
      requestId: "remote-request",
      epoch: "remote-epoch",
      sourceTabId: "tab-remote",
    };

    dispatchCoordinatorMessage(message);
    await flushAsyncHandlers();

    expect(mocks.suspendWrites).toHaveBeenCalledWith(
      "user-1",
      "remote-epoch",
    );
    expect(mocks.suspendSync).toHaveBeenCalledWith("user-1");
    expect(mocks.drainMutations).toHaveBeenCalledOnce();
    expect(mocks.closeDatabase).toHaveBeenCalledOnce();
    expect(
      window.localStorage.getItem(
        "notava-private-data:ack:remote-request:tab-local",
      ),
    ).toBe("1");
    expect(JSON.parse(window.localStorage.getItem(EVENT_KEY) ?? "null")).toMatchObject(
      {
        type: "ack",
        requestId: "remote-request",
        sourceTabId: "tab-local",
      },
    );

    dispatchCoordinatorMessage(message);
    await flushAsyncHandlers();
    expect(mocks.suspendSync).toHaveBeenCalledOnce();
    expect(mocks.drainMutations).toHaveBeenCalledOnce();
    expect(mocks.closeDatabase).toHaveBeenCalledOnce();
  });

  it("does not ACK duplicate deliveries before their shared quiescence finishes", async () => {
    let finishDraftFlush!: () => void;
    let finishDrain!: () => void;
    mocks.flushDrafts.mockReturnValueOnce(
      new Promise<void>((resolve) => {
        finishDraftFlush = resolve;
      }),
    );
    mocks.drainMutations.mockReturnValueOnce(
      new Promise<void>((resolve) => {
        finishDrain = resolve;
      }),
    );
    const coordinator = await loadCoordinator();
    cleanups.push(coordinator.registerPrivateDataTab("user-1"));
    const message = {
      type: "suspend",
      userId: "user-1",
      requestId: "duplicate-request",
      epoch: "remote-epoch",
      sourceTabId: "tab-remote",
      phase: "preparing",
    };

    dispatchCoordinatorMessage(message);
    await flushAsyncHandlers();
    dispatchCoordinatorMessage(message);
    await flushAsyncHandlers();

    expect(mocks.flushDrafts).toHaveBeenCalledOnce();
    expect(mocks.suspendSync).not.toHaveBeenCalled();
    expect(mocks.drainMutations).not.toHaveBeenCalled();
    expect(mocks.closeDatabase).not.toHaveBeenCalled();
    expect(
      window.localStorage.getItem(
        "notava-private-data:ack:duplicate-request:tab-local",
      ),
    ).toBeNull();

    finishDraftFlush();
    await flushAsyncHandlers();
    expect(mocks.suspendSync).toHaveBeenCalledOnce();
    expect(mocks.drainMutations).toHaveBeenCalledOnce();
    expect(
      window.localStorage.getItem(
        "notava-private-data:ack:duplicate-request:tab-local",
      ),
    ).toBeNull();

    finishDrain();
    await flushAsyncHandlers();

    expect(mocks.closeDatabase).toHaveBeenCalledOnce();
    expect(
      window.localStorage.getItem(
        "notava-private-data:ack:duplicate-request:tab-local",
      ),
    ).toBe("1");
  });

  it("coordinates origin-wide deletion with tabs authenticated as another user", async () => {
    const coordinator = await loadCoordinator();
    cleanups.push(coordinator.registerPrivateDataTab("user-1"));

    dispatchCoordinatorMessage({
      type: "suspend",
      userId: "user-2",
      requestId: "remote-request",
      epoch: "remote-epoch",
      sourceTabId: "tab-remote",
    });
    await flushAsyncHandlers();

    expect(mocks.suspendWrites).toHaveBeenCalledWith(
      "user-1",
      "remote-epoch",
    );
    expect(mocks.suspendSync).toHaveBeenCalledWith("user-1");
    expect(mocks.closeDatabase).toHaveBeenCalledOnce();
  });

  it("suspends and later resumes a new user tab for a persisted origin-wide request", async () => {
    mocks.readStoredRequest.mockReturnValue({
      userId: "user-1",
      requestId: "persisted-request",
      epoch: "persisted-epoch",
      sourceTabId: "tab-old-user",
      expiresAt: Date.now() + 10_000,
      phase: "suspended",
    });
    const coordinator = await loadCoordinator();
    cleanups.push(coordinator.registerPrivateDataTab("user-2"));
    await flushAsyncHandlers();

    expect(mocks.suspendWrites).toHaveBeenCalledWith(
      "user-2",
      "persisted-epoch",
    );
    expect(mocks.flushDrafts).not.toHaveBeenCalled();
    expect(mocks.suspendSync).toHaveBeenCalledWith("user-2");
    expect(mocks.closeDatabase).toHaveBeenCalledOnce();

    dispatchCoordinatorMessage({
      type: "resume",
      userId: "user-1",
      requestId: "persisted-request",
      epoch: "persisted-epoch",
      sourceTabId: "tab-old-user",
    });
    await flushAsyncHandlers();

    expect(mocks.openDatabase).toHaveBeenCalledOnce();
    expect(mocks.resumeWrites).toHaveBeenCalledWith(
      "user-2",
      "persisted-epoch",
    );
    expect(mocks.activateSync).toHaveBeenCalledWith("user-2");
  });

  it("reopens a remotely suspended tab when the source cancels logout", async () => {
    const coordinator = await loadCoordinator();
    cleanups.push(coordinator.registerPrivateDataTab("user-1"));
    dispatchCoordinatorMessage({
      type: "resume",
      userId: "user-1",
      requestId: "remote-request",
      epoch: "remote-epoch",
      sourceTabId: "tab-remote",
    });
    await flushAsyncHandlers();

    expect(mocks.openDatabase).toHaveBeenCalledOnce();
    expect(mocks.resumeWrites).toHaveBeenCalledWith(
      "user-1",
      "remote-epoch",
    );
    expect(mocks.activateSync).toHaveBeenCalledWith("user-1");
    expect(mocks.openDatabase.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.activateSync.mock.invocationCallOrder[0],
    );
  });

  it("does not close or ACK after a resume cancels in-flight quiescence", async () => {
    let finishDrain!: () => void;
    mocks.drainMutations.mockReturnValueOnce(
      new Promise<void>((resolve) => {
        finishDrain = resolve;
      }),
    );
    const coordinator = await loadCoordinator();
    cleanups.push(coordinator.registerPrivateDataTab("user-1"));
    dispatchCoordinatorMessage({
      type: "suspend",
      userId: "user-1",
      requestId: "cancelled-request",
      epoch: "remote-epoch",
      sourceTabId: "tab-remote",
      phase: "preparing",
    });
    await flushAsyncHandlers();

    dispatchCoordinatorMessage({
      type: "resume",
      userId: "user-1",
      requestId: "cancelled-request",
      epoch: "remote-epoch",
      sourceTabId: "tab-remote",
    });
    await flushAsyncHandlers();
    finishDrain();
    await flushAsyncHandlers();

    expect(mocks.closeDatabase).not.toHaveBeenCalled();
    expect(mocks.openDatabase).toHaveBeenCalled();
    expect(mocks.resumeWrites).toHaveBeenCalledWith("user-1", "remote-epoch");
    expect(
      window.localStorage.getItem(
        "notava-private-data:ack:cancelled-request:tab-local",
      ),
    ).toBeNull();
  });

  it("times out and reopens local state when a live remote tab never ACKs", async () => {
    const coordinator = await loadCoordinator();
    cleanups.push(coordinator.registerPrivateDataTab("user-1"));
    window.localStorage.setItem(
      `${TAB_PREFIX}tab-remote`,
      JSON.stringify({ userId: "user-1", lastSeenAt: Date.now() }),
    );

    const preparing = coordinator.preparePrivateDataClear("user-1");
    const rejected = expect(preparing).rejects.toThrow(
      "CROSS_TAB_SUSPEND_TIMEOUT",
    );
    await vi.advanceTimersByTimeAsync(4_050);
    await rejected;

    expect(mocks.openDatabase).toHaveBeenCalledOnce();
    expect(mocks.resumeWrites).toHaveBeenCalledOnce();
    expect(mocks.activateSync).toHaveBeenCalledOnce();
    expect(window.localStorage.getItem(REQUEST_KEY)).toBeNull();
  });

  it("removes stale leases and requires an ACK from every live origin tab", async () => {
    const coordinator = await loadCoordinator();
    cleanups.push(coordinator.registerPrivateDataTab("user-1"));
    window.localStorage.setItem(
      `${TAB_PREFIX}stale-tab`,
      JSON.stringify({ userId: "user-1", lastSeenAt: Date.now() - 20_000 }),
    );
    window.localStorage.setItem(
      `${TAB_PREFIX}other-user-tab`,
      JSON.stringify({ userId: "user-2", lastSeenAt: Date.now() }),
    );
    window.localStorage.setItem(
      "notava-private-data:ack:request-1:other-user-tab",
      "1",
    );

    const preparing = coordinator.preparePrivateDataClear("user-1");
    await vi.advanceTimersByTimeAsync(50);
    await expect(preparing).resolves.toMatchObject({ requestId: "request-1" });

    expect(window.localStorage.getItem(`${TAB_PREFIX}stale-tab`)).toBeNull();
    expect(
      window.localStorage.getItem(`${TAB_PREFIX}other-user-tab`),
    ).not.toBeNull();
  });

  it("fails closed when localStorage cannot coordinate active tabs", async () => {
    const setItem = vi
      .spyOn(Storage.prototype, "setItem")
      .mockImplementation(() => {
        throw new Error("STORAGE_BLOCKED");
      });
    const coordinator = await loadCoordinator();
    const cleanup = coordinator.registerPrivateDataTab("user-1");

    await expect(
      coordinator.preparePrivateDataClear("user-1"),
    ).rejects.toThrow("CROSS_TAB_COORDINATION_UNAVAILABLE");

    cleanup();
    setItem.mockRestore();
  });

  it("cleans up the source registration after deletion completes", async () => {
    const coordinator = await loadCoordinator();
    cleanups.push(coordinator.registerPrivateDataTab("user-1"));
    const preparing = coordinator.preparePrivateDataClear("user-1");
    await vi.advanceTimersByTimeAsync(50);
    const preparation = await preparing;

    coordinator.completePrivateDataClear(preparation);

    expect(window.localStorage.getItem(REQUEST_KEY)).toBeNull();
    expect(window.localStorage.getItem(`${TAB_PREFIX}tab-local`)).toBeNull();
    expect(JSON.parse(window.localStorage.getItem(EVENT_KEY) ?? "null")).toMatchObject(
      { type: "complete", requestId: "request-1" },
    );
  });
});
