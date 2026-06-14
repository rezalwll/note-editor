"use client";

import { useActionState } from "react";

import {
  changePasswordAction,
  type PasswordActionState,
} from "@/app/actions";
import { SubmitButton } from "@/components/forms/submit-button";

const initialState: PasswordActionState = {};

export function PasswordForm() {
  const [state, formAction] = useActionState(changePasswordAction, initialState);

  return (
    <form action={formAction} className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2">
        <label className="space-y-1.5">
          <span className="text-sm font-medium text-stone-700">Current password</span>
          <input
            name="currentPassword"
            type="password"
            required
            autoComplete="current-password"
            className="w-full rounded-xl border border-stone-300 bg-white px-3.5 py-2.5 text-sm text-stone-900 outline-none transition focus:border-amber-500"
          />
        </label>
        <label className="space-y-1.5">
          <span className="text-sm font-medium text-stone-700">New password</span>
          <input
            name="newPassword"
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            className="w-full rounded-xl border border-stone-300 bg-white px-3.5 py-2.5 text-sm text-stone-900 outline-none transition focus:border-amber-500"
          />
        </label>
      </div>
      {state.error ? (
        <p className="rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-sm text-rose-700">
          {state.error}
        </p>
      ) : null}
      {state.success ? (
        <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-sm text-emerald-700">
          {state.success}
        </p>
      ) : null}
      <SubmitButton pendingText="Updating...">Change Password</SubmitButton>
    </form>
  );
}
