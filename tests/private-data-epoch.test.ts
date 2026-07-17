import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

async function loadEpochModule() {
  vi.resetModules();
  return import("@/lib/private-data-epoch");
}

describe("private data write epoch", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("reads a valid persisted request and removes an expired one", async () => {
    const epoch = await loadEpochModule();
    const validRequest = {
      userId: "user-1",
      requestId: "request-1",
      epoch: "epoch-1",
      sourceTabId: "tab-1",
      expiresAt: Date.now() + 1_000,
      phase: "preparing" as const,
    };
    window.localStorage.setItem(
      epoch.PRIVATE_DATA_REQUEST_KEY,
      JSON.stringify(validRequest),
    );

    expect(epoch.readStoredPrivateDataRequest()).toEqual(validRequest);

    window.localStorage.setItem(
      epoch.PRIVATE_DATA_REQUEST_KEY,
      JSON.stringify({ ...validRequest, expiresAt: Date.now() - 1 }),
    );
    expect(epoch.readStoredPrivateDataRequest()).toBeNull();
    expect(
      window.localStorage.getItem(epoch.PRIVATE_DATA_REQUEST_KEY),
    ).toBeNull();
  });

  it("rejects malformed, incomplete, and inaccessible persisted requests", async () => {
    const epoch = await loadEpochModule();

    window.localStorage.setItem(epoch.PRIVATE_DATA_REQUEST_KEY, "not-json");
    expect(epoch.readStoredPrivateDataRequest()).toBeNull();

    window.localStorage.setItem(
      epoch.PRIVATE_DATA_REQUEST_KEY,
      JSON.stringify({ userId: "user-1" }),
    );
    expect(epoch.readStoredPrivateDataRequest()).toBeNull();

    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("STORAGE_BLOCKED");
    });
    expect(epoch.readStoredPrivateDataRequest()).toBeNull();
  });

  it("keeps writes suspended until the matching epoch resumes them", async () => {
    const epoch = await loadEpochModule();

    epoch.suspendPrivateDataWrites("user-1", "epoch-1");
    expect(epoch.isPrivateDataWriteSuspended("user-1")).toBe(true);
    expect(() => epoch.assertPrivateDataWritable("user-1")).toThrow(
      epoch.PrivateDataSuspendedError,
    );

    epoch.resumePrivateDataWrites("user-1", "another-epoch");
    expect(epoch.isPrivateDataWriteSuspended("user-1")).toBe(true);

    epoch.resumePrivateDataWrites("user-1", "epoch-1");
    expect(epoch.isPrivateDataWriteSuspended("user-1")).toBe(false);
    expect(() => epoch.assertPrivateDataWritable("user-1")).not.toThrow();
  });

  it("reconstructs the write fence from a persisted cross-tab request", async () => {
    const epoch = await loadEpochModule();
    window.localStorage.setItem(
      epoch.PRIVATE_DATA_REQUEST_KEY,
      JSON.stringify({
        userId: "user-1",
        requestId: "request-1",
        epoch: "persisted-epoch",
        sourceTabId: "tab-1",
        expiresAt: Date.now() + 1_000,
      }),
    );

    expect(epoch.isPrivateDataWriteSuspended("user-1")).toBe(true);
    window.localStorage.removeItem(epoch.PRIVATE_DATA_REQUEST_KEY);
    epoch.resumePrivateDataWrites("user-1", "persisted-epoch");
    expect(epoch.isPrivateDataWriteSuspended("user-1")).toBe(false);
  });

  it("keeps writes open for draft flushing while a request is preparing", async () => {
    const epoch = await loadEpochModule();
    window.localStorage.setItem(
      epoch.PRIVATE_DATA_REQUEST_KEY,
      JSON.stringify({
        userId: "user-1",
        requestId: "request-1",
        epoch: "preparing-epoch",
        sourceTabId: "tab-1",
        expiresAt: Date.now() + 1_000,
        phase: "preparing",
      }),
    );

    expect(epoch.isPrivateDataWriteSuspended("user-1")).toBe(false);
    expect(() => epoch.assertPrivateDataWritable("user-1")).not.toThrow();
  });

  it("drains active mutations and returns immediately when none remain", async () => {
    const epoch = await loadEpochModule();
    const finish = epoch.beginPrivateDataMutation("user-1");
    let drained = false;
    const draining = epoch.drainPrivateDataMutations().then(() => {
      drained = true;
    });

    await Promise.resolve();
    expect(drained).toBe(false);
    finish();
    await draining;
    expect(drained).toBe(true);

    await expect(epoch.drainPrivateDataMutations()).resolves.toBeUndefined();
  });

  it("times out rather than deleting beneath a stuck mutation", async () => {
    vi.useFakeTimers();
    const epoch = await loadEpochModule();
    const finish = epoch.beginPrivateDataMutation("user-1");

    const draining = epoch.drainPrivateDataMutations(25);
    const rejected = expect(draining).rejects.toThrow(
      "PRIVATE_DATA_MUTATION_TIMEOUT",
    );
    await vi.advanceTimersByTimeAsync(25);
    await rejected;

    finish();
    await expect(epoch.drainPrivateDataMutations()).resolves.toBeUndefined();
  });

  it("does not register a new mutation while the database is fenced", async () => {
    const epoch = await loadEpochModule();
    epoch.suspendPrivateDataWrites("user-1", "epoch-1");

    expect(() => epoch.beginPrivateDataMutation("user-1")).toThrow(
      "PRIVATE_DATA_SUSPENDED",
    );
  });

  it("retries superseded draft flushes until every registered editor is clean", async () => {
    const epoch = await loadEpochModule();
    const firstFlusher = vi
      .fn<() => Promise<boolean>>()
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true);
    const secondFlusher = vi.fn<() => Promise<boolean>>().mockResolvedValue(true);
    const unregisterFirst = epoch.registerPrivateDataDraftFlusher(firstFlusher);
    const unregisterSecond = epoch.registerPrivateDataDraftFlusher(secondFlusher);

    await expect(epoch.flushPrivateDataDrafts(100)).resolves.toBeUndefined();

    expect(firstFlusher).toHaveBeenCalledTimes(2);
    expect(secondFlusher).toHaveBeenCalledTimes(2);
    unregisterFirst();
    unregisterSecond();
  });

  it("fails closed when an editor draft cannot be flushed before the deadline", async () => {
    vi.useFakeTimers();
    const epoch = await loadEpochModule();
    const unregister = epoch.registerPrivateDataDraftFlusher(
      () => new Promise<boolean>(() => undefined),
    );

    const flushing = epoch.flushPrivateDataDrafts(25);
    const rejected = expect(flushing).rejects.toThrow(
      "PRIVATE_DATA_DRAFT_FLUSH_TIMEOUT",
    );
    await vi.advanceTimersByTimeAsync(25);
    await rejected;
    unregister();
  });
});
