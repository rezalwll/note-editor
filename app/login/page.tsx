import { LockKeyhole } from "lucide-react";

import { LoginForm } from "@/components/forms/login-form";

export const dynamic = "force-dynamic";

export default function LoginPage() {
  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(251,191,36,0.18),_transparent_32%),linear-gradient(180deg,_#faf7f0_0%,_#efe7da_100%)] px-4 py-8">
      <div className="mx-auto grid min-h-[calc(100vh-4rem)] max-w-xl items-center">
        <section className="rounded-[36px] border border-stone-200 bg-white/88 p-8 shadow-[0_24px_80px_rgba(28,25,23,0.12)] backdrop-blur">
          <div className="mb-6 inline-flex items-center gap-3 rounded-full bg-amber-50 px-4 py-2 text-sm font-medium text-amber-800">
            <LockKeyhole className="h-4 w-4" />
            Password required
          </div>
          <div className="mb-8 space-y-3">
            <h2 className="font-serif text-4xl tracking-tight text-[var(--text-strong)]">
              Unlock notava
            </h2>
            <p className="text-sm leading-7 text-stone-600">
              Sign in with your username and password to open your private workspace.
            </p>
          </div>
          <LoginForm />
        </section>
      </div>
    </main>
  );
}
