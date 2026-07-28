import type { Metadata } from "next";
import Link from "next/link";
import { Search } from "lucide-react";

import { SupportStatusBadge } from "@/components/support-status-badge";
import { requireAdmin } from "@/lib/admin";
import { getSectionDocumentTitle } from "@/lib/page-title";
import { prisma } from "@/lib/prisma";
import {
  SUPPORT_STATUSES,
  SUPPORT_STATUS_LABELS,
  formatSupportDate,
  getSupportCategoryLabel,
  isSupportStatus,
} from "@/lib/support";

export const metadata: Metadata = {
  title: getSectionDocumentTitle("پیام‌های پشتیبانی"),
};

const PAGE_SIZE = 30;

export default async function AdminSupportPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string; status?: string }>;
}) {
  await requireAdmin();
  const params = await searchParams;
  const query = params.q?.trim().slice(0, 80) ?? "";
  const status = params.status && isSupportStatus(params.status) ? params.status : "";
  const page = Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1);
  const where = {
    ...(status ? { status } : {}),
    ...(query
      ? {
          OR: [
            { subject: { contains: query } },
            { user: { displayName: { contains: query } } },
            { user: { username: { contains: query } } },
            { user: { email: { contains: query } } },
          ],
        }
      : {}),
  };

  const [tickets, total] = await Promise.all([
    prisma.supportTicket.findMany({
      where,
      orderBy: { lastMessageAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: {
        user: {
          select: { displayName: true, username: true, email: true },
        },
        _count: { select: { messages: true } },
        messages: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { body: true, isStaff: true },
        },
      },
    }),
    prisma.supportTicket.count({ where }),
  ]);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const queryString = `q=${encodeURIComponent(query)}&status=${encodeURIComponent(status)}`;

  return (
    <section className="rounded-[24px] border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
      <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
        <div>
          <h2 className="text-xl font-bold text-slate-900">صندوق پیام‌های پشتیبانی</h2>
          <p className="mt-1 text-sm text-slate-500">{total.toLocaleString("fa-IR")} گفت‌وگو با فیلتر فعلی</p>
        </div>
        <form className="flex w-full max-w-2xl flex-col gap-2 sm:flex-row">
          <label className="relative flex-1">
            <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              name="q"
              defaultValue={query}
              placeholder="موضوع، نام کاربر یا ایمیل"
              className="h-11 w-full rounded-xl border border-slate-200 pr-10 pl-3 text-sm outline-none focus:border-indigo-400"
            />
          </label>
          <select
            name="status"
            defaultValue={status}
            className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-indigo-400"
          >
            <option value="">همه وضعیت‌ها</option>
            {SUPPORT_STATUSES.map((value) => (
              <option key={value} value={value}>{SUPPORT_STATUS_LABELS[value]}</option>
            ))}
          </select>
          <button className="h-11 rounded-xl bg-indigo-600 px-4 text-sm font-semibold text-white">اعمال فیلتر</button>
        </form>
      </div>

      <div className="mt-5 grid gap-3">
        {tickets.map((ticket) => (
          <Link
            key={ticket.id}
            href={`/admin/support/${ticket.id}`}
            className="rounded-2xl border border-slate-200 p-4 transition hover:border-indigo-200 hover:bg-indigo-50/30"
          >
            <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="truncate font-semibold text-slate-900">{ticket.subject}</p>
                  <SupportStatusBadge status={ticket.status} />
                  {ticket.priority === "URGENT" || ticket.priority === "HIGH" ? (
                    <span className="rounded-full bg-rose-50 px-2 py-1 text-[10px] font-semibold text-rose-700">اولویت بالا</span>
                  ) : null}
                </div>
                <p className="mt-1 text-xs text-slate-500">
                  {ticket.user.displayName} · @{ticket.user.username} · {getSupportCategoryLabel(ticket.category)}
                </p>
                <p className="mt-3 line-clamp-2 text-sm leading-6 text-slate-600">
                  {ticket.messages[0]?.isStaff ? "پشتیبانی: " : "کاربر: "}
                  {ticket.messages[0]?.body}
                </p>
              </div>
              <div className="shrink-0 text-xs text-slate-400 sm:text-left">
                <p>{formatSupportDate(ticket.lastMessageAt)}</p>
                <p className="mt-1">{ticket._count.messages.toLocaleString("fa-IR")} پیام</p>
              </div>
            </div>
          </Link>
        ))}
        {!tickets.length ? (
          <p className="rounded-2xl bg-slate-50 py-12 text-center text-sm text-slate-500">
            پیامی مطابق فیلتر پیدا نشد.
          </p>
        ) : null}
      </div>

      {pages > 1 ? (
        <div className="mt-5 flex items-center justify-center gap-3 text-sm">
          {page > 1 ? (
            <Link href={`/admin/support?page=${page - 1}&${queryString}`} className="rounded-xl border border-slate-200 px-4 py-2">صفحه قبل</Link>
          ) : null}
          <span className="text-slate-500">صفحه {page.toLocaleString("fa-IR")} از {pages.toLocaleString("fa-IR")}</span>
          {page < pages ? (
            <Link href={`/admin/support?page=${page + 1}&${queryString}`} className="rounded-xl border border-slate-200 px-4 py-2">صفحه بعد</Link>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
