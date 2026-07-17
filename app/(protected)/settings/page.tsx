import type { Metadata } from "next";

import { LogoutForm } from "@/components/forms/logout-form";
import { PasswordForm } from "@/components/forms/password-form";
import { ProfileForm } from "@/components/forms/profile-form";
import { WorkspacePortabilityCard } from "@/components/forms/workspace-portability-card";
import { requireUser } from "@/lib/auth";
import { getSectionDocumentTitle } from "@/lib/page-title";
import { getUserAccent, getUserInitials } from "@/lib/users";

export const metadata: Metadata = {
  title: getSectionDocumentTitle("تنظیمات"),
};

function formatDate(value: Date) {
  return new Intl.DateTimeFormat("fa-IR-u-ca-persian", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(value);
}

export default async function SettingsPage() {
  const user = await requireUser();

  return (
    <div className="flex w-full justify-center px-4 py-4 xl:px-6">
      <div className="w-full max-w-[960px] space-y-4">
        <section className="rounded-[26px] border border-stone-200 bg-white/92 p-5 shadow-[0_12px_34px_rgba(28,25,23,0.06)]">
          <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-amber-700">
            پروفایل
          </p>
          <div className="mt-4 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="flex flex-col gap-4 md:flex-row md:items-center">
              <div
                className="flex h-16 w-16 shrink-0 items-center justify-center rounded-[22px] text-xl font-semibold text-white shadow-[0_10px_24px_rgba(15,23,42,0.14)]"
                style={{ backgroundColor: getUserAccent(user.username) }}
              >
                {getUserInitials(user.displayName)}
              </div>
              <div className="space-y-1.5">
                <h1 className="font-serif text-4xl tracking-tight text-stone-950">
                  {user.displayName}
                </h1>
                <p className="text-sm text-stone-600" dir="ltr">
                  @{user.username}
                </p>
                <p className="text-xs text-stone-500">
                  تاریخ ساخت حساب: {formatDate(user.createdAt)}
                </p>
              </div>
            </div>
            <div className="w-full md:w-auto">
              <LogoutForm userId={user.id} />
            </div>
          </div>
          {user.mustChangePassword ? (
            <div className="mt-4 rounded-[20px] border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              این حساب هنوز از مسیر رمز اولیه استفاده می‌کند. قبل از استفاده‌ی اشتراکی،
              رمز عبور را از بخش پایین تغییر دهید.
            </div>
          ) : null}
        </section>

        <section className="rounded-[26px] border border-stone-200 bg-white/92 p-5 shadow-[0_12px_34px_rgba(28,25,23,0.06)]">
          <h2 className="mb-4 font-serif text-[2rem] text-stone-950">حساب کاربری</h2>
          <ProfileForm
            username={user.username}
            displayName={user.displayName}
            email={user.email ?? ""}
          />
        </section>

        <section className="rounded-[26px] border border-stone-200 bg-white/92 p-5 shadow-[0_12px_34px_rgba(28,25,23,0.06)]">
          <h2 className="mb-4 font-serif text-[2rem] text-stone-950">امنیت</h2>
          <PasswordForm />
        </section>

        <section className="rounded-[26px] border border-stone-200 bg-white/92 p-5 shadow-[0_12px_34px_rgba(28,25,23,0.06)]">
          <h2 className="mb-4 font-serif text-[2rem] text-stone-950">
            پشتیبان‌گیری و بازیابی
          </h2>
          <WorkspacePortabilityCard />
        </section>
      </div>
    </div>
  );
}
