"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

const HEARTBEAT_SECONDS = 60;

function sendUsageEvent(payload: object) {
  void fetch("/api/analytics/usage", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    cache: "no-store",
    keepalive: true,
  }).catch(() => {
    // Analytics must never interrupt the user's work.
  });
}

export function UsageTracker() {
  const pathname = usePathname();

  useEffect(() => {
    sendUsageEvent({ type: "page_view", path: pathname });
  }, [pathname]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible" && document.hasFocus()) {
        sendUsageEvent({
          type: "heartbeat",
          activeSeconds: HEARTBEAT_SECONDS,
        });
      }
    }, HEARTBEAT_SECONDS * 1000);

    return () => window.clearInterval(interval);
  }, []);

  return null;
}
