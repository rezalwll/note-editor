import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Mail, UserRound } from "lucide-react";
import { notFound } from "next/navigation";

import { updateSupportTicketAction } from "@/app/actions";
import { SubmitButton } from "@/components/forms/submit-button";
import { SupportReplyForm } from "@/components/support-reply-form";
import { SupportStatusBadge } from "@/components/support-status-badge";
import { requireAdmin } from "@/lib/admin";
import { getSectionDocumentTitle } from "@/lib/page-title";
import { prisma } from "@/lib/prisma";
import {
  SUPPORT_PRIORITIES,
  SUPPORT_PRIORITY_LABELS,
  SUPPORT_STATUSES,
  SUPPORT_STATUS_LABELS,
  formatSupportDate,
  getSupportCategoryLabel,
} from "@/lib/support";

export const metadata: Metadata = {
  title: getSectionDocumentTitle("بررسی پیام پشتیبانی"),
};

export default async function AdminSupportTicketPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdmin();
  const { id } = await params;
  const ticket = await prisma.supportTicket.findUnique({
    where: { id },
    include: {
      user: {
        select: {
          displayName: true,
          username: true,
          email: true,
          createdAt: true,
          lastSeenAt: true,
          totalPageViews: true,
        },
      },
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

  return (
    <section className="grid gap-4 xl:grid-cols-[1fr_320px]">
      <article className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <Link href="/admin/support" className="mb-4 inline-flex items-center gap-2 text-sm font-medium text-indigo-700">
          <ArrowRight className="h-4 w-4" />
          بازگشت به پیام‌ها
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-100 pb-5">
          <div>
            <p className="text-xs font-semibold text-indigo-600">{getSupportCategoryLabel(ticket.category)}</p>
            <h2 className="mt-1 text-2xl font-bold text-slate-900">{ticket.subject}</h2>
            <p className="mt-2 text-xs text-slate-500">{formatSupportDate(ticket.createdAt)}</p>
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
                  {message.isStaff ? `پشتیبانی · ${message.author.displayName}` : message.author.displayName}
                </span>
                <time className="text-slate-400">{formatSupportDate(message.createdAt)}</time>
              </div>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-7 text-slate-700">{message.body}</p>
            </article>
          ))}
        </div>

        {ticket.status !== "CLOSED" ? (
          <div className="border-t border-slate-100 pt-5">
            <SupportReplyForm ticketId={ticket.id} admin />
            {ticket.user.email ? (
              <p className="mt-2 text-xs text-slate-400">
                پس از پاسخ، یک اعلان ایمیلی هم برای کاربر ارسال می‌شود.
              </p>
            ) : null}
          </div>
        ) : (
          <p className="rounded-2xl bg-slate-100 px-4 py-3 text-sm text-slate-600">این گفت‌وگو بسته شده است.</p>
        )}
      </article>

      <aside className="space-y-4">
        <section className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="font-bold text-slate-900">وضعیت درخواست</h3>
          <form action={updateSupportTicketAction} className="mt-4 grid gap-3">
            <input type="hidden" name="ticketId" value={ticket.id} />
            <label className="grid gap-2 text-xs font-medium text-slate-600">
              وضعیت
              <select name="status" defaultValue={ticket.status} className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm">
                {SUPPORT_STATUSES.map((status) => (
                  <option key={status} value={status}>{SUPPORT_STATUS_LABELS[status]}</option>
                ))}
              </select>
            </label>
            <label className="grid gap-2 text-xs font-medium text-slate-600">
              اولویت
              <select name="priority" defaultValue={ticket.priority} className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm">
                {SUPPORT_PRIORITIES.map((priority) => (
                  <option key={priority} value={priority}>{SUPPORT_PRIORITY_LABELS[priority]}</option>
                ))}
              </select>
            </label>
            <SubmitButton pendingText="در حال ذخیره…" className="w-full shadow-none">ذخیره وضعیت</SubmitButton>
          </form>
        </section>

        <section className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="font-bold text-slate-900">مشخصات کاربر</h3>
          <div className="mt-4 space-y-3 text-sm text-slate-600">
            <p className="flex items-center gap-2"><UserRound className="h-4 w-4 text-slate-400" />{ticket.user.displayName}</p>
            <p className="text-xs" dir="ltr">@{ticket.user.username}</p>
            {ticket.user.email ? (
              <p className="flex items-center gap-2 break-all text-xs" dir="ltr"><Mail className="h-4 w-4 shrink-0 text-slate-400" />{ticket.user.email}</p>
            ) : null}
            <div className="border-t border-slate-100 pt-3 text-xs leading-6 text-slate-500">
              <p>عضویت: {formatSupportDate(ticket.user.createdAt)}</p>
              <p>آخرین فعالیت: {ticket.user.lastSeenAt ? formatSupportDate(ticket.user.lastSeenAt) : "ثبت نشده"}</p>
              <p>بازدیدها: {ticket.user.totalPageViews.toLocaleString("fa-IR")}</p>
            </div>
          </div>
        </section>
      </aside>
    </section>
  );
}
