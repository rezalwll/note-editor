"use client";

import { offlineDb } from "@/lib/offline-db/db";
import {
  drainPrivateDataMutations,
  flushPrivateDataDrafts,
  PRIVATE_DATA_REQUEST_KEY,
  PRIVATE_DATA_STORAGE_PREFIX,
  readStoredPrivateDataRequest,
  resumePrivateDataWrites,
  type StoredPrivateDataRequest,
  suspendPrivateDataWrites,
} from "@/lib/private-data-epoch";
import {
  activateOfflineSync,
  suspendOfflineSync,
} from "@/lib/sync/client";

const CHANNEL_NAME = "notava-private-data-v1";
const STORAGE_PREFIX = PRIVATE_DATA_STORAGE_PREFIX;
const EVENT_KEY = `${STORAGE_PREFIX}event`;
const TAB_TTL_MS = 15_000;
const HEARTBEAT_MS = 5_000;
const ACK_TIMEOUT_MS = 4_000;
const REQUEST_TTL_MS = 15_000;

type CoordinatorMessage = {
  type: "suspend" | "ack" | "resume" | "complete";
  userId: string;
  requestId: string;
  epoch: string;
  sourceTabId: string;
  phase?: StoredPrivateDataRequest["phase"];
};

export type PrivateDataClearPreparation = {
  userId: string;
  requestId: string;
  epoch: string;
};

type Registration = {
  userId: string;
  tabId: string;
  channel: BroadcastChannel | null;
  heartbeat: ReturnType<typeof setInterval>;
  onStorage: (event: StorageEvent) => void;
  requestQuiescence: Map<string, RequestQuiescence>;
};

type RequestQuiescence = {
  acknowledged: boolean;
  cancelled: boolean;
  cleanupTimer: ReturnType<typeof setTimeout> | null;
  promise: Promise<void>;
};

let registration: Registration | null = null;

function randomId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function storage() {
  if (typeof window === "undefined") {
    throw new Error("CROSS_TAB_COORDINATION_UNAVAILABLE");
  }
  try {
    const candidate = window.localStorage;
    const probe = `${STORAGE_PREFIX}probe`;
    candidate.setItem(probe, "1");
    candidate.removeItem(probe);
    return candidate;
  } catch {
    throw new Error("CROSS_TAB_COORDINATION_UNAVAILABLE");
  }
}

function presencePrefix() {
  return `${STORAGE_PREFIX}tab:`;
}

function presenceKey(tabId: string) {
  return `${presencePrefix()}${tabId}`;
}

function ackKey(requestId: string, tabId: string) {
  return `${STORAGE_PREFIX}ack:${requestId}:${tabId}`;
}

function writePresence(current: Registration) {
  storage().setItem(
    presenceKey(current.tabId),
    JSON.stringify({ userId: current.userId, lastSeenAt: Date.now() }),
  );
}

function activeTabIds() {
  // IndexedDB, Cache Storage, and the service worker are origin-wide, so a
  // destructive clear must coordinate with every app tab, including a stale
  // tab that was opened under a different account.
  const target = storage();
  const prefix = presencePrefix();
  const active = new Set<string>();
  const now = Date.now();
  for (let index = target.length - 1; index >= 0; index -= 1) {
    const key = target.key(index);
    if (!key?.startsWith(prefix)) continue;
    let lastSeenAt = Number.NaN;
    try {
      const presence = JSON.parse(target.getItem(key) ?? "null") as {
        lastSeenAt?: number;
      } | null;
      lastSeenAt = Number(presence?.lastSeenAt);
    } catch {
      // Invalid leases are treated as stale.
    }
    if (!Number.isFinite(lastSeenAt) || now - lastSeenAt > TAB_TTL_MS) {
      target.removeItem(key);
      continue;
    }
    active.add(key.slice(prefix.length));
  }
  return active;
}

function sendMessage(current: Registration, message: CoordinatorMessage) {
  current.channel?.postMessage(message);
  storage().setItem(
    EVENT_KEY,
    JSON.stringify({ ...message, nonce: randomId() }),
  );
}

function hardNavigateToLogin() {
  if (typeof window !== "undefined") {
    window.location.assign("/login");
  }
}

function restoreAfterCancelledQuiescence(
  current: Registration,
  message: CoordinatorMessage,
) {
  resumePrivateDataWrites(current.userId, message.epoch);
  activateOfflineSync(current.userId);
  writePresence(current);
}

function scheduleQuiescenceCleanup(
  current: Registration,
  requestId: string,
  request: RequestQuiescence,
) {
  if (request.cleanupTimer) clearTimeout(request.cleanupTimer);
  request.cleanupTimer = setTimeout(() => {
    if (current.requestQuiescence.get(requestId) === request) {
      current.requestQuiescence.delete(requestId);
    }
  }, REQUEST_TTL_MS);
}

