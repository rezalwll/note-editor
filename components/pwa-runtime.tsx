"use client";

import { useEffect } from "react";

import { bootstrapOfflineState, processSyncQueue } from "@/lib/sync/client";

export function PwaRuntime() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      void navigator.serviceWorker.register("/sw.js");
    }

    const bootstrap = async () => {
      try {
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
