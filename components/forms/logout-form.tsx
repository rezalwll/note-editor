"use client";

import { SubmitButton } from "@/components/forms/submit-button";
import { performSafeLogout } from "@/lib/safe-logout";

type LogoutFormProps = {
  userId: string;
};

export function LogoutForm({ userId }: LogoutFormProps) {
  async function logoutAndClearClientData() {
    await performSafeLogout(userId);
  }

  return (
    <form action={logoutAndClearClientData}>
      <SubmitButton
        pendingText="در حال خروج..."
        className="w-full justify-center bg-[#e25555] py-2 text-white hover:bg-[#cb4545]"
      >
        خروج از حساب
      </SubmitButton>
    </form>
  );
}
