import { LockKeyhole, Sparkles } from "lucide-react";

import { BrandLogo } from "@/components/brand-logo";
import { LoginForm } from "@/components/forms/login-form";

export default function LoginPage() {
  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(251,191,36,0.18),_transparent_32%),linear-gradient(180deg,_#faf7f0_0%,_#efe7da_100%)] px-4 py-8">
      <div className="mx-auto grid min-h-[calc(100vh-4rem)] max-w-6xl items-center gap-8 lg:grid-cols-[1.2fr_0.8fr]">
        <section className="rounded-[40px] border border-white/60 bg-stone-950 px-8 py-10 text-stone-50 shadow-[0_30px_90px_rgba(28,25,23,0.35)] lg:px-12 lg:py-14">
          <div className="mb-8 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-4 py-2 text-xs uppercase tracking-[0.3em] text-amber-200">
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
            <p className="max-w-xl text-base leading-8 text-stone-300 lg:text-lg">
              Open the domain, unlock with your password, and keep writing. Notes, study drafts, ideas, and practical life records live in one place.
            </p>
          </div>
        </section>

        <section className="rounded-[36px] border border-stone-200 bg-white/88 p-8 shadow-[0_24px_80px_rgba(28,25,23,0.12)] backdrop-blur">
          <div className="mb-6 inline-flex items-center gap-3 rounded-full bg-amber-50 px-4 py-2 text-sm font-medium text-amber-800">
            <LockKeyhole className="h-4 w-4" />
            Password required
          </div>
          <div className="mb-8 space-y-3">
            <h2 className="font-serif text-4xl tracking-tight text-stone-950">
              Unlock notava
            </h2>
            <p className="text-sm leading-7 text-stone-600">
              The initial password is seeded from environment configuration. Change it from Security settings after first login.
            </p>
          </div>
          <LoginForm />
        </section>
      </div>
    </main>
  );
}
