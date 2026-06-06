import { PasswordForm } from "@/components/forms/password-form";
import { requireUser } from "@/lib/auth";

export default async function SecurityPage() {
  const user = await requireUser();

  return (
    <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
      <section className="rounded-[34px] border border-stone-200 bg-white/80 p-7 shadow-[0_18px_60px_rgba(28,25,23,0.08)]">
        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-amber-700">
          Security
        </p>
        <h1 className="mt-3 font-serif text-5xl tracking-tight text-stone-950">
          Protect the entrance.
        </h1>
        <p className="mt-4 max-w-2xl text-sm leading-7 text-stone-600">
          In this version, authentication is the main security boundary. Keep the password strong and rotate it after the initial bootstrap login.
        </p>
        {user.mustChangePassword ? (
          <div className="mt-6 rounded-[28px] border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-800">
            You are still using the bootstrap password path. Change it now.
          </div>
        ) : null}
      </section>

      <section className="rounded-[34px] border border-stone-200 bg-white/88 p-7 shadow-[0_18px_60px_rgba(28,25,23,0.08)]">
        <h2 className="mb-6 font-serif text-3xl text-stone-950">Change password</h2>
        <PasswordForm />
      </section>
    </div>
  );
}
