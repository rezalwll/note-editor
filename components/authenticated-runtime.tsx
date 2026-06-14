"use client";

import { useEffect } from "react";

import { bootstrapOfflineState, processSyncQueue } from "@/lib/sync/client";

type AuthenticatedRuntimeProps = {
  userId: string;
};

export function AuthenticatedRuntime({ userId }: AuthenticatedRuntimeProps) {
  useEffect(() => {
    const bootstrap = async () => {
      try {
        await bootstrapOfflineState(userId);
        await processSyncQueue(userId);
      } catch {
        // Silent fallback keeps the app usable when the network is unavailable.
      }
    };

    void bootstrap();

    const handleOnline = () => {
      void processSyncQueue(userId);
    };

    window.addEventListener("online", handleOnline);
    return () => window.removeEventListener("online", handleOnline);
  }, [userId]);

  return null;
}
