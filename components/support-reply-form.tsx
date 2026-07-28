"use client";

import { useActionState } from "react";

import {
  addAdminSupportReplyAction,
  addSupportReplyAction,
  type SupportActionState,
} from "@/app/actions";
import { SubmitButton } from "@/components/forms/submit-button";

const initialState: SupportActionState = {};

export function SupportReplyForm({
  ticketId,
  admin = false,
}: {
  ticketId: string;
  admin?: boolean;
}) {
  const boundAction = admin
    ? addAdminSupportReplyAction.bind(null, ticketId)
    : addSupportReplyAction.bind(null, ticketId);
  const [state, action] = useActionState(boundAction, initialState);

  return (
    <form action={action} className="grid gap-3">
      <label className="grid gap-2 text-sm font-medium text-slate-700">
        {admin ? "پاسخ پشتیبانی" : "پاسخ شما"}
        <textarea
          name="message"
          required
          minLength={2}
          maxLength={5000}
          rows={5}
          placeholder={
            admin
              ? "پاسخ یا نتیجه بررسی را بنویسید…"
              : "اگر نکته یا توضیح بیشتری دارید اینجا بنویسید…"
          }
          className="resize-y rounded-2xl border border-slate-200 bg-white px-4 py-3 leading-7 outline-none transition placeholder:text-slate-400 focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100"
        />
      </label>
      {state.error ? (
        <p role="alert" className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {state.error}
        </p>
      ) : null}
      {state.success ? (
        <p role="status" className="rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          {state.success}
        </p>
      ) : null}
      <SubmitButton pendingText="در حال ارسال…" className="w-full sm:w-auto">
        ارسال پاسخ
      </SubmitButton>
    </form>
  );
}
