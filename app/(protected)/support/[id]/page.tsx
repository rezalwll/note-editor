import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, CheckCircle2 } from "lucide-react";
import { notFound } from "next/navigation";

import { resolveOwnSupportTicketAction } from "@/app/actions";
import { SubmitButton } from "@/components/forms/submit-button";
import { SupportReplyForm } from "@/components/support-reply-form";
import { SupportStatusBadge } from "@/components/support-status-badge";
import { requireUser } from "@/lib/auth";
import { getSectionDocumentTitle } from "@/lib/page-title";
import { prisma } from "@/lib/prisma";
import {
  formatSupportDate,
  getSupportCategoryLabel,
} from "@/lib/support";

export const metadata: Metadata = {
  title: getSectionDocumentTitle("گفت‌وگوی پشتیبانی"),
};

export default async function SupportTicketPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireUser();
  const ticket = await prisma.supportTicket.findFirst({
    where: { id, userId: user.id },
    include: {
      messages: {
        orderBy: { createdAt: "asc" },
        include: {
          author: { select: { displayName: true } },
        },
      },
    },
  });
  if (!ticket) {
    notFound();
  }

  const canReply = ticket.status !== "CLOSED";
  const resolveAction = resolveOwnSupportTicketAction.bind(null, ticket.id);

  return (
    <main className="min-h-full bg-[linear-gradient(180deg,#f8f9ff_0%,#fff_42%)] px-4 py-5 xl:px-6" dir="rtl">
      <div className="mx-auto w-full max-w-4xl">
        <Link
          href="/support"
          className="mb-4 inline-flex items-center gap-2 text-sm font-medium text-indigo-700 hover:text-indigo-900"
        >
          <ArrowRight className="h-4 w-4" />
          بازگشت به پشتیبانی
        </Link>

        <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-[0_18px_50px_rgba(15,23,42,0.06)] sm:p-7">
          <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-100 pb-5">
            <div>
              <p className="text-xs font-semibold text-indigo-600">{getSupportCategoryLabel(ticket.category)}</p>
              <h1 className="mt-1 text-2xl font-bold text-slate-900">{ticket.subject}</h1>
              <p className="mt-2 text-xs text-slate-500">
                ساخته‌شده در {formatSupportDate(ticket.createdAt)}
              </p>
            </div>
            <SupportStatusBadge status={ticket.status} />
          </div>

          <div className="my-6 grid gap-4">
            {ticket.messages.map((message) => (
              <article
                key={message.id}
                className={`max-w-[88%] rounded-2xl px-4 py-3 ${
                  message.isStaff
                    ? "mr-auto border border-indigo-100 bg-indigo-50"
                    : "ml-auto border border-slate-200 bg-slate-50"
                }`}
              >
                <div className="flex items-center justify-between gap-4 text-xs">
                  <span className="font-semibold text-slate-700">
                    {message.isStaff ? "پشتیبانی نوتاوا" : message.author.displayName}
                  </span>
                  <time className="text-slate-400">{formatSupportDate(message.createdAt)}</time>
                </div>
                <p className="mt-2 whitespace-pre-wrap text-sm leading-7 text-slate-700">{message.body}</p>
              </article>
            ))}
          </div>

          {canReply ? (
            <div className="border-t border-slate-100 pt-5">
              <SupportReplyForm ticketId={ticket.id} />
            </div>
          ) : (
            <p className="rounded-2xl bg-slate-100 px-4 py-3 text-sm text-slate-600">
              این گفت‌وگو بسته شده است.
            </p>
          )}

          {!["RESOLVED", "CLOSED"].includes(ticket.status) ? (
            <form action={resolveAction} className="mt-4">
              <SubmitButton
                pendingText="در حال ثبت…"
                className="w-full bg-emerald-600 shadow-none hover:bg-emerald-700 sm:w-auto"
              >
                <CheckCircle2 className="ml-2 h-4 w-4" />
                مشکلم حل شد
              </SubmitButton>
            </form>
          ) : null}
        </section>
      </div>
    </main>
  );
}
