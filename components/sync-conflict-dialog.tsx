"use client";

import { AlertTriangle, Check, LoaderCircle, X } from "lucide-react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";

import {
  listConflictRecords,
  resolveConflictWithLocal,
  resolveConflictWithRemote,
} from "@/lib/offline-db/client";
import type { ConflictRecord } from "@/lib/offline-db/types";
import { processSyncQueue } from "@/lib/sync/client";

type SyncConflictDialogProps = {
  userId: string;
  open: boolean;
  onClose: () => void;
  onCountChange?: (count: number) => void;
};

function isRemoteTombstone(conflict: ConflictRecord) {
  return conflict.remotePayload?.isTombstone === true;
}

function getPayloadText(
  conflict: ConflictRecord,
  side: "local" | "remote",
) {
  const payload = side === "local" ? conflict.localPayload : conflict.remotePayload;
  if (!payload) {
    return "اطلاعات این نسخه در دسترس نیست.";
  }

  if (side === "remote" && isRemoteTombstone(conflict)) {
    return "این مورد در سرور برای همیشه حذف شده است و نسخه‌ای برای جایگزینی وجود ندارد.";
  }

  if (conflict.entityType === "page") {
    const title = typeof payload.title === "string" ? payload.title : "صفحه بدون عنوان";
    const body = typeof payload.bodyText === "string" ? payload.bodyText : "";
    return [title, body].filter(Boolean).join("\n\n") || "صفحه خالی";
  }

  const name = typeof payload.name === "string" ? payload.name : "زیرمجموعه بدون عنوان";
  const description =
    typeof payload.description === "string" ? payload.description : "";
  return [name, description].filter(Boolean).join("\n\n");
}

export function SyncConflictDialog({
  userId,
  open,
  onClose,
  onCountChange,
}: SyncConflictDialogProps) {
  const router = useRouter();
  const [conflicts, setConflicts] = useState<ConflictRecord[]>([]);
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }

    let cancelled = false;
    void listConflictRecords(userId).then((next) => {
      if (!cancelled) {
        setConflicts(next);
        onCountChange?.(next.length);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [onCountChange, open, userId]);

  useEffect(() => {
    if (!open) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !resolvingId) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose, open, resolvingId]);

  async function resolve(conflict: ConflictRecord, choice: "local" | "remote") {
    setResolvingId(conflict.id);
    setError(null);

    try {
      if (choice === "local") {
        await resolveConflictWithLocal(userId, conflict.id);
        await processSyncQueue(userId);
      } else {
        await resolveConflictWithRemote(userId, conflict.id);
      }

      const next = await listConflictRecords(userId);
      setConflicts(next);
      onCountChange?.(next.length);
      router.refresh();
      if (next.length === 0) {
        onClose();
      }
    } catch (cause) {
      console.error("Failed to resolve sync conflict.", cause);
      setError("حل تعارض انجام نشد. اتصال اینترنت را بررسی و دوباره تلاش کنید.");
    } finally {
      setResolvingId(null);
    }
  }

  if (!open || typeof document === "undefined") {
    return null;
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[210] flex items-center justify-center bg-[#101828]/35 p-3 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="sync-conflict-title"
      data-testid="sync-conflict-dialog"
    >
      <section className="flex max-h-[88dvh] w-full max-w-4xl flex-col overflow-hidden rounded-[26px] border border-[#d8deea] bg-white shadow-[0_28px_90px_rgba(15,23,42,0.28)]">
        <header className="flex items-center justify-between gap-4 border-b border-[#e5e9f1] px-5 py-4" dir="rtl">
          <div>
            <h2 id="sync-conflict-title" className="flex items-center gap-2 text-base font-semibold text-[#202a44]">
              <AlertTriangle className="h-5 w-5 text-[#d9480f]" />
              حل تعارض همگام‌سازی
            </h2>
            <p className="mt-1 text-xs leading-6 text-[#667085]">
              برای هر مورد مشخص کنید نسخه این دستگاه حفظ شود یا نسخه سرور.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={Boolean(resolvingId)}
            className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-[#d8deea] text-[#667085] hover:bg-[#f7f8fb] disabled:opacity-50"
            aria-label="بستن"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="overflow-y-auto p-4 sm:p-5" dir="rtl">
          {conflicts.length === 0 ? (
            <div className="flex min-h-40 flex-col items-center justify-center gap-2 text-center">
              <Check className="h-8 w-8 text-[#198754]" />
              <p className="text-sm font-medium text-[#344054]">تعارض حل‌نشده‌ای وجود ندارد.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {conflicts.map((conflict) => {
                const isResolving = resolvingId === conflict.id;
                const remoteIsTombstone = isRemoteTombstone(conflict);
                return (
                  <article key={conflict.id} className="rounded-2xl border border-[#dfe4ed] bg-[#fbfcfe] p-4">
                    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <h3 className="text-sm font-semibold text-[#25304a]">
                          {conflict.entityType === "page" ? "صفحه" : "زیرمجموعه"}
                        </h3>
                        <time className="text-[11px] text-[#7a8498]">
                          {new Date(conflict.createdAt).toLocaleString("fa-IR")}
                        </time>
                      </div>
                      <span className="rounded-full bg-[#fff0e8] px-2.5 py-1 text-[11px] text-[#b54708]">
                        نیازمند انتخاب شما
                      </span>
                    </div>

                    <div className="grid gap-3 md:grid-cols-2">
                      <div className="rounded-xl border border-[#b9d4ff] bg-[#f4f8ff] p-3">
                        <div className="mb-2 text-xs font-semibold text-[#315ea8]">نسخه این دستگاه</div>
                        <p className="max-h-36 overflow-auto whitespace-pre-wrap text-xs leading-6 text-[#344054]">
                          {getPayloadText(conflict, "local")}
                        </p>
                        <button
                          type="button"
                          data-testid={`conflict-use-local-${conflict.id}`}
                          onClick={() => void resolve(conflict, "local")}
                          disabled={Boolean(resolvingId)}
                          className="mt-3 w-full rounded-xl bg-[#4361ee] px-3 py-2 text-xs font-semibold text-white hover:bg-[#3651d4] disabled:opacity-50"
                        >
                          {isResolving
                            ? "در حال اعمال..."
                            : remoteIsTombstone
                              ? "بازیابی نسخه این دستگاه"
                              : "حفظ نسخه این دستگاه"}
                        </button>
                      </div>

                      <div className="rounded-xl border border-[#b9dfc7] bg-[#f3fbf6] p-3">
                        <div className="mb-2 text-xs font-semibold text-[#287a49]">نسخه سرور</div>
                        <p className="max-h-36 overflow-auto whitespace-pre-wrap text-xs leading-6 text-[#344054]">
                          {getPayloadText(conflict, "remote")}
                        </p>
                        <button
                          type="button"
                          data-testid={`conflict-use-remote-${conflict.id}`}
                          onClick={() => void resolve(conflict, "remote")}
                          disabled={Boolean(resolvingId)}
                          className="mt-3 w-full rounded-xl bg-[#2f855a] px-3 py-2 text-xs font-semibold text-white hover:bg-[#28734e] disabled:opacity-50"
                        >
                          {isResolving
                            ? "در حال اعمال..."
                            : remoteIsTombstone
                              ? "پذیرش حذف از سرور"
                              : "استفاده از نسخه سرور"}
                        </button>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}

          {error ? (
            <p className="mt-4 rounded-xl border border-[#f5c2c7] bg-[#fff5f5] px-3 py-2 text-xs text-[#b42318]">
              {error}
            </p>
          ) : null}
        </div>
      </section>
    </div>,
    document.body,
  );
}
