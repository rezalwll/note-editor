"use client";

import { useActionState } from "react";

import {
  type ProfileActionState,
  updateProfileAction,
} from "@/app/actions";
import { SubmitButton } from "@/components/forms/submit-button";

const initialState: ProfileActionState = {};

type ProfileFormProps = {
  username: string;
  displayName: string;
};

export function ProfileForm({ username, displayName }: ProfileFormProps) {
  const [state, formAction] = useActionState(updateProfileAction, initialState);

  return (
    <form action={formAction} className="space-y-5">
      <div className="grid gap-5 md:grid-cols-2">
        <label className="space-y-2">
          <span className="text-sm font-medium text-stone-700">Display name</span>
          <input
            name="displayName"
            type="text"
            required
            defaultValue={displayName}
            autoComplete="name"
            className="w-full rounded-2xl border border-stone-300 bg-white px-4 py-3 text-stone-900 outline-none transition focus:border-amber-500"
          />
        </label>
        <label className="space-y-2">
          <span className="text-sm font-medium text-stone-700">Username</span>
          <input
            name="username"
            type="text"
            required
            defaultValue={username}
            autoComplete="username"
            autoCapitalize="none"
            className="w-full rounded-2xl border border-stone-300 bg-white px-4 py-3 text-stone-900 outline-none transition focus:border-amber-500"
          />
        </label>
      </div>
      {state.error ? (
        <p className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {state.error}
        </p>
      ) : null}
      {state.success ? (
        <p className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          {state.success}
        </p>
      ) : null}
      <SubmitButton pendingText="Saving...">Save profile</SubmitButton>
    </form>
  );
}
