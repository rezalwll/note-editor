"use client";

import { AlertTriangle, Check, LoaderCircle } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { SyncConflictDialog } from "@/components/sync-conflict-dialog";
import { listConflictRecords } from "@/lib/offline-db/client";
import type { SyncStatus } from "@/lib/offline-db/types";

type SyncIndicatorState = "synced" | "syncing" | "error" | "conflict";

type SyncEventDetail = {
  type?: string;
  phase?: "start" | "complete" | "error";
  syncStatus?: SyncStatus;
};

const STATUS_COPY: Record<SyncIndicatorState, string> = {
  synced: "همه تغییرات با سرور همگام شده‌اند",
  syncing: "در حال ذخیره و همگام‌سازی تغییرات...",
  error: "همگام‌سازی با خطا روبه‌رو شد؛ اتصال اینترنت یا وضعیت سرور را بررسی کنید",
  conflict: "تعارض همگام‌سازی وجود دارد؛ برای انتخاب نسخه موردنظر کلیک کنید",
};

function getStateFromSyncDetail(detail: SyncEventDetail): SyncIndicatorState | null {
  if (detail.phase === "start" || detail.syncStatus === "pending") {
    return "syncing";
  }

  if (
    detail.phase === "error" ||
    detail.syncStatus === "failed"
  ) {
    return "error";
  }

  if (detail.syncStatus === "conflict") {
    return "conflict";
  }

  if (detail.phase === "complete" || detail.syncStatus === "synced") {
    return "synced";
  }

  return null;
}

export function SyncStatusIndicator({ userId }: { userId: string }) {
  const [state, setState] = useState<SyncIndicatorState>(() => {
    if (typeof navigator === "undefined") {
      return "synced";
    }

    return navigator.onLine ? "synced" : "error";
  });
  const [conflictCount, setConflictCount] = useState(0);
  const [dialogOpen, setDialogOpen] = useState(false);
  const label = STATUS_COPY[state];
  const handleCountChange = useCallback((count: number) => {
    setConflictCount(count);
    if (count > 0) {
      setState("conflict");
    } else if (navigator.onLine) {
      setState("synced");
    }
  }, []);

  useEffect(() => {
    const refreshConflictCount = async () => {
      try {
        const conflicts = await listConflictRecords(userId);
        setConflictCount(conflicts.length);
        if (conflicts.length > 0) {
          setState("conflict");
        }
      } catch {
        // IndexedDB can be unavailable in privacy-restricted environments.
      }
    };

    const handleSyncEvent = (event: Event) => {
      const detail = (event as CustomEvent<SyncEventDetail>).detail;
      const nextState = detail ? getStateFromSyncDetail(detail) : null;

      if (nextState) {
        setState(nextState);
      }

      if (detail?.syncStatus === "conflict" || detail?.type === "conflict-resolved") {
        void refreshConflictCount();
      }
    };

    const handleOnline = () => setState("syncing");
    const handleOffline = () => setState("error");

    window.addEventListener("notava-sync", handleSyncEvent);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    void refreshConflictCount();
    return () => {
      window.removeEventListener("notava-sync", handleSyncEvent);
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [userId]);

  return (
    <>
      <button
        type="button"
        aria-label={label}
        title={label}
        onClick={() => setDialogOpen(true)}
        className="relative inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl border border-white/70 bg-white/82 text-[#33406d] shadow-[0_8px_22px_rgba(15,23,42,0.1)] transition hover:bg-white"
        data-testid="sync-status-indicator"
        data-sync-state={state}
      >
        {state === "synced" ? (
          <Check aria-hidden="true" className="h-[18px] w-[18px] text-[#198754]" />
        ) : null}
        {state === "syncing" ? (
          <LoaderCircle aria-hidden="true" className="h-[18px] w-[18px] animate-spin text-[#4361ee]" />
        ) : null}
        {state === "error" || state === "conflict" ? (
          <AlertTriangle
            aria-hidden="true"
            className={`h-[18px] w-[18px] ${state === "conflict" ? "text-[#b54708]" : "text-[#d9480f]"}`}
          />
        ) : null}
        {conflictCount > 0 ? (
          <span className="absolute -right-1.5 -top-1.5 inline-flex min-h-4 min-w-4 items-center justify-center rounded-full bg-[#d92d20] px-1 text-[9px] font-bold leading-none text-white">
            {conflictCount.toLocaleString("fa-IR")}
          </span>
        ) : null}
      </button>
      <SyncConflictDialog
        userId={userId}
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onCountChange={handleCountChange}
      />
    </>
  );
}
