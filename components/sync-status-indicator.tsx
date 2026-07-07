"use client";

import { AlertTriangle, Check, LoaderCircle } from "lucide-react";
import { useEffect, useState } from "react";

import type { SyncStatus } from "@/lib/offline-db/types";

type SyncIndicatorState = "synced" | "syncing" | "error";

type SyncEventDetail = {
  type?: string;
  phase?: "start" | "complete" | "error";
  syncStatus?: SyncStatus;
};

const STATUS_COPY: Record<SyncIndicatorState, string> = {
  synced: "همه تغییرات با سرور همگام شده‌اند",
  syncing: "در حال ذخیره و همگام‌سازی تغییرات...",
  error: "همگام‌سازی با خطا روبه‌رو شد؛ اتصال اینترنت یا وضعیت سرور را بررسی کنید",
};

function getStateFromSyncDetail(detail: SyncEventDetail): SyncIndicatorState | null {
  if (detail.phase === "start" || detail.syncStatus === "pending") {
    return "syncing";
  }

  if (
    detail.phase === "error" ||
    detail.syncStatus === "failed" ||
    detail.syncStatus === "conflict"
  ) {
    return "error";
  }

  if (detail.phase === "complete" || detail.syncStatus === "synced") {
    return "synced";
  }

  return null;
}

export function SyncStatusIndicator() {
  const [state, setState] = useState<SyncIndicatorState>(() => {
    if (typeof navigator === "undefined") {
      return "synced";
    }

    return navigator.onLine ? "synced" : "error";
  });
  const label = STATUS_COPY[state];

  useEffect(() => {
    const handleSyncEvent = (event: Event) => {
      const detail = (event as CustomEvent<SyncEventDetail>).detail;
      const nextState = detail ? getStateFromSyncDetail(detail) : null;

      if (nextState) {
        setState(nextState);
      }
    };

    const handleOnline = () => setState("syncing");
    const handleOffline = () => setState("error");

    window.addEventListener("notava-sync", handleSyncEvent);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("notava-sync", handleSyncEvent);
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  return (
    <div
      aria-label={label}
      title={label}
      className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl border border-white/70 bg-white/82 text-[#33406d] shadow-[0_8px_22px_rgba(15,23,42,0.1)] transition hover:bg-white"
      data-testid="sync-status-indicator"
      data-sync-state={state}
    >
      {state === "synced" ? (
        <Check aria-hidden="true" className="h-[18px] w-[18px] text-[#198754]" />
      ) : null}
      {state === "syncing" ? (
        <LoaderCircle aria-hidden="true" className="h-[18px] w-[18px] animate-spin text-[#4361ee]" />
      ) : null}
      {state === "error" ? (
        <AlertTriangle aria-hidden="true" className="h-[18px] w-[18px] text-[#d9480f]" />
      ) : null}
    </div>
  );
}
