"use client";

import { useEffect } from "react";

import { bootstrapOfflineState, processSyncQueue } from "@/lib/sync/client";

export function PwaRuntime() {
  useEffect(() => {
    const isDevelopment = process.env.NODE_ENV !== "production";

    const setupServiceWorker = async () => {
      if (!("serviceWorker" in navigator)) {
        return;
      }

      if (isDevelopment) {
        const registrations = await navigator.serviceWorker.getRegistrations();
        await Promise.all(registrations.map((registration) => registration.unregister()));

        if ("caches" in window) {
          const cacheKeys = await caches.keys();
          await Promise.all(cacheKeys.map((key) => caches.delete(key)));
        }

        return;
      }

      await navigator.serviceWorker.register("/sw.js");
    };

    const bootstrap = async () => {
      try {
        await setupServiceWorker();
        await bootstrapOfflineState();
        await processSyncQueue();
      } catch {
        // Silent fallback keeps the app usable when the network is unavailable.
      }
    };

    void bootstrap();

    const handleOnline = () => {
      void processSyncQueue();
    };

    window.addEventListener("online", handleOnline);
    return () => window.removeEventListener("online", handleOnline);
  }, []);

  return null;
}
