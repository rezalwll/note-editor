"use client";

import { useActionState } from "react";

import {
  createSupportTicketAction,
  type SupportActionState,
} from "@/app/actions";
import { SubmitButton } from "@/components/forms/submit-button";
import {
  SUPPORT_CATEGORIES,
  SUPPORT_CATEGORY_LABELS,
} from "@/lib/support";

const initialState: SupportActionState = {};

export function SupportTicketForm() {
  const [state, action] = useActionState(
    createSupportTicketAction,
    initialState,
  );

  return (
    <form action={action} className="grid gap-4">
      <label className="grid gap-2 text-sm font-medium text-slate-700">
        نوع درخواست
        <select
          name="category"
          defaultValue="FEEDBACK"
          className="h-11 rounded-2xl border border-slate-200 bg-white px-3 outline-none transition focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100"
        >
          {SUPPORT_CATEGORIES.map((category) => (
            <option key={category} value={category}>
              {SUPPORT_CATEGORY_LABELS[category]}
            </option>
          ))}
        </select>
      </label>

      <label className="grid gap-2 text-sm font-medium text-slate-700">
        موضوع
        <input
          name="subject"
          required
          minLength={3}
          maxLength={120}
          placeholder="مثلاً پیشنهاد برای بهترشدن ویرایشگر"
          className="h-11 rounded-2xl border border-slate-200 bg-white px-4 outline-none transition placeholder:text-slate-400 focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100"
        />
      </label>

      <label className="grid gap-2 text-sm font-medium text-slate-700">
        توضیحات
        <textarea
          name="message"
          required
          minLength={10}
          maxLength={5000}
          rows={6}
          placeholder="هرچه جزئیات بیشتری بنویسید، بررسی دقیق‌تر و سریع‌تر انجام می‌شود."
          className="resize-y rounded-2xl border border-slate-200 bg-white px-4 py-3 leading-7 outline-none transition placeholder:text-slate-400 focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100"
        />
      </label>

      {state.error ? (
        <p role="alert" className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {state.error}
        </p>
      ) : null}

      <SubmitButton pendingText="در حال ارسال…" className="w-full sm:w-auto">
        ارسال برای پشتیبانی
      </SubmitButton>
    </form>
  );
}