function clearQuiescenceState(current: Registration) {
  for (const request of current.requestQuiescence.values()) {
    if (request.cleanupTimer) clearTimeout(request.cleanupTimer);
  }
  current.requestQuiescence.clear();
}

async function quiesceRemoteTab(
  current: Registration,
  message: CoordinatorMessage,
  request: RequestQuiescence,
) {
  if (message.phase !== "suspended") {
    await flushPrivateDataDrafts();
  }
  if (request.cancelled) return;

  // No browser event can run between the completed flush continuation and
  // this synchronous fence, so a newer editor revision cannot slip through.
  suspendPrivateDataWrites(current.userId, message.epoch);
  await suspendOfflineSync(current.userId);
  if (request.cancelled) {
    restoreAfterCancelledQuiescence(current, message);
    return;
  }

  await drainPrivateDataMutations();
  if (request.cancelled) {
    restoreAfterCancelledQuiescence(current, message);
    return;
  }

  offlineDb.close();
}

async function handleMessage(
  current: Registration,
  message: CoordinatorMessage,
) {
  if (message.sourceTabId === current.tabId) {
    return;
  }

  if (message.type === "suspend") {
    let request = current.requestQuiescence.get(message.requestId);
    if (!request) {
      request = {
        acknowledged: false,
        cancelled: false,
        cleanupTimer: null,
        promise: Promise.resolve(),
      };
      request.promise = quiesceRemoteTab(current, message, request);
      current.requestQuiescence.set(message.requestId, request);
      scheduleQuiescenceCleanup(current, message.requestId, request);
    }

    try {
      // BroadcastChannel and localStorage deliberately deliver the same
      // request. Every delivery waits for this one shared quiescence promise.
      await request.promise;
      if (request.cancelled || request.acknowledged) return;
      storage().setItem(ackKey(message.requestId, current.tabId), "1");
      sendMessage(current, {
        ...message,
        type: "ack",
        sourceTabId: current.tabId,
      });
      request.acknowledged = true;
      scheduleQuiescenceCleanup(current, message.requestId, request);
    } catch {
      // Missing ACK deliberately prevents destructive deletion in the source tab.
    }
    return;
  }

  if (message.type === "resume") {
    const request = current.requestQuiescence.get(message.requestId);
    if (request) {
      request.cancelled = true;
      scheduleQuiescenceCleanup(current, message.requestId, request);
    }
    await offlineDb.open();
    resumePrivateDataWrites(current.userId, message.epoch);
    activateOfflineSync(current.userId);
    writePresence(current);
    return;
  }

  if (message.type === "complete") {
    storage().removeItem(presenceKey(current.tabId));
    clearInterval(current.heartbeat);
    window.removeEventListener("storage", current.onStorage);
    current.channel?.close();
    clearQuiescenceState(current);
    if (registration === current) registration = null;
    offlineDb.close();
    hardNavigateToLogin();
  }
}

function parseMessage(value: unknown): CoordinatorMessage | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<CoordinatorMessage>;
  if (
    !["suspend", "ack", "resume", "complete"].includes(candidate.type ?? "") ||
    typeof candidate.userId !== "string" ||
    typeof candidate.requestId !== "string" ||
    typeof candidate.epoch !== "string" ||
    typeof candidate.sourceTabId !== "string" ||
    (candidate.phase !== undefined &&
      candidate.phase !== "preparing" &&
      candidate.phase !== "suspended")
  ) {
    return null;
  }
  return candidate as CoordinatorMessage;
}

export function registerPrivateDataTab(userId: string) {
  if (typeof window === "undefined") return () => undefined;
  try {
    storage();
  } catch {
    return () => undefined;
  }
  if (registration?.userId === userId) {
    writePresence(registration);
    return () => undefined;
  }
  registration?.channel?.close();
  if (registration) {
    clearInterval(registration.heartbeat);
    window.removeEventListener("storage", registration.onStorage);
    storage().removeItem(presenceKey(registration.tabId));
    clearQuiescenceState(registration);
  }

  const tabId = randomId();
  const channel =
    typeof BroadcastChannel === "undefined"
      ? null
      : new BroadcastChannel(CHANNEL_NAME);
  const current = {
    userId,
    tabId,
    channel,
    heartbeat: 0 as unknown as ReturnType<typeof setInterval>,
    onStorage: (() => undefined) as (event: StorageEvent) => void,
    requestQuiescence: new Map<string, RequestQuiescence>(),
  } satisfies Registration;
  current.onStorage = (event) => {
    if (event.key !== EVENT_KEY || !event.newValue) return;
    try {
      const message = parseMessage(JSON.parse(event.newValue));
      if (message) void handleMessage(current, message);
    } catch {
      // Ignore malformed cross-tab messages.
    }
  };
  channel?.addEventListener("message", (event: MessageEvent<unknown>) => {
    const message = parseMessage(event.data);
    if (message) void handleMessage(current, message);
  });
  window.addEventListener("storage", current.onStorage);
  writePresence(current);
  current.heartbeat = setInterval(() => writePresence(current), HEARTBEAT_MS);
  registration = current;

  const pendingRequest = readStoredPrivateDataRequest();
  if (pendingRequest) {
    void handleMessage(current, {
      type: "suspend",
      userId,
      requestId: pendingRequest.requestId,
      epoch: pendingRequest.epoch,
      sourceTabId: pendingRequest.sourceTabId,
      phase: pendingRequest.phase,
    });
  }

  return () => {
    if (registration !== current) return;
    storage().removeItem(presenceKey(tabId));
    clearInterval(current.heartbeat);
    window.removeEventListener("storage", current.onStorage);
    current.channel?.close();
    clearQuiescenceState(current);
    registration = null;
  };
}

