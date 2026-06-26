import type { Metadata } from "next";
import Link from "next/link";
import { ShieldCheck } from "lucide-react";

import { SignupVerificationForm } from "@/components/forms/signup-verification-form";
import { getSupportEmail } from "@/lib/email-auth";
import { getSectionDocumentTitle } from "@/lib/page-title";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: getSectionDocumentTitle("تایید ثبت نام"),
};

type SignupVerifyPageProps = {
  searchParams: Promise<{
    email?: string;
  }>;
};

export default async function SignupVerifyPage({
  searchParams,
}: SignupVerifyPageProps) {
  const { email } = await searchParams;

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(245,158,11,0.14),_transparent_30%),linear-gradient(180deg,_#fff8ef_0%,_#f3f7ff_100%)] px-4 py-8">
      <div className="mx-auto grid min-h-[calc(100vh-4rem)] max-w-xl items-center">
        <section className="rounded-[36px] border border-stone-200 bg-white/88 p-8 shadow-[0_24px_80px_rgba(28,25,23,0.12)] backdrop-blur">
          <div className="mb-6 inline-flex items-center gap-3 rounded-full bg-amber-50 px-4 py-2 text-sm font-medium text-amber-800">
            <ShieldCheck className="h-4 w-4" />
            تایید ایمیل
          </div>
          <div className="mb-8 space-y-3">
            <h1 className="font-serif text-4xl tracking-tight text-stone-950">
              ثبت‌نام را کامل کنید
            </h1>
          </div>
          {email ? (
            <SignupVerificationForm
              email={email}
              supportEmail={getSupportEmail()}
            />
          ) : (
            <div className="space-y-4">
              <p className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-7 text-amber-800">
                ایمیل ثبت‌نام مشخص نیست. دوباره از ابتدا ثبت‌نام را شروع کنید.
              </p>
              <Link href="/signup" className="font-medium text-amber-700 hover:text-amber-800">
                بازگشت به ثبت‌نام
              </Link>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
