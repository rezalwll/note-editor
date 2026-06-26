import type { Metadata } from "next";
import Link from "next/link";

import { ResetPasswordForm } from "@/components/forms/reset-password-form";
import { getSupportEmail } from "@/lib/email-auth";
import { getSectionDocumentTitle } from "@/lib/page-title";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: getSectionDocumentTitle("رمز عبور جدید"),
};

type ResetPasswordPageProps = {
  searchParams: Promise<{
    token?: string;
  }>;
};

export default async function ResetPasswordPage({
  searchParams,
}: ResetPasswordPageProps) {
  const { token } = await searchParams;

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(16,185,129,0.14),_transparent_30%),linear-gradient(180deg,_#f4fbf8_0%,_#edf7ff_100%)] px-4 py-8">
      <div className="mx-auto grid min-h-[calc(100vh-4rem)] max-w-xl items-center">
        <section className="rounded-[36px] border border-stone-200 bg-white/88 p-8 shadow-[0_24px_80px_rgba(28,25,23,0.12)] backdrop-blur">
          <div className="mb-8 space-y-3">
            <h1 className="font-serif text-4xl tracking-tight text-stone-950">
              ساخت رمز عبور جدید
            </h1>
          </div>
          {token ? (
            <ResetPasswordForm token={token} supportEmail={getSupportEmail()} />
          ) : (
            <div className="space-y-4">
              <p className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm leading-7 text-rose-700">
                لینک بازیابی ناقص است. دوباره درخواست بازیابی بدهید.
              </p>
              <Link href="/forgot-password" className="font-medium text-amber-700 hover:text-amber-800">
                درخواست لینک جدید
              </Link>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
