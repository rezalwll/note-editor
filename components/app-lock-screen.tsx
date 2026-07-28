"use client";

import { KeyRound, LockKeyhole, LogOut, Mail, RotateCcw } from "lucide-react";
import { useState } from "react";

import { BrandLogo } from "@/components/brand-logo";
import { PatternLockGrid } from "@/components/pattern-lock-grid";
import {
  getSafeAppLockReturnPath,
  MIN_PATTERN_LENGTH,
  normalizeVerificationCode,
} from "@/lib/pattern-lock";

type AppLockScreenProps = {
  maskedEmail: string | null;
  returnTo: string;
};

type View = "unlock" | "code" | "new-pattern";

export function AppLockScreen({
  maskedEmail,
  returnTo,
}: AppLockScreenProps) {
  const [view, setView] = useState<View>("unlock");
  const [pattern, setPattern] = useState<number[]>([]);
  const [firstPattern, setFirstPattern] = useState<number[] | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  function finishUnlock() {
    window.location.replace(getSafeAppLockReturnPath(returnTo));
  }

  async function unlock(points: number[]) {
    if (points.length < MIN_PATTERN_LENGTH) {
      setError("الگو باید حداقل چهار نقطه داشته باشد.");
      setPattern([]);
      return;
    }

    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/app-lock/unlock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pattern: points }),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) {
        setError(result.error ?? "بازکردن قفل ممکن نشد.");
        setPattern([]);
        return;
      }
      finishUnlock();
    } catch {
      setError("ارتباط با سرور برقرار نشد.");
      setPattern([]);
    } finally {
      setBusy(false);
    }
  }

  async function requestRecoveryCode() {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/app-lock/recovery/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const result = (await response.json()) as {
        error?: string;
        email?: string;
      };
      if (!response.ok) {
        setError(result.error ?? "ارسال کد ممکن نشد.");
        return;
      }
      setMessage(`کد بازیابی به ${result.email ?? maskedEmail ?? "ایمیل شما"} ارسال شد.`);
      setView("code");
    } catch {
      setError("ارتباط با سرور برقرار نشد.");
    } finally {
      setBusy(false);
    }
  }

  function continueWithCode() {
    const normalizedCode = normalizeVerificationCode(code);
    if (!normalizedCode) {
      setError("کد شش‌رقمی را کامل وارد کنید.");
      return;
    }
    setCode(normalizedCode);
    setPattern([]);
    setFirstPattern(null);
    setError("");
    setView("new-pattern");
  }

  async function resetPattern(points: number[]) {
    if (points.length < MIN_PATTERN_LENGTH) {
      setError("الگوی جدید باید حداقل چهار نقطه داشته باشد.");
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
      setError("تکرار الگوی جدید یکسان نبود؛ دوباره رسم کنید.");
      setPattern([]);
      return;
    }

    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/app-lock/recovery/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, pattern: points }),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) {
        setError(result.error ?? "بازیابی الگو ممکن نشد.");
        setPattern([]);
        if (response.status === 401 || response.status === 410) {
          setView("code");
          setFirstPattern(null);
        }
        return;
      }
      finishUnlock();
    } catch {
      setError("ارتباط با سرور برقرار نشد.");
      setPattern([]);
    } finally {
      setBusy(false);
    }
  }

  async function logout() {
    setBusy(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } finally {
      window.location.replace("/login");
    }
  }

  return (
    <main className="relative min-h-[100dvh] overflow-hidden bg-[radial-gradient(circle_at_20%_15%,rgba(159,161,255,0.46),transparent_32%),radial-gradient(circle_at_85%_78%,rgba(174,226,255,0.6),transparent_35%),linear-gradient(145deg,#f4f3ff_0%,#eef8ff_52%,#f3fff5_100%)] px-4 py-6">
      <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.18)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.18)_1px,transparent_1px)] bg-[size:42px_42px]" />
      <section className="relative mx-auto flex min-h-[calc(100dvh-3rem)] max-w-[470px] items-center">
        <div className="w-full rounded-[36px] border border-white/75 bg-white/82 p-5 shadow-[0_36px_120px_rgba(61,75,115,0.2)] backdrop-blur-xl sm:p-8">
          <BrandLogo
            frameClassName="mx-auto mb-5 h-9 w-[140px]"
            showWordmark={false}
            priority
          />

          <div className="mb-5 text-center">
            <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-[22px] bg-[linear-gradient(135deg,#8f96ff,#9edfff)] text-white shadow-[0_16px_36px_rgba(116,124,255,0.32)]">
              {view === "code" ? (
                <Mail className="h-8 w-8" />
              ) : view === "new-pattern" ? (
                <KeyRound className="h-8 w-8" />
              ) : (
                <LockKeyhole className="h-8 w-8" />
              )}
            </div>
            <h1 className="text-2xl font-semibold text-[#2d3561]">
              {view === "unlock"
                ? "برنامه قفل است"
                : view === "code"
                  ? "کد بازیابی"
                  : firstPattern
                    ? "تکرار الگوی جدید"
                    : "الگوی جدید"}
            </h1>
            <p className="mt-2 text-sm leading-7 text-[#7080a3]">
              {view === "unlock"
                ? "برای دسترسی به یادداشت‌ها، الگوی خود را رسم کنید."
                : view === "code"
                  ? `کد شش‌رقمی ارسال‌شده به ${maskedEmail ?? "ایمیل حساب"} را وارد کنید.`
                  : firstPattern
                    ? "همان الگوی جدید را دوباره رسم کنید."
                    : "حداقل چهار نقطه را برای الگوی جایگزین به هم وصل کنید."}
            </p>
          </div>

          {view === "code" ? (
            <div className="mx-auto max-w-[320px] space-y-4">
              <input
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                value={code}
                onChange={(event) => setCode(event.target.value)}
                aria-label="کد بازیابی"
                placeholder="کد ۶ رقمی"
                dir="ltr"
                className="h-14 w-full rounded-2xl border border-[#d8ddff] bg-white px-4 text-center text-xl tracking-[0.45em] text-[#2d3561] outline-none transition focus:border-[#858cff] focus:ring-4 focus:ring-[#9fa1ff]/15"
              />
              <button
                type="button"
                onClick={continueWithCode}
                disabled={busy}
                className="h-12 w-full rounded-2xl bg-[linear-gradient(135deg,#858cff,#7ecdf7)] text-sm font-semibold text-white shadow-[0_12px_28px_rgba(116,124,255,0.25)] disabled:opacity-50"
              >
                ادامه و تعریف الگوی جدید
              </button>
              <button
                type="button"
                onClick={() => void requestRecoveryCode()}
                disabled={busy}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl py-2 text-sm text-[#5d6b91] disabled:opacity-50"
              >
                <RotateCcw className="h-4 w-4" />
                ارسال دوباره کد
              </button>
            </div>
          ) : (
            <PatternLockGrid
              value={pattern}
              onChange={setPattern}
              onComplete={(points) =>
                view === "unlock"
                  ? void unlock(points)
                  : void resetPattern(points)
              }
              disabled={busy}
              invalid={Boolean(error)}
              label={
                view === "unlock"
                  ? "الگوی بازکردن برنامه"
                  : "الگوی جدید برنامه"
              }
            />
          )}

          <div className="mt-4 min-h-8 text-center">
            {error ? (
              <p className="text-sm leading-7 text-rose-600" role="alert">
                {error}
              </p>
            ) : message ? (
              <p className="text-sm leading-7 text-emerald-700">{message}</p>
            ) : (
              <p className="text-xs text-[#8a95ad]">
                اطلاعات الگو به‌صورت رمزنگاری‌شده نگهداری می‌شود.
              </p>
            )}
          </div>

          <div className="mt-3 flex items-center justify-center gap-3 border-t border-[#e7eaff] pt-4">
            {view === "unlock" ? (
              <button
                type="button"
                onClick={() => void requestRecoveryCode()}
                disabled={busy || !maskedEmail}
                className="rounded-xl px-3 py-2 text-sm text-[#59688f] transition hover:bg-[#f2f4ff] disabled:cursor-not-allowed disabled:opacity-45"
              >
                الگو را فراموش کرده‌ام
              </button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setView("unlock");
                  setPattern([]);
                  setFirstPattern(null);
                  setError("");
                }}
                disabled={busy}
                className="rounded-xl px-3 py-2 text-sm text-[#59688f] transition hover:bg-[#f2f4ff]"
              >
                بازگشت به ورود الگو
              </button>
            )}
            <button
              type="button"
              onClick={() => void logout()}
              disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm text-rose-600 transition hover:bg-rose-50 disabled:opacity-50"
            >
              <LogOut className="h-4 w-4" />
              خروج از حساب
            </button>
          </div>
        </div>
      </section>
    </main>
  );
}
