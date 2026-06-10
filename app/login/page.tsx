import { LockKeyhole, Sparkles } from "lucide-react";

import { BrandLogo } from "@/components/brand-logo";
import { LoginForm } from "@/components/forms/login-form";

export default function LoginPage() {
  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(159,161,255,0.24),_transparent_30%),radial-gradient(circle_at_right,_rgba(174,226,255,0.26),_transparent_28%),linear-gradient(180deg,_#f8f8ff_0%,_#eef7ff_62%,_#f3fff6_100%)] px-4 py-8">
      <div className="mx-auto grid min-h-[calc(100vh-4rem)] max-w-6xl items-center gap-8 lg:grid-cols-[1.2fr_0.8fr]">
        <section className="rounded-[40px] border border-white/70 bg-[linear-gradient(145deg,_#8f95ff_0%,_#a9b5ff_42%,_#aee2ff_100%)] px-8 py-10 text-white shadow-[0_30px_90px_rgba(159,161,255,0.28)] lg:px-12 lg:py-14">
          <div className="mb-8 inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/12 px-4 py-2 text-xs uppercase tracking-[0.3em] text-white/85">
            <Sparkles className="h-4 w-4" />
            Private entrance
          </div>
          <BrandLogo
            className="mb-8"
            frameClassName="h-[84px] w-[280px]"
            imageClassName="scale-[1.7] brightness-[1.08] contrast-[1.04]"
            priority
            showWordmark={false}
          />
          <div className="space-y-5">
            <h1 className="max-w-2xl font-serif text-5xl tracking-tight text-white lg:text-7xl">
              Notava, your private web notebook.
            </h1>
            <p className="max-w-xl text-base leading-8 text-white/82 lg:text-lg">
              Open the domain, unlock with your password, and keep writing. Notes, study drafts, ideas, and practical life records live in one place.
            </p>
          </div>
        </section>

        <section className="rounded-[36px] border border-[var(--border-soft)] bg-white/88 p-8 shadow-[var(--shadow-soft)] backdrop-blur">
          <div className="mb-6 inline-flex items-center gap-3 rounded-full bg-[var(--bg-soft)] px-4 py-2 text-sm font-medium text-[var(--text-main)]">
            <LockKeyhole className="h-4 w-4" />
            Password required
          </div>
          <div className="mb-8 space-y-3">
            <h2 className="font-serif text-4xl tracking-tight text-[var(--text-strong)]">
              Unlock notava
            </h2>
            <p className="text-sm leading-7 text-[var(--text-muted)]">
              The initial password is seeded from environment configuration. Change it from Security settings after first login.
            </p>
          </div>
          <LoginForm />
        </section>
      </div>
    </main>
  );
}
