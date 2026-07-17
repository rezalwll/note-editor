import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  cacheDelete: vi.fn(),
  cacheKeys: vi.fn(),
  close: vi.fn(),
  complete: vi.fn(),
  deleteDatabase: vi.fn(),
  postMessage: vi.fn(),
}));

vi.mock("@/lib/offline-db/db", () => ({
  offlineDb: {
    close: mocks.close,
    delete: mocks.deleteDatabase,
  },
}));

vi.mock("@/lib/private-data-coordinator", () => ({
  completePrivateDataClear: mocks.complete,
}));

import { clearPrivateClientData } from "@/lib/clear-client-data";

const preparation = {
  userId: "user-1",
  requestId: "request-1",
  epoch: "epoch-1",
};

type FakeMessagePort = {
  close: ReturnType<typeof vi.fn>;
  onmessage: ((event: MessageEvent<unknown>) => void) | null;
  peer?: FakeMessagePort;
};

class FakeMessageChannel {
  port1: FakeMessagePort;
  port2: FakeMessagePort;

  constructor() {
    this.port1 = { close: vi.fn(), onmessage: null };
    this.port2 = { close: vi.fn(), onmessage: null };
    this.port1.peer = this.port2;
    this.port2.peer = this.port1;
  }
}

function acknowledgeServiceWorker(
  message: unknown,
  transfer: FakeMessagePort[],
) {
  const request = message as { requestId: string };
  transfer[0]?.peer?.onmessage?.({
    data: {
      type: "PRIVATE_DATA_CLEARED",
      requestId: request.requestId,
    },
  } as MessageEvent<unknown>);
}

describe("clearPrivateClientData", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.deleteDatabase.mockResolvedValue(undefined);
    mocks.cacheKeys.mockResolvedValue(["private-a", "private-b"]);
    mocks.cacheDelete.mockResolvedValue(true);
    mocks.postMessage.mockImplementation(acknowledgeServiceWorker);
    vi.stubGlobal("MessageChannel", FakeMessageChannel);
    Object.defineProperty(navigator, "serviceWorker", {
      configurable: true,
      value: { controller: { postMessage: mocks.postMessage } },
    });
    vi.stubGlobal("caches", {
      keys: mocks.cacheKeys,
      delete: mocks.cacheDelete,
    });
  });

  it("deletes IndexedDB before clearing caches and waits for the service-worker ACK", async () => {
    await clearPrivateClientData(preparation);

    expect(mocks.close).toHaveBeenCalledOnce();
    expect(mocks.deleteDatabase).toHaveBeenCalledOnce();
    expect(mocks.postMessage).toHaveBeenCalledWith(
      { type: "CLEAR_PRIVATE_DATA", requestId: "request-1" },
      [expect.any(Object)],
    );
    expect(mocks.cacheDelete).toHaveBeenCalledWith("private-a");
    expect(mocks.cacheDelete).toHaveBeenCalledWith("private-b");
    expect(mocks.deleteDatabase.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.postMessage.mock.invocationCallOrder[0],
    );
    expect(mocks.deleteDatabase.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.cacheKeys.mock.invocationCallOrder[0],
    );
    expect(mocks.complete).toHaveBeenCalledWith(preparation);
  });

  it("skips service-worker and cache work when those browser APIs are unavailable", async () => {
    Object.defineProperty(navigator, "serviceWorker", {
      configurable: true,
      value: undefined,
    });
    vi.stubGlobal("caches", undefined);

    await clearPrivateClientData(preparation);

    expect(mocks.postMessage).not.toHaveBeenCalled();
    expect(mocks.cacheKeys).not.toHaveBeenCalled();
    expect(mocks.complete).toHaveBeenCalledWith(preparation);
  });

  it("completes cross-tab coordination even when cache clearing fails", async () => {
    mocks.cacheKeys.mockRejectedValue(new Error("CACHE_FAILED"));

    await expect(clearPrivateClientData(preparation)).rejects.toThrow(
      "CACHE_FAILED",
    );

    expect(mocks.complete).toHaveBeenCalledWith(preparation);
  });

  it("releases cross-tab coordination even when IndexedDB deletion fails", async () => {
    mocks.deleteDatabase.mockRejectedValue(new Error("DELETE_FAILED"));

    await expect(clearPrivateClientData(preparation)).rejects.toThrow(
      "DELETE_FAILED",
    );

    expect(mocks.postMessage).not.toHaveBeenCalled();
    expect(mocks.cacheKeys).not.toHaveBeenCalled();
    expect(mocks.complete).toHaveBeenCalledWith(preparation);
  });

  it("rejects when a controlled service worker cannot receive an ACK channel", async () => {
    vi.stubGlobal("MessageChannel", undefined);

    await expect(clearPrivateClientData(preparation)).rejects.toThrow(
      "SERVICE_WORKER_CLEAR_UNAVAILABLE",
    );

    expect(mocks.complete).toHaveBeenCalledWith(preparation);
  });

  it("ignores a mismatched ACK and fails closed when the service worker times out", async () => {
    vi.useFakeTimers();
    mocks.postMessage.mockImplementation((_, transfer: FakeMessagePort[]) => {
      transfer[0]?.peer?.onmessage?.({
        data: { type: "PRIVATE_DATA_CLEARED", requestId: "another-request" },
      } as MessageEvent<unknown>);
    });

    const clearing = clearPrivateClientData(preparation);
    const rejected = expect(clearing).rejects.toThrow(
      "SERVICE_WORKER_CLEAR_TIMEOUT",
    );
    await vi.advanceTimersByTimeAsync(3_000);
    await rejected;

    expect(mocks.complete).toHaveBeenCalledWith(preparation);
    vi.useRealTimers();
  });
});
