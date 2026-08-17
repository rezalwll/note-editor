"use client";

import Link from "next/link";
import { useEffect } from "react";

import { reportClientError } from "@/lib/client-observability";

type RouteErrorStateProps = {
  error: Error & { digest?: string };
  reset: () => void;
  scope: "protected-layout" | "editor" | "root";
};

export function RouteErrorState({ error, reset, scope }: RouteErrorStateProps) {
  useEffect(() => {
    reportClientError(error, {
      source: `error-boundary.${scope}`,
      route: window.location.pathname,
      metadata: { digest: error.digest ?? "unknown" },
    });
  }, [error, scope]);

  return (
    <main
      className="flex min-h-[60vh] items-center justify-center bg-[#f7f7ff] px-6 py-12"
      dir="rtl"
    >
      <section className="w-full max-w-lg rounded-3xl border border-[#d8ddff] bg-white p-8 text-center shadow-[0_18px_60px_rgba(159,161,255,0.16)]">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#fff1f2] text-2xl font-bold text-[#be123c]">
          !
        </div>
        <h1 className="mt-5 text-xl font-semibold text-[#2d3561]">
          {scope === "editor"
            ? "باز کردن ویرایشگر با مشکل روبه‌رو شد"
            : "این صفحه فعلاً قابل نمایش نیست"}
        </h1>
        <p className="mt-3 text-sm leading-7 text-[#7080a3]">
          ارتباط با برنامه قطع شد یا خطایی پیش آمد. اطلاعات شما حذف نشده است؛
          دوباره تلاش کنید و اگر مشکل ادامه داشت به صفحهٔ اصلی برگردید.
        </p>
        {error.digest ? (
          <p className="mt-2 text-xs text-[#98a2b3]">
            کد پیگیری: <span dir="ltr">{error.digest}</span>
          </p>
        ) : null}
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <button
            type="button"
            onClick={reset}
            className="rounded-xl bg-[#6f78f7] px-5 py-2.5 text-sm font-medium text-white transition hover:bg-[#5d66e8]"
          >
            تلاش دوباره
          </button>
          <Link
            href="/workspace"
            className="rounded-xl border border-[#d8ddff] bg-white px-5 py-2.5 text-sm font-medium text-[#3d4b73] transition hover:bg-[#f7fbff]"
          >
            صفحهٔ اصلی
          </Link>
        </div>
      </section>
    </main>
  );
}
