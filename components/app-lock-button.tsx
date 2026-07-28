"use client";

import { LockKeyhole, X } from "lucide-react";
import { useState } from "react";
import { createPortal } from "react-dom";

import { PatternLockGrid } from "@/components/pattern-lock-grid";
import { MIN_PATTERN_LENGTH } from "@/lib/pattern-lock";

type AppLockButtonProps = {
  configured: boolean;
  recoveryAvailable: boolean;
  variant?: "icon" | "navigation";
};

export function AppLockButton({
  configured,
  recoveryAvailable,
  variant = "icon",
}: AppLockButtonProps) {
  const [setupOpen, setSetupOpen] = useState(false);
  const [pattern, setPattern] = useState<number[]>([]);
  const [firstPattern, setFirstPattern] = useState<number[] | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  function getReturnPath() {
    return `${window.location.pathname}${window.location.search}`;
  }

  async function lockApp() {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/app-lock/lock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) {
        setError(result.error ?? "قفل‌کردن برنامه ممکن نشد.");
        return;
      }
      window.location.assign(
        `/lock?returnTo=${encodeURIComponent(getReturnPath())}`,
      );
    } catch {
      setError("ارتباط با سرور برقرار نشد.");
    } finally {
      setBusy(false);
    }
  }

  function openSetup() {
    setPattern([]);
    setFirstPattern(null);
    setError(
      recoveryAvailable
        ? ""
        : "برای فعال‌کردن قفل و امکان بازیابی، ابتدا ایمیل حساب را در تنظیمات ثبت کنید.",
    );
    setSetupOpen(true);
  }

  function handleClick() {
    if (configured) {
      void lockApp();
    } else {
      openSetup();
    }
  }

  async function completeSetup(points: number[]) {
    if (points.length < MIN_PATTERN_LENGTH) {
      setError("الگو باید حداقل چهار نقطه داشته باشد.");
      setPattern([]);
      return;
    }
    if (!firstPattern) {
      setFirstPattern(points);
      setPattern([]);
      setError("");
      return;
    }
    if (points.join("-") !== firstPattern.join("-")) {
      setError("تکرار الگو یکسان نبود؛ دوباره رسم کنید.");
      setPattern([]);
      return;
    }

    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/app-lock/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pattern: points }),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) {
        setError(result.error ?? "ثبت الگو ممکن نشد.");
        setPattern([]);
        return;
      }
      window.location.assign(
        `/lock?returnTo=${encodeURIComponent(getReturnPath())}`,
      );
    } catch {
      setError("ارتباط با سرور برقرار نشد.");
      setPattern([]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        disabled={busy}
        aria-label={configured ? "قفل‌کردن برنامه" : "تعریف قفل برنامه"}
        title={configured ? "قفل‌کردن برنامه" : "تعریف قفل برنامه"}
        className={
          variant === "navigation"
            ? "inline-flex flex-col items-center justify-center gap-1 rounded-xl py-2 text-xs font-medium text-[#33406d] disabled:opacity-50"
            : "inline-flex h-10 w-10 items-center justify-center rounded-xl border border-white/60 bg-white/82 text-[#33406d] shadow-[0_8px_22px_rgba(15,23,42,0.08)] transition hover:bg-white disabled:opacity-50"
        }
      >
        <LockKeyhole className="h-5 w-5" />
        {variant === "navigation" ? <span>قفل</span> : null}
      </button>

      {error && !setupOpen ? (
        <span className="sr-only" role="alert">
          {error}
        </span>
      ) : null}

      {setupOpen && typeof document !== "undefined"
        ? createPortal(
            <div
              className="fixed inset-0 z-[300] grid place-items-center bg-[#17203a]/45 p-4 backdrop-blur-sm"
              role="dialog"
              aria-modal="true"
              aria-labelledby="app-lock-setup-title"
            >
              <section className="relative w-full max-w-[430px] rounded-[32px] border border-white/70 bg-[#f8f9ff]/95 p-5 shadow-[0_32px_100px_rgba(25,32,72,0.28)] sm:p-7">
                <button
                  type="button"
                  onClick={() => setSetupOpen(false)}
                  disabled={busy}
                  aria-label="بستن"
                  className="absolute left-4 top-4 inline-flex h-9 w-9 items-center justify-center rounded-xl text-[#7080a3] transition hover:bg-white"
                >
                  <X className="h-5 w-5" />
                </button>

                <div className="mb-5 text-center">
                  <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-[linear-gradient(135deg,#9fa1ff,#aee2ff)] text-white shadow-[0_14px_32px_rgba(116,124,255,0.28)]">
                    <LockKeyhole className="h-7 w-7" />
                  </div>
                  <h2
                    id="app-lock-setup-title"
                    className="text-xl font-semibold text-[#2d3561]"
                  >
                    {firstPattern ? "الگو را تکرار کنید" : "تعریف الگوی قفل"}
                  </h2>
                  <p className="mt-2 text-sm leading-7 text-[#7080a3]">
                    {firstPattern
                      ? "برای تأیید، همان مسیر را یک‌بار دیگر رسم کنید."
                      : "حداقل چهار نقطه را بدون برداشتن انگشت یا نشانگر به هم وصل کنید."}
                  </p>
                </div>

                <PatternLockGrid
                  value={pattern}
                  onChange={setPattern}
                  onComplete={(points) => void completeSetup(points)}
                  disabled={busy || !recoveryAvailable}
                  invalid={Boolean(error)}
                  label={
                    firstPattern ? "تکرار الگوی قفل" : "تعریف الگوی قفل"
                  }
                />

                <div className="mt-4 min-h-7 text-center">
                  {error ? (
                    <p className="text-sm text-rose-600" role="alert">
                      {error}
                    </p>
                  ) : (
                    <p className="text-xs text-[#8793ad]">
                      برای شروع دوباره، از هر نقطه‌ای رسم را آغاز کنید.
                    </p>
                  )}
                </div>
              </section>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
