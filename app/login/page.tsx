import type { Metadata } from "next";

import { LoginForm } from "@/components/forms/login-form";
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
    <main className="min-h-[100dvh] overflow-hidden bg-[radial-gradient(circle_at_top,_rgba(251,191,36,0.18),_transparent_32%),linear-gradient(180deg,_#faf7f0_0%,_#efe7da_100%)] px-3 py-4 sm:px-4 sm:py-8">
      <div className="mx-auto grid min-h-[calc(100dvh-2rem)] max-w-xl items-center sm:min-h-[calc(100vh-4rem)]">
        <section className="rounded-[30px] border border-stone-200 bg-white/88 p-6 shadow-[0_24px_80px_rgba(28,25,23,0.12)] backdrop-blur sm:rounded-[36px] sm:p-8">
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
