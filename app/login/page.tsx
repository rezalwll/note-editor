import type { Metadata } from "next";

import { LoginForm } from "@/components/forms/login-form";
import { LoginGradientBackground } from "@/components/login-gradient-background";
import { getSectionDocumentTitle } from "@/lib/page-title";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: getSectionDocumentTitle("ورود"),
};

type LoginPageProps = {
  searchParams: Promise<{
    passwordReset?: string;
  }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const { passwordReset } = await searchParams;

  return (
    <main className="relative isolate min-h-[100dvh] overflow-hidden px-3 py-4 sm:px-4 sm:py-8">
      <LoginGradientBackground />
      <div className="relative z-10 mx-auto grid min-h-[calc(100dvh-2rem)] max-w-xl items-center sm:min-h-[calc(100vh-4rem)]">
        <section className="rounded-[30px] border border-white/55 bg-white/82 p-6 shadow-[0_24px_80px_rgba(33,0,100,0.24)] backdrop-blur-xl sm:rounded-[36px] sm:p-8">
          <div className="mb-8 space-y-3">
            <h2 className="font-serif text-3xl tracking-tight text-[var(--text-strong)] sm:text-4xl">
              ورود به نوتاوا
            </h2>
          </div>
          {passwordReset === "success" ? (
            <p className="mb-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm leading-7 text-emerald-700">
              رمز عبور جدید ثبت شد. حالا با اطلاعات تازه وارد شوید.
            </p>
          ) : null}
          <LoginForm />
        </section>
      </div>
    </main>
  );
}
