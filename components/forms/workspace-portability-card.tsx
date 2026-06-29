"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

export function WorkspacePortabilityCard() {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function handleSubmit(formData: FormData) {
    setPending(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch("/api/profile/import", {
        method: "POST",
        body: formData,
      });
      const payload = (await response.json()) as {
        error?: string;
        imported?: {
          groups: number;
          notebooks: number;
          pages: number;
          attachments: number;
        };
      };

      if (!response.ok) {
        throw new Error(payload.error || "بازیابی انجام نشد.");
      }

      setSuccess(
        `${payload.imported?.notebooks ?? 0} زیرمجموعه و ${
          payload.imported?.pages ?? 0
        } صفحه با موفقیت بازیابی شد.`,
      );
      formRef.current?.reset();
      router.refresh();
    } catch (submissionError) {
      setError(
        submissionError instanceof Error
          ? submissionError.message
          : "بازیابی انجام نشد.",
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-[20px] border border-stone-200 bg-stone-50/70 p-4">
        <p className="text-sm font-medium text-stone-800">پشتیبان گیری</p>
        <p className="mt-1.5 text-sm leading-6 text-stone-600">
          یک فایل zip از همه یادداشت ها
        </p>
        <a
          href="/api/profile/export"
          className="mt-3 inline-flex items-center justify-center rounded-full bg-[#7682ff] px-4 py-2 text-sm font-semibold !text-white shadow-[0_12px_24px_rgba(118,130,255,0.28)] transition hover:bg-[#5d6bff]"
        >
          پشتیبان گیری
        </a>
      </div>

      <form
        ref={formRef}
        className="rounded-[20px] border border-stone-200 bg-stone-50/70 p-4"
        onSubmit={async (event) => {
          event.preventDefault();
          const formData = new FormData(event.currentTarget);
          await handleSubmit(formData);
        }}
      >
        <p className="text-sm font-medium text-stone-800">بازیابی</p>
        <p className="mt-1.5 text-sm leading-6 text-stone-600">
          یادداشت های جدید شما با یادداشت های قدیمی ادغام می شوند
        </p>
        <label className="mt-4 block space-y-3">
          <span className="text-sm font-medium text-stone-700">فایل آرشیو</span>
          <input
            name="archive"
            type="file"
            accept=".zip,application/zip"
            required
            disabled={pending}
            className="block w-full rounded-xl border border-stone-300 bg-white px-3.5 py-2.5 text-sm text-stone-900"
          />
        </label>
        {error ? (
          <p className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-sm text-rose-700">
            {error}
          </p>
        ) : null}
        {success ? (
          <p className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-sm text-emerald-700">
            {success}
          </p>
        ) : null}
        <button
          type="submit"
          disabled={pending}
          className="mt-3 inline-flex items-center justify-center rounded-full bg-[#7682ff] px-4 py-2 text-sm font-semibold !text-white shadow-[0_12px_24px_rgba(118,130,255,0.28)] transition hover:bg-[#5d6bff] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending ? "در حال بازیابی..." : "بازیابی"}
        </button>
      </form>
    </div>
  );
}
