"use client";

import { useEffect } from "react";

import {
  activateOfflineSync,
  bootstrapOfflineState,
  processSyncQueue,
} from "@/lib/sync/client";
import { registerPrivateDataTab } from "@/lib/private-data-coordinator";

type AuthenticatedRuntimeProps = {
  userId: string;
};

export function AuthenticatedRuntime({ userId }: AuthenticatedRuntimeProps) {
  useEffect(() => {
    const unregisterPrivateDataTab = registerPrivateDataTab(userId);
    activateOfflineSync(userId);

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

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void processSyncQueue(userId);
      }
    };

    const handleFocus = () => {
      void processSyncQueue(userId);
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("focus", handleFocus);
    return () => {
      unregisterPrivateDataTab();
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("focus", handleFocus);
    };
  }, [userId]);

  return null;
}
