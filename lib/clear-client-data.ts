"use client";

import { offlineDb } from "@/lib/offline-db/db";
import {
  completePrivateDataClear,
  type PrivateDataClearPreparation,
} from "@/lib/private-data-coordinator";

const SERVICE_WORKER_CLEAR_TIMEOUT_MS = 3_000;

async function clearServiceWorkerPrivateData(requestId: string) {
  const controller = navigator.serviceWorker?.controller;
  if (!controller) return;
  if (typeof MessageChannel === "undefined") {
    throw new Error("SERVICE_WORKER_CLEAR_UNAVAILABLE");
  }

  const channel = new MessageChannel();
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      channel.port1.close();
      reject(new Error("SERVICE_WORKER_CLEAR_TIMEOUT"));
    }, SERVICE_WORKER_CLEAR_TIMEOUT_MS);
    channel.port1.onmessage = (event: MessageEvent<unknown>) => {
      const payload = event.data as { type?: string; requestId?: string } | null;
      if (
        payload?.type !== "PRIVATE_DATA_CLEARED" ||
        payload.requestId !== requestId
      ) {
        return;
      }
      clearTimeout(timeout);
      channel.port1.close();
      resolve();
    };
    controller.postMessage(
      { type: "CLEAR_PRIVATE_DATA", requestId },
      [channel.port2],
    );
  });
}

export async function clearPrivateClientData(
  preparation: PrivateDataClearPreparation,
) {
  try {
    offlineDb.close();
    await offlineDb.delete();
    await Promise.all([
      clearServiceWorkerPrivateData(preparation.requestId),
      typeof caches === "undefined"
        ? Promise.resolve()
        : caches
            .keys()
            .then((keys) => Promise.all(keys.map((key) => caches.delete(key))))
            .then(() => undefined),
    ]);
  } finally {
    completePrivateDataClear(preparation);
  }
}
