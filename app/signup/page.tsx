import type { Metadata } from "next";
import { UserRoundPlus } from "lucide-react";

import { SignupForm } from "@/components/forms/signup-form";
import { getSectionDocumentTitle } from "@/lib/page-title";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: getSectionDocumentTitle("ثبت نام"),
};

export default function SignupPage() {
  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(16,185,129,0.16),_transparent_30%),linear-gradient(180deg,_#f4fbf8_0%,_#edf7ff_100%)] px-4 py-8">
      <div className="mx-auto grid min-h-[calc(100vh-4rem)] max-w-xl items-center">
        <section className="rounded-[36px] border border-stone-200 bg-white/88 p-8 shadow-[0_24px_80px_rgba(28,25,23,0.12)] backdrop-blur">
          <div className="mb-6 inline-flex items-center gap-3 rounded-full bg-emerald-50 px-4 py-2 text-sm font-medium text-emerald-800">
            <UserRoundPlus className="h-4 w-4" />
            ساخت حساب کاربری
          </div>
          <div className="mb-8 space-y-3">
            <h2 className="font-serif text-4xl tracking-tight text-stone-950">
              شروع فضای کاری شما
            </h2>
          </div>
          <SignupForm />
        </section>
      </div>
    </main>
  );
}
