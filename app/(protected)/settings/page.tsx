import { PasswordForm } from "@/components/forms/password-form";
import { ProfileForm } from "@/components/forms/profile-form";
import { LogoutForm } from "@/components/forms/logout-form";
import { WorkspacePortabilityCard } from "@/components/forms/workspace-portability-card";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getUserAccent, getUserInitials } from "@/lib/users";

function formatDate(value: Date) {
  return new Intl.DateTimeFormat("en", {
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
    <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
      <div className="space-y-6">
        <section className="rounded-[34px] border border-stone-200 bg-white/80 p-7 shadow-[0_18px_60px_rgba(28,25,23,0.08)]">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-amber-700">
            Profile
          </p>
          <div className="mt-5 flex flex-col gap-5 md:flex-row md:items-center">
            <div
              className="flex h-20 w-20 shrink-0 items-center justify-center rounded-[28px] text-2xl font-semibold text-white shadow-lg"
              style={{ backgroundColor: getUserAccent(user.username) }}
            >
              {getUserInitials(user.displayName)}
            </div>
            <div className="space-y-2">
              <h1 className="font-serif text-5xl tracking-tight text-stone-950">
                {user.displayName}
              </h1>
              <p className="text-sm text-stone-600">@{user.username}</p>
              <p className="text-sm text-stone-500">
                Account created {formatDate(user.createdAt)}
              </p>
            </div>
          </div>
          {user.mustChangePassword ? (
            <div className="mt-6 rounded-[28px] border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-800">
              This account is still using the bootstrap password path. Change the password below before sharing the workspace.
            </div>
          ) : null}
        </section>

        <section className="rounded-[34px] border border-stone-200 bg-white/88 p-7 shadow-[0_18px_60px_rgba(28,25,23,0.08)]">
          <h2 className="mb-6 font-serif text-3xl text-stone-950">Edit account</h2>
          <ProfileForm
            username={user.username}
            displayName={user.displayName}
          />
        </section>

        <section className="rounded-[34px] border border-stone-200 bg-white/88 p-7 shadow-[0_18px_60px_rgba(28,25,23,0.08)]">
          <h2 className="mb-6 font-serif text-3xl text-stone-950">Security</h2>
          <PasswordForm />
        </section>
      </div>

      <div className="space-y-6">
        <section className="rounded-[34px] border border-stone-200 bg-white/88 p-7 shadow-[0_18px_60px_rgba(28,25,23,0.08)]">
          <h2 className="font-serif text-3xl text-stone-950">Workspace stats</h2>
          <div className="mt-6 grid gap-4 sm:grid-cols-3">
            <div className="rounded-[24px] border border-stone-200 bg-stone-50/80 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-stone-500">
                Notebooks
              </p>
              <p className="mt-3 text-3xl font-semibold text-stone-950">{notebookCount}</p>
            </div>
            <div className="rounded-[24px] border border-stone-200 bg-stone-50/80 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-stone-500">
                Pages
              </p>
              <p className="mt-3 text-3xl font-semibold text-stone-950">{pageCount}</p>
            </div>
            <div className="rounded-[24px] border border-stone-200 bg-stone-50/80 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-stone-500">
                Attachments
              </p>
              <p className="mt-3 text-3xl font-semibold text-stone-950">
                {attachmentCount}
              </p>
            </div>
          </div>
          <p className="mt-5 text-sm text-stone-600">
            Last workspace activity: {formatDate(lastUpdated)}
          </p>
        </section>

        <section className="rounded-[34px] border border-stone-200 bg-white/88 p-7 shadow-[0_18px_60px_rgba(28,25,23,0.08)]">
          <h2 className="mb-6 font-serif text-3xl text-stone-950">Import and export</h2>
          <WorkspacePortabilityCard />
        </section>

        <section className="rounded-[34px] border border-stone-200 bg-white/88 p-7 shadow-[0_18px_60px_rgba(28,25,23,0.08)]">
          <h2 className="mb-3 font-serif text-3xl text-stone-950">Session</h2>
          <p className="mb-5 text-sm leading-6 text-stone-600">
            Sign out on shared devices to keep each workspace private.
          </p>
          <LogoutForm />
        </section>
      </div>
    </div>
  );
}
