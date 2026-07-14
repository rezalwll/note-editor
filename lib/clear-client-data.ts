"use client";

import { offlineDb } from "@/lib/offline-db/db";

export async function clearPrivateClientData() {
  navigator.serviceWorker?.controller?.postMessage({ type: "CLEAR_PRIVATE_DATA" });

  offlineDb.close();
  await Promise.all([
    offlineDb.delete().catch(() => undefined),
    typeof caches === "undefined"
      ? Promise.resolve()
      : caches
          .keys()
          .then((keys) => Promise.all(keys.map((key) => caches.delete(key))))
          .then(() => undefined),
  ]);
}