function ensureRegistration(userId: string) {
  if (registration?.userId !== userId) {
    registerPrivateDataTab(userId);
  }
  if (!registration) {
    throw new Error("CROSS_TAB_COORDINATION_UNAVAILABLE");
  }
  return registration;
}

function delay(milliseconds: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
}

export async function preparePrivateDataClear(
  userId: string,
): Promise<PrivateDataClearPreparation> {
  const current = ensureRegistration(userId);
  writePresence(current);
  const requestId = randomId();
  const epoch = `${Date.now()}:${requestId}`;
  const preparation = { userId, requestId, epoch };
  const storedRequest: StoredPrivateDataRequest = {
    ...preparation,
    sourceTabId: current.tabId,
    expiresAt: Date.now() + REQUEST_TTL_MS,
    phase: "preparing",
  };
  storage().setItem(PRIVATE_DATA_REQUEST_KEY, JSON.stringify(storedRequest));
  sendMessage(current, {
    type: "suspend",
    ...preparation,
    sourceTabId: current.tabId,
    phase: "preparing",
  });

  try {
    await flushPrivateDataDrafts();
    suspendPrivateDataWrites(userId, epoch);
    await suspendOfflineSync(userId);
    await drainPrivateDataMutations();
    const deadline = Date.now() + ACK_TIMEOUT_MS;
    let stableChecks = 0;
    let previousSignature = "";
    while (Date.now() < deadline) {
      const expectedTabs = activeTabIds();
      expectedTabs.delete(current.tabId);
      const missingTabs = [...expectedTabs].filter(
        (tabId) => storage().getItem(ackKey(requestId, tabId)) !== "1",
      );
      const signature = [...expectedTabs].sort().join(",");
      if (missingTabs.length === 0) {
        stableChecks = signature === previousSignature ? stableChecks + 1 : 1;
        previousSignature = signature;
        if (stableChecks >= 2) {
          storage().setItem(
            PRIVATE_DATA_REQUEST_KEY,
            JSON.stringify({ ...storedRequest, phase: "suspended" }),
          );
          return preparation;
        }
      } else {
        stableChecks = 0;
        previousSignature = signature;
      }
      await delay(50);
    }
    throw new Error("CROSS_TAB_SUSPEND_TIMEOUT");
  } catch (error) {
    await resumePrivateDataClear(preparation);
    throw error;
  }
}

function removeRequestArtifacts(preparation: PrivateDataClearPreparation) {
  const target = storage();
  const stored = readStoredPrivateDataRequest();
  if (stored?.requestId === preparation.requestId) {
    target.removeItem(PRIVATE_DATA_REQUEST_KEY);
  }
  const prefix = `${STORAGE_PREFIX}ack:${preparation.requestId}:`;
  for (let index = target.length - 1; index >= 0; index -= 1) {
    const key = target.key(index);
    if (key?.startsWith(prefix)) target.removeItem(key);
  }
}

export async function resumePrivateDataClear(
  preparation: PrivateDataClearPreparation,
) {
  const current = ensureRegistration(preparation.userId);
  await offlineDb.open();
  removeRequestArtifacts(preparation);
  resumePrivateDataWrites(preparation.userId, preparation.epoch);
  activateOfflineSync(preparation.userId);
  sendMessage(current, {
    type: "resume",
    ...preparation,
    sourceTabId: current.tabId,
  });
}

export function completePrivateDataClear(
  preparation: PrivateDataClearPreparation,
) {
  const current = ensureRegistration(preparation.userId);
  sendMessage(current, {
    type: "complete",
    ...preparation,
    sourceTabId: current.tabId,
  });
  removeRequestArtifacts(preparation);
  storage().removeItem(presenceKey(current.tabId));
  clearInterval(current.heartbeat);
  window.removeEventListener("storage", current.onStorage);
  current.channel?.close();
  clearQuiescenceState(current);
  if (registration === current) registration = null;
}
