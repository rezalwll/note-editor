"use client";

import { logoutAction } from "@/app/actions";
import { SubmitButton } from "@/components/forms/submit-button";

export function LogoutForm() {
  return (
    <form action={logoutAction}>
      <SubmitButton
        pendingText="Signing out..."
        className="w-full justify-center bg-stone-100 py-2 text-stone-900 hover:bg-stone-200"
      >
        Sign out
      </SubmitButton>
    </form>
  );
}
