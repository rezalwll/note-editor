import { PasswordForm } from "@/components/forms/password-form";
import { ProfileForm } from "@/components/forms/profile-form";
import { LogoutForm } from "@/components/forms/logout-form";
import { WorkspacePortabilityCard } from "@/components/forms/workspace-portability-card";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getUserAccent, getUserInitials } from "@/lib/users";

function formatDate(value: Date) {
  return new Intl.DateTimeFormat("fa-IR-u-ca-persian", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(value);
}

export default async function SettingsPage() {
  const user = await requireUser();
  const [notebookCount, pageCount, attachmentCount, latestPage, latestNotebook] =
    await Promise.all([
      prisma.notebook.count({ where: { userId: user.id } }),
      prisma.page.count({ where: { userId: user.id } }),
      prisma.attachment.count({ where: { userId: user.id } }),
      prisma.page.findFirst({
        where: { userId: user.id },
        orderBy: { updatedAt: "desc" },
        select: { updatedAt: true },
      }),
      prisma.notebook.findFirst({
        where: { userId: user.id },
        orderBy: { updatedAt: "desc" },
        select: { updatedAt: true },
      }),
    ]);

  const lastUpdated =
    latestPage?.updatedAt && latestNotebook?.updatedAt
      ? latestPage.updatedAt > latestNotebook.updatedAt
        ? latestPage.updatedAt
        : latestNotebook.updatedAt
      : latestPage?.updatedAt ?? latestNotebook?.updatedAt ?? user.updatedAt;

  return (
    <div className="mx-auto w-full max-w-[1120px] px-4 py-4 xl:px-6">
      <div className="grid gap-4 xl:grid-cols-[1.05fr_0.95fr]">
        <div className="space-y-4">
          <section className="rounded-[26px] border border-stone-200 bg-white/92 p-5 shadow-[0_12px_34px_rgba(28,25,23,0.06)]">
            <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-amber-700">
              پروفایل
            </p>
            <div className="mt-4 flex flex-col gap-4 md:flex-row md:items-center">
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
                <p className="text-sm text-stone-600" dir="ltr">@{user.username}</p>
                <p className="text-xs text-stone-500">
                  تاریخ ساخت حساب: {formatDate(user.createdAt)}
                </p>
              </div>
            </div>
            {user.mustChangePassword ? (
              <div className="mt-4 rounded-[20px] border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                این حساب هنوز از مسیر رمز اولیه استفاده می‌کند. قبل از استفاده‌ی اشتراکی، رمز عبور را از بخش پایین تغییر دهید.
              </div>
            ) : null}
          </section>

          <section className="rounded-[26px] border border-stone-200 bg-white/92 p-5 shadow-[0_12px_34px_rgba(28,25,23,0.06)]">
            <h2 className="mb-4 font-serif text-[2rem] text-stone-950">حساب کاربری</h2>
            <ProfileForm
              username={user.username}
              displayName={user.displayName}
            />
          </section>

          <section className="rounded-[26px] border border-stone-200 bg-white/92 p-5 shadow-[0_12px_34px_rgba(28,25,23,0.06)]">
            <h2 className="mb-4 font-serif text-[2rem] text-stone-950">امنیت</h2>
            <PasswordForm />
          </section>
        </div>

        <div className="space-y-4">
          <section className="rounded-[26px] border border-stone-200 bg-white/92 p-5 shadow-[0_12px_34px_rgba(28,25,23,0.06)]">
            <h2 className="font-serif text-[2rem] text-stone-950">فضای کاری</h2>
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <div className="rounded-[18px] border border-stone-200 bg-stone-50/70 p-3.5">
                <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-stone-500">
                  دفترها
                </p>
                <p className="mt-2 text-2xl font-semibold text-stone-950">{notebookCount}</p>
              </div>
              <div className="rounded-[18px] border border-stone-200 bg-stone-50/70 p-3.5">
                <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-stone-500">
                  صفحه‌ها
                </p>
                <p className="mt-2 text-2xl font-semibold text-stone-950">{pageCount}</p>
              </div>
              <div className="rounded-[18px] border border-stone-200 bg-stone-50/70 p-3.5">
                <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-stone-500">
                  فایل‌ها
                </p>
                <p className="mt-2 text-2xl font-semibold text-stone-950">
                  {attachmentCount}
                </p>
              </div>
            </div>
            <p className="mt-4 text-sm text-stone-600">
              آخرین فعالیت: {formatDate(lastUpdated)}
            </p>
          </section>

          <section className="rounded-[26px] border border-stone-200 bg-white/92 p-5 shadow-[0_12px_34px_rgba(28,25,23,0.06)]">
            <h2 className="mb-4 font-serif text-[2rem] text-stone-950">درون‌ریزی و برون‌بری</h2>
            <WorkspacePortabilityCard />
          </section>

          <section className="rounded-[26px] border border-stone-200 bg-white/92 p-5 shadow-[0_12px_34px_rgba(28,25,23,0.06)]">
            <h2 className="mb-2 font-serif text-[2rem] text-stone-950">نشست</h2>
            <p className="mb-4 text-sm leading-6 text-stone-600">
              روی دستگاه‌های مشترک از حساب خارج شوید تا فضای کاری هر نفر خصوصی بماند.
            </p>
            <LogoutForm />
          </section>
        </div>
      </div>
    </div>
  );
}
