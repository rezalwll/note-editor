"use client";

import Link from "next/link";
import { useActionState } from "react";

import { signupAction, type AuthActionState } from "@/app/actions";
import { SubmitButton } from "@/components/forms/submit-button";

const initialState: AuthActionState = {};

export function SignupForm() {
  const [state, formAction] = useActionState(signupAction, initialState);

  return (
    <form action={formAction} className="space-y-4">
      <div className="space-y-2">
        <label htmlFor="displayName" className="text-sm font-medium text-stone-700">
          Display name
        </label>
        <input
          id="displayName"
          name="displayName"
          type="text"
          required
          autoComplete="name"
          className="w-full rounded-2xl border border-stone-300 bg-white px-4 py-3 text-stone-900 shadow-sm outline-none ring-0 transition placeholder:text-stone-400 focus:border-amber-500"
          placeholder="Your name"
        />
      </div>
      <div className="space-y-2">
        <label htmlFor="username" className="text-sm font-medium text-stone-700">
          Username
        </label>
        <input
          id="username"
          name="username"
          type="text"
          required
          autoComplete="username"
          autoCapitalize="none"
          className="w-full rounded-2xl border border-stone-300 bg-white px-4 py-3 text-stone-900 shadow-sm outline-none ring-0 transition placeholder:text-stone-400 focus:border-amber-500"
          placeholder="lowercase_username"
        />
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <label htmlFor="password" className="text-sm font-medium text-stone-700">
            Password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            required
            autoComplete="new-password"
            minLength={8}
            className="w-full rounded-2xl border border-stone-300 bg-white px-4 py-3 text-stone-900 shadow-sm outline-none ring-0 transition placeholder:text-stone-400 focus:border-amber-500"
            placeholder="At least 8 characters"
          />
        </div>
        <div className="space-y-2">
          <label htmlFor="confirmPassword" className="text-sm font-medium text-stone-700">
            Confirm password
          </label>
          <input
            id="confirmPassword"
            name="confirmPassword"
            type="password"
            required
            autoComplete="new-password"
            minLength={8}
            className="w-full rounded-2xl border border-stone-300 bg-white px-4 py-3 text-stone-900 shadow-sm outline-none ring-0 transition placeholder:text-stone-400 focus:border-amber-500"
            placeholder="Repeat the password"
          />
        </div>
      </div>
      {state.error ? (
        <p className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {state.error}
        </p>
      ) : null}
      <SubmitButton pendingText="Creating..." className="w-full">
        Create account
      </SubmitButton>
      <p className="text-center text-sm text-stone-600">
        Already have an account?{" "}
        <Link href="/login" className="font-medium text-amber-700 hover:text-amber-800">
          Sign in
        </Link>
      </p>
    </form>
  );
}
