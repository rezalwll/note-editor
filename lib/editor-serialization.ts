import {
  serializeEditorContentSync,
  type SerializedEditorContent,
} from "@/lib/editor-serialization-core";
import type { FreeformBlock } from "@/lib/notes";

export const SERIALIZATION_WORKER_BLOCK_THRESHOLD = 500;
const WORKER_TIMEOUT_MS = 8_000;

type PendingRequest = {
  resolve: (result: SerializedEditorContent) => void;
  reject: (error: Error) => void;
  timeoutId: ReturnType<typeof setTimeout>;
};

let worker: Worker | null = null;
let nextRequestId = 1;
const pendingRequests = new Map<number, PendingRequest>();

function rejectPendingRequests(message: string) {
  for (const request of pendingRequests.values()) {
    clearTimeout(request.timeoutId);
    request.reject(new Error(message));
  }
  pendingRequests.clear();
}

function getSerializationWorker() {
  if (typeof Worker === "undefined") {
    return null;
  }
  if (worker) {
    return worker;
  }

  worker = new Worker(
    new URL("../workers/editor-serialization.worker.ts", import.meta.url),
    { type: "module", name: "editor-serialization" },
  );
  worker.addEventListener(
    "message",
    (
      event: MessageEvent<{
        id: number;
        result: SerializedEditorContent;
      }>,
    ) => {
      const request = pendingRequests.get(event.data.id);
      if (!request) {
        return;
      }

      pendingRequests.delete(event.data.id);
      clearTimeout(request.timeoutId);
      request.resolve(event.data.result);
    },
  );
  worker.addEventListener("error", () => {
    rejectPendingRequests("Editor serialization worker failed.");
    worker?.terminate();
    worker = null;
  });
  return worker;
}

function serializeInWorker(
  blocks: readonly FreeformBlock[],
  bodyText: string,
) {
  const serializationWorker = getSerializationWorker();
  if (!serializationWorker) {
    return Promise.resolve(serializeEditorContentSync(blocks, bodyText));
  }

  const id = nextRequestId++;
  return new Promise<SerializedEditorContent>((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      pendingRequests.delete(id);
      reject(new Error("Editor serialization worker timed out."));
    }, WORKER_TIMEOUT_MS);
    pendingRequests.set(id, { resolve, reject, timeoutId });
    serializationWorker.postMessage({ id, blocks, bodyText });
  });
}

export async function serializeEditorContent(
  blocks: readonly FreeformBlock[],
  bodyText: string,
) {
  if (blocks.length < SERIALIZATION_WORKER_BLOCK_THRESHOLD) {
    return serializeEditorContentSync(blocks, bodyText);
  }

  try {
    return await serializeInWorker(blocks, bodyText);
  } catch (error) {
    console.warn(
      "Falling back to main-thread editor serialization.",
      error,
    );
    return serializeEditorContentSync(blocks, bodyText);
  }
}
