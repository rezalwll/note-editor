import type { Metadata } from "next";

import { ForgotPasswordForm } from "@/components/forms/forgot-password-form";
import { getSupportEmail } from "@/lib/email-auth";
import { getSectionDocumentTitle } from "@/lib/page-title";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: getSectionDocumentTitle("فراموشی رمز عبور"),
};

export default function ForgotPasswordPage() {
  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(245,158,11,0.12),_transparent_30%),linear-gradient(180deg,_#fff9f1_0%,_#f7efe4_100%)] px-4 py-8">
      <div className="mx-auto grid min-h-[calc(100vh-4rem)] max-w-xl items-center">
        <section className="rounded-[36px] border border-stone-200 bg-white/88 p-8 shadow-[0_24px_80px_rgba(28,25,23,0.12)] backdrop-blur">
          <div className="mb-8 space-y-3">
            <h1 className="font-serif text-4xl tracking-tight text-stone-950">
              بازیابی رمز عبور
            </h1>
            <p className="text-sm leading-7 text-stone-600">
              ایمیل حساب خود را وارد کنید تا لینک بازیابی برایتان ارسال شود.
            </p>
          </div>
          <ForgotPasswordForm supportEmail={getSupportEmail()} />
        </section>
      </div>
    </main>
  );
}
