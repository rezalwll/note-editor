"use client";

import { useActionState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

import { loginAction, type AuthActionState } from "@/app/actions";
import { SubmitButton } from "@/components/forms/submit-button";

const initialState: AuthActionState = {};

export function LoginForm() {
  const searchParams = useSearchParams();
  const [state, formAction] = useActionState(loginAction, initialState);
  const next = searchParams.get("next") ?? "/";

  return (
    <form action={formAction} className="space-y-5">
      <input type="hidden" name="next" value={next} />
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
          className="w-full rounded-2xl border border-stone-300 bg-white px-4 py-3 text-right text-stone-900 shadow-sm outline-none ring-0 transition placeholder:text-right placeholder:text-stone-400 focus:border-amber-500"
          placeholder="نام کاربری خود را وارد کنید"
        />
      </div>
      <div className="space-y-3">
        <label htmlFor="password" className="mb-3 block text-sm font-medium text-stone-700">
          رمز عبور
        </label>
        <input
          id="password"
          name="password"
          type="password"
          required
          autoComplete="current-password"
          autoFocus
          className="w-full rounded-2xl border border-stone-300 bg-white px-4 py-3 text-stone-900 shadow-sm outline-none ring-0 transition placeholder:text-stone-400 focus:border-amber-500"
          placeholder="رمز عبور خود را وارد کنید"
        />
      </div>
      {state.error ? (
        <p className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {state.error}
        </p>
      ) : null}
      <SubmitButton pendingText="در حال ورود..." className="w-full">
        ورود
      </SubmitButton>
      <p className="text-center text-sm text-stone-600">
        حساب ندارید؟{" "}
        <Link href="/signup" className="font-medium text-amber-700 hover:text-amber-800">
          ثبت‌نام کنید
        </Link>
      </p>
    </form>
  );
}
