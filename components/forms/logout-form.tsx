"use client";

import { logoutAction } from "@/app/actions";
import { SubmitButton } from "@/components/forms/submit-button";

export function LogoutForm() {
  return (
    <form action={logoutAction}>
      <SubmitButton
        pendingText="در حال خروج..."
        className="w-full justify-center bg-[#e25555] py-2 text-white hover:bg-[#cb4545]"
      >
        خروج از حساب
      </SubmitButton>
    </form>
  );
}
