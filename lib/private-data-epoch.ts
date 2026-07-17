export const PRIVATE_DATA_STORAGE_PREFIX = "notava-private-data:";
export const PRIVATE_DATA_REQUEST_KEY = `${PRIVATE_DATA_STORAGE_PREFIX}request`;

export type StoredPrivateDataRequest = {
  userId: string;
  requestId: string;
  epoch: string;
  sourceTabId: string;
  expiresAt: number;
  phase: "preparing" | "suspended";
};

let suspendedDatabaseEpoch: string | null = null;
const activeMutations = new Set<Promise<unknown>>();
type PrivateDataDraftFlusher = () => Promise<boolean>;
const activeDraftFlushers = new Set<PrivateDataDraftFlusher>();
let draftFlusherGeneration = 0;

export class PrivateDataSuspendedError extends Error {
  constructor() {
    super("PRIVATE_DATA_SUSPENDED");
    this.name = "PrivateDataSuspendedError";
  }
}

export function readStoredPrivateDataRequest(): StoredPrivateDataRequest | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(PRIVATE_DATA_REQUEST_KEY);
    if (!raw) return null;
    const request = JSON.parse(raw) as Partial<StoredPrivateDataRequest>;
    if (
      typeof request.userId !== "string" ||
      typeof request.requestId !== "string" ||
      typeof request.epoch !== "string" ||
      typeof request.sourceTabId !== "string" ||
      typeof request.expiresAt !== "number"
    ) {
      return null;
    }
    if (request.expiresAt <= Date.now()) {
      window.localStorage.removeItem(PRIVATE_DATA_REQUEST_KEY);
      return null;
    }
    if (
      request.phase !== undefined &&
      request.phase !== "preparing" &&
      request.phase !== "suspended"
    ) {
      return null;
    }
    return {
      ...(request as Omit<StoredPrivateDataRequest, "phase">),
      // Requests written by an older application version already acted as a
      // hard fence. Preserve that fail-closed behavior during rolling updates.
      phase: request.phase ?? "suspended",
    };
  } catch {
    return null;
  }
}

export function suspendPrivateDataWrites(_userId: string, epoch: string) {
  suspendedDatabaseEpoch = epoch;
}

export function resumePrivateDataWrites(_userId: string, epoch?: string) {
  if (epoch && suspendedDatabaseEpoch !== epoch) {
    return;
  }
  suspendedDatabaseEpoch = null;
}

export function isPrivateDataWriteSuspended(_userId: string) {
  const storedRequest = readStoredPrivateDataRequest();
  if (storedRequest?.phase === "suspended") {
    suspendedDatabaseEpoch = storedRequest.epoch;
  }
  return suspendedDatabaseEpoch !== null;
}

export function assertPrivateDataWritable(userId: string) {
  if (isPrivateDataWriteSuspended(userId)) {
    throw new PrivateDataSuspendedError();
  }
}

export function beginPrivateDataMutation(userId: string) {
  assertPrivateDataWritable(userId);
  let finish!: () => void;
  const completion = new Promise<void>((resolve) => {
    finish = resolve;
  });
  activeMutations.add(completion);
  return () => {
    activeMutations.delete(completion);
    finish();
  };
}

export async function drainPrivateDataMutations(timeoutMs = 3_000) {
  const mutations = [...activeMutations];
  if (mutations.length === 0) return;

  let timeout: ReturnType<typeof setTimeout> | undefined;
  const completed = await Promise.race([
    Promise.allSettled(mutations).then(() => true),
    new Promise<boolean>((resolve) => {
      timeout = setTimeout(() => resolve(false), timeoutMs);
    }),
  ]);
  if (timeout) clearTimeout(timeout);
  if (!completed) throw new Error("PRIVATE_DATA_MUTATION_TIMEOUT");
}

export function registerPrivateDataDraftFlusher(
  flusher: PrivateDataDraftFlusher,
) {
  activeDraftFlushers.add(flusher);
  draftFlusherGeneration += 1;
  return () => {
    if (activeDraftFlushers.delete(flusher)) {
      draftFlusherGeneration += 1;
    }
  };
}

function waitForDraftRetry(milliseconds: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
}

export async function flushPrivateDataDrafts(timeoutMs = 3_000) {
  const deadline = Date.now() + timeoutMs;

  while (activeDraftFlushers.size > 0) {
    const remainingMs = deadline - Date.now();
    if (remainingMs <= 0) {
      throw new Error("PRIVATE_DATA_DRAFT_FLUSH_TIMEOUT");
    }

    const generation = draftFlusherGeneration;
    const flushers = [...activeDraftFlushers];
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const result = await Promise.race([
      Promise.allSettled(flushers.map((flusher) => flusher())).then(
        (results) => ({
          completed: true as const,
          allClean: results.every(
            (entry) => entry.status === "fulfilled" && entry.value,
          ),
        }),
      ),
      new Promise<{ completed: false; allClean: false }>((resolve) => {
        timeout = setTimeout(
          () => resolve({ completed: false, allClean: false }),
          remainingMs,
        );
      }),
    ]);
    if (timeout) clearTimeout(timeout);

    if (!result.completed) {
      throw new Error("PRIVATE_DATA_DRAFT_FLUSH_TIMEOUT");
    }
    if (
      result.allClean &&
      generation === draftFlusherGeneration &&
      flushers.length === activeDraftFlushers.size
    ) {
      return;
    }

    // A superseded serialization reports dirty so we retry the newest
    // revision. Yielding here also lets IndexedDB/React finish pending work.
    await waitForDraftRetry(Math.min(10, Math.max(0, deadline - Date.now())));
  }
}
