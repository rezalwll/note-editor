"use client";

import Link from "next/link";
import { useActionState } from "react";

import {
  completeSignupVerificationAction,
  resendSignupVerificationCodeAction,
  type AuthActionState,
} from "@/app/actions";
import { SubmitButton } from "@/components/forms/submit-button";

const initialState: AuthActionState = {};

type SignupVerificationFormProps = {
  email: string;
  supportEmail: string | null;
};

export function SignupVerificationForm({
  email,
  supportEmail,
}: SignupVerificationFormProps) {
  const [verifyState, verifyAction] = useActionState(
    completeSignupVerificationAction,
    initialState,
  );
  const [resendState, resendAction] = useActionState(
    resendSignupVerificationCodeAction,
    initialState,
  );

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm leading-7 text-emerald-800">
        کد تایید به <span dir="ltr">{email}</span> ارسال شد. آن را ظرف ۳۰ دقیقه وارد کنید و پوشه Spam را هم بررسی کنید.
      </div>

      <form action={verifyAction} className="space-y-5">
        <input type="hidden" name="email" value={email} />
        <div className="space-y-3">
          <label htmlFor="code" className="mb-3 block text-sm font-medium text-stone-700">
            کد تایید
          </label>
          <input
            id="code"
            name="code"
            type="text"
            required
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]{6}"
            dir="ltr"
            className="w-full rounded-2xl border border-stone-300 bg-white px-4 py-3 text-center text-2xl tracking-[0.45em] text-stone-900 shadow-sm outline-none ring-0 transition placeholder:text-stone-400 focus:border-amber-500"
            placeholder="000000"
          />
        </div>
        {verifyState.error ? (
          <p className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {verifyState.error}
          </p>
        ) : null}
        <SubmitButton pendingText="در حال بررسی..." className="w-full">
          تکمیل ثبت‌نام
        </SubmitButton>
      </form>

      <form action={resendAction} className="space-y-4">
        <input type="hidden" name="email" value={email} />
        {resendState.error ? (
          <p className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {resendState.error}
          </p>
        ) : null}
        {resendState.success ? (
          <p className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
            {resendState.success}
          </p>
        ) : null}
        <div className="flex flex-col gap-3 sm:flex-row">
          <SubmitButton
            pendingText="در حال ارسال..."
            className="w-full bg-stone-900 hover:bg-stone-800 sm:w-auto"
          >
            ارسال دوباره کد
          </SubmitButton>
          <Link
            href={`/signup?email=${encodeURIComponent(email)}`}
            className="inline-flex w-full items-center justify-center rounded-2xl border border-stone-300 px-4 py-3 text-sm font-medium text-stone-700 transition hover:border-stone-400 hover:text-stone-950 sm:w-auto"
          >
            تغییر ایمیل / شروع دوباره
          </Link>
        </div>
      </form>

      <p className="text-center text-sm leading-7 text-stone-600">
        اگر ایمیل را پیدا نکردید، Inbox و Spam را بررسی کنید.
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
    </div>
  );
}
