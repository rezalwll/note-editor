"use client";

import Link from "next/link";
import { useActionState } from "react";

import {
  requestPasswordResetAction,
  type ForgotPasswordActionState,
} from "@/app/actions";
import { SubmitButton } from "@/components/forms/submit-button";

const initialState: ForgotPasswordActionState = {};

type ForgotPasswordFormProps = {
  supportEmail: string | null;
};

export function ForgotPasswordForm({ supportEmail }: ForgotPasswordFormProps) {
  const [state, formAction] = useActionState(
    requestPasswordResetAction,
    initialState,
  );

  return (
    <form action={formAction} className="space-y-5">
      <div className="space-y-3">
        <label htmlFor="email" className="mb-3 block text-sm font-medium text-stone-700">
          ایمیل
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
          dir="ltr"
          className="w-full rounded-2xl border border-stone-300 bg-white px-4 py-3 text-left text-stone-900 shadow-sm outline-none ring-0 transition placeholder:text-stone-400 focus:border-amber-500"
          placeholder="you@example.com"
        />
      </div>
      {state.error ? (
        <p className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {state.error}
        </p>
      ) : null}
      {state.success ? (
        <p className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm leading-7 text-emerald-700">
          {state.success}
        </p>
      ) : null}
      <SubmitButton pendingText="در حال ارسال لینک..." className="w-full">
        ارسال لینک بازیابی
      </SubmitButton>
      <p className="text-center text-sm leading-7 text-stone-600">
        اگر ایمیل را ندیدید، پوشه اسپم را هم چک کنید.
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
      <p className="text-center text-sm text-stone-600">
        <Link href="/login" className="font-medium text-amber-700 hover:text-amber-800">
          بازگشت به ورود
        </Link>
      </p>
    </form>
  );
}
