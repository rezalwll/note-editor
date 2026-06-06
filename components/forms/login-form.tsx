"use client";

import { useActionState } from "react";

import { loginAction, type AuthActionState } from "@/app/actions";
import { SubmitButton } from "@/components/forms/submit-button";

const initialState: AuthActionState = {};

export function LoginForm() {
  const [state, formAction] = useActionState(loginAction, initialState);

  return (
    <form action={formAction} className="space-y-4">
      <div className="space-y-2">
        <label htmlFor="password" className="text-sm font-medium text-stone-700">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          required
          autoFocus
          className="w-full rounded-2xl border border-stone-300 bg-white px-4 py-3 text-stone-900 shadow-sm outline-none ring-0 transition placeholder:text-stone-400 focus:border-amber-500"
          placeholder="Enter your password"
        />
      </div>
      {state.error ? (
        <p className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {state.error}
        </p>
      ) : null}
      <SubmitButton pendingText="Unlocking..." className="w-full">
        Unlock Notebook
      </SubmitButton>
    </form>
  );
}
