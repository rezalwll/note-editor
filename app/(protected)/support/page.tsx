import type { Metadata } from "next";
import Link from "next/link";
import { Headphones, MessageSquareText, Send } from "lucide-react";

import { SupportStatusBadge } from "@/components/support-status-badge";
import { SupportTicketForm } from "@/components/support-ticket-form";
import { requireUser } from "@/lib/auth";
import { getSectionDocumentTitle } from "@/lib/page-title";
import { prisma } from "@/lib/prisma";
import {
  formatSupportDate,
  getSupportCategoryLabel,
} from "@/lib/support";

export const metadata: Metadata = {
  title: getSectionDocumentTitle("پشتیبانی"),
};

export default async function SupportPage() {
  const user = await requireUser();
  const tickets = await prisma.supportTicket.findMany({
    where: { userId: user.id },
    orderBy: { lastMessageAt: "desc" },
    include: {
      _count: { select: { messages: true } },
      messages: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { body: true, isStaff: true },
      },
    },
  });

  return (
    <main className="min-h-full bg-[linear-gradient(180deg,#f8f9ff_0%,#fff_42%)] px-4 py-5 xl:px-6" dir="rtl">
      <div className="mx-auto grid w-full max-w-6xl gap-5 lg:grid-cols-[0.92fr_1.08fr]">
        <section className="rounded-[28px] border border-indigo-100 bg-white p-5 shadow-[0_18px_50px_rgba(79,70,229,0.08)] sm:p-7">
          <div className="mb-6 flex items-start gap-4">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-indigo-100 text-indigo-700">
              <Headphones className="h-6 w-6" />
            </span>
            <div>
              <p className="text-xs font-semibold text-indigo-600">ارتباط مستقیم با توسعه‌دهنده</p>
              <h1 className="mt-1 text-2xl font-bold text-slate-900">چه چیزی را بهتر کنیم؟</h1>
              <p className="mt-2 text-sm leading-7 text-slate-500">
                گزارش مشکل، پیشنهاد قابلیت یا پرسش خود را بفرستید. پاسخ و روند بررسی در همین بخش قابل پیگیری است.
              </p>
            </div>
          </div>
          <SupportTicketForm />
        </section>

        <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-[0_18px_50px_rgba(15,23,42,0.06)] sm:p-7">
          <div className="mb-5 flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold text-slate-500">پیگیری درخواست‌ها</p>
              <h2 className="mt-1 text-xl font-bold text-slate-900">گفت‌وگوهای شما</h2>
            </div>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
              {tickets.length.toLocaleString("fa-IR")} درخواست
            </span>
          </div>

          {tickets.length ? (
            <div className="grid gap-3">
              {tickets.map((ticket) => (
                <Link
                  key={ticket.id}
                  href={`/support/${ticket.id}`}
                  className="group rounded-2xl border border-slate-200 p-4 transition hover:-translate-y-0.5 hover:border-indigo-200 hover:shadow-[0_12px_28px_rgba(79,70,229,0.08)]"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-slate-900">{ticket.subject}</p>
                      <p className="mt-1 text-xs text-slate-500">
                        {getSupportCategoryLabel(ticket.category)} · {formatSupportDate(ticket.lastMessageAt)}
                      </p>
                    </div>
                    <SupportStatusBadge status={ticket.status} />
                  </div>
                  <p className="mt-3 line-clamp-2 text-sm leading-6 text-slate-600">
                    {ticket.messages[0]?.isStaff ? "پشتیبانی: " : ""}
                    {ticket.messages[0]?.body}
                  </p>
                  <div className="mt-3 flex items-center justify-between text-xs text-slate-400">
                    <span className="inline-flex items-center gap-1">
                      <MessageSquareText className="h-3.5 w-3.5" />
                      {ticket._count.messages.toLocaleString("fa-IR")} پیام
                    </span>
                    <span className="inline-flex items-center gap-1 font-medium text-indigo-600">
                      مشاهده گفت‌وگو
                      <Send className="h-3.5 w-3.5 rotate-180" />
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <div className="flex min-h-64 flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50/70 px-6 text-center">
              <MessageSquareText className="h-10 w-10 text-slate-300" />
              <p className="mt-3 font-semibold text-slate-700">هنوز درخواستی ندارید</p>
              <p className="mt-1 text-sm leading-6 text-slate-500">
                اولین پیام را از فرم همین صفحه برای ما بفرستید.
              </p>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
