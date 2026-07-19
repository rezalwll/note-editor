"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

import {
  getLastVisitedPageCookieName,
  getPageIdFromPathname,
  LAST_VISITED_PAGE_COOKIE_MAX_AGE,
} from "@/lib/last-visited-page";
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
  const pathname = usePathname();

  useEffect(() => {
    const pageId = getPageIdFromPathname(pathname);
    if (!pageId) {
      return;
    }

    const secure = window.location.protocol === "https:" ? "; Secure" : "";
    document.cookie = `${getLastVisitedPageCookieName(userId)}=${pageId}; Path=/; Max-Age=${LAST_VISITED_PAGE_COOKIE_MAX_AGE}; SameSite=Lax${secure}`;
  }, [pathname, userId]);

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
