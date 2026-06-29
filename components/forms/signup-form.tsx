"use client";

import Link from "next/link";
import { useActionState } from "react";

import { signupAction, type AuthActionState } from "@/app/actions";
import { SubmitButton } from "@/components/forms/submit-button";

const initialState: AuthActionState = {};

type SignupFormProps = {
  initialEmail?: string;
};

export function SignupForm({ initialEmail = "" }: SignupFormProps) {
  const [state, formAction] = useActionState(signupAction, initialState);

  return (
    <form action={formAction} className="space-y-5">
      <div className="space-y-3">
        <label htmlFor="displayName" className="mb-3 block text-sm font-medium text-stone-700">
          نام
        </label>
        <input
          id="displayName"
          name="displayName"
          type="text"
          required
          autoComplete="name"
          className="w-full rounded-2xl border border-stone-300 bg-white px-4 py-3 text-stone-900 shadow-sm outline-none ring-0 transition placeholder:text-stone-400 focus:border-amber-500"
          placeholder="نام شما"
        />
      </div>
      <div className="space-y-3">
        <label htmlFor="username" className="mb-3 block text-sm font-medium text-stone-700">
          نام کاربری
        </label>
        <input
          id="username"
          name="username"
          type="text"
          required
          autoComplete="username"
          autoCapitalize="none"
          dir="ltr"
          className="w-full rounded-2xl border border-stone-300 bg-white px-4 py-3 text-right text-stone-900 shadow-sm outline-none ring-0 transition placeholder:text-stone-400 focus:border-amber-500"
          placeholder="نام کاربری"
        />
      </div>
      <div className="space-y-3">
        <label htmlFor="email" className="mb-3 block text-sm font-medium text-stone-700">
          ایمیل
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          defaultValue={initialEmail}
          autoComplete="email"
          dir="ltr"
          className="w-full rounded-2xl border border-stone-300 bg-white px-4 py-3 text-left text-stone-900 shadow-sm outline-none ring-0 transition placeholder:text-stone-400 focus:border-amber-500"
          placeholder="you@example.com"
        />
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-3">
          <label htmlFor="password" className="mb-3 block text-sm font-medium text-stone-700">
            رمز عبور
          </label>
          <input
            id="password"
            name="password"
            type="password"
            required
            autoComplete="new-password"
            className="w-full rounded-2xl border border-stone-300 bg-white px-4 py-3 text-stone-900 shadow-sm outline-none ring-0 transition placeholder:text-stone-400 focus:border-amber-500"
            placeholder="رمز عبور دلخواه"
          />
        </div>
        <div className="space-y-3">
          <label htmlFor="confirmPassword" className="mb-3 block text-sm font-medium text-stone-700">
            تکرار رمز عبور
          </label>
          <input
            id="confirmPassword"
            name="confirmPassword"
            type="password"
            required
            autoComplete="new-password"
            className="w-full rounded-2xl border border-stone-300 bg-white px-4 py-3 text-stone-900 shadow-sm outline-none ring-0 transition placeholder:text-stone-400 focus:border-amber-500"
            placeholder="رمز عبور را دوباره وارد کنید"
          />
        </div>
      </div>
      <p className="rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3 text-sm leading-7 text-stone-600">
        بعد از ثبت‌نام، یک کد ۶ رقمی برای شما ایمیل می‌شود. پوشه Spam را هم بررسی کنید.
      </p>
      {state.error ? (
        <p className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {state.error}
        </p>
      ) : null}
      <SubmitButton pendingText="در حال ارسال کد..." className="w-full">
        ثبت‌نام
      </SubmitButton>
      <p className="text-center text-sm text-stone-600">
        از قبل حساب دارید؟{" "}
        <Link href="/login" className="font-medium text-amber-700 hover:text-amber-800">
          وارد شوید
        </Link>
      </p>
    </form>
  );
}
