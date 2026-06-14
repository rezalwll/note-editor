"use client";

import { useEffect } from "react";

export function PwaRuntime() {
  useEffect(() => {
    const isDevelopment = process.env.NODE_ENV !== "production";
    const enablePwa = process.env.NEXT_PUBLIC_ENABLE_PWA === "true";

    const setupServiceWorker = async () => {
      if (!("serviceWorker" in navigator)) {
        return;
      }

      if (isDevelopment || !enablePwa) {
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

    void setupServiceWorker();
  }, []);

  return null;
}
