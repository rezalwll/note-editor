"use client";

import { useActionState } from "react";

import {
  resetPasswordAction,
  type ResetPasswordActionState,
} from "@/app/actions";
import { SubmitButton } from "@/components/forms/submit-button";

const initialState: ResetPasswordActionState = {};

type ResetPasswordFormProps = {
  token: string;
  supportEmail: string | null;
};

export function ResetPasswordForm({
  token,
  supportEmail,
}: ResetPasswordFormProps) {
  const [state, formAction] = useActionState(resetPasswordAction, initialState);

  return (
    <form action={formAction} className="space-y-5">
      <input type="hidden" name="token" value={token} />
      <div className="space-y-3">
        <label htmlFor="password" className="mb-3 block text-sm font-medium text-stone-700">
          رمز عبور جدید
        </label>
        <input
          id="password"
          name="password"
          type="password"
          required
          autoComplete="new-password"
          className="w-full rounded-2xl border border-stone-300 bg-white px-4 py-3 text-stone-900 shadow-sm outline-none ring-0 transition placeholder:text-stone-400 focus:border-amber-500"
        />
      </div>
      <div className="space-y-3">
        <label
          htmlFor="confirmPassword"
          className="mb-3 block text-sm font-medium text-stone-700"
        >
          تکرار رمز عبور
        </label>
        <input
          id="confirmPassword"
          name="confirmPassword"
          type="password"
          required
          autoComplete="new-password"
          className="w-full rounded-2xl border border-stone-300 bg-white px-4 py-3 text-stone-900 shadow-sm outline-none ring-0 transition placeholder:text-stone-400 focus:border-amber-500"
        />
      </div>
      {state.error ? (
        <p className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm leading-7 text-rose-700">
          {state.error}
        </p>
      ) : null}
      {state.success ? (
        <p className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          {state.success}
        </p>
      ) : null}
      <SubmitButton pendingText="در حال ثبت رمز..." className="w-full">
        ثبت رمز عبور جدید
      </SubmitButton>
      <p className="text-center text-sm leading-7 text-stone-600">
        اگر لینک کار نکرد یا منقضی شد، دوباره درخواست بازیابی بدهید.
        {supportEmail ? (
          <>
            {" "}
            در صورت نیاز با{" "}
            <a href={`mailto:${supportEmail}`} className="font-medium text-amber-700 hover:text-amber-800">
              پشتیبانی
            </a>{" "}
            تماس بگیرید.
          </>
        ) : null}
      </p>
    </form>
  );
}
