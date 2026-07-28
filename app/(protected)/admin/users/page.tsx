import type { Metadata } from "next";
import Link from "next/link";
import { Search, ShieldCheck } from "lucide-react";

import { requireAdmin } from "@/lib/admin";
import { getSectionDocumentTitle } from "@/lib/page-title";
import { prisma } from "@/lib/prisma";
import { formatUsageDuration } from "@/lib/usage-analytics";

export const metadata: Metadata = {
  title: getSectionDocumentTitle("کاربران"),
};

const PAGE_SIZE = 30;

function formatDate(value: Date | null) {
  if (!value) return "هنوز وارد نشده";
  return new Intl.DateTimeFormat("fa-IR-u-ca-persian", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(value);
}

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  await requireAdmin();
  const params = await searchParams;
  const query = params.q?.trim().slice(0, 80) ?? "";
  const page = Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1);
  const where = query
    ? {
        OR: [
          { username: { contains: query } },
          { displayName: { contains: query } },
          { email: { contains: query } },
        ],
      }
    : {};

  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true,
        username: true,
        displayName: true,
        email: true,
        isAdmin: true,
        createdAt: true,
        lastSeenAt: true,
        totalPageViews: true,
        totalActiveSeconds: true,
      },
    }),
    prisma.user.count({ where }),
  ]);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <section className="rounded-[24px] border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <h2 className="text-xl font-bold text-slate-900">فهرست کاربران</h2>
          <p className="mt-1 text-sm text-slate-500">{total.toLocaleString("fa-IR")} حساب کاربری</p>
        </div>
        <form className="flex w-full max-w-md gap-2">
          <label className="relative flex-1">
            <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              name="q"
              defaultValue={query}
              placeholder="نام، نام کاربری یا ایمیل"
              className="h-11 w-full rounded-xl border border-slate-200 pr-10 pl-3 text-sm outline-none focus:border-indigo-400"
            />
          </label>
          <button className="rounded-xl bg-indigo-600 px-4 text-sm font-semibold text-white">جست‌وجو</button>
        </form>
      </div>

      <div className="mt-5 overflow-x-auto">
        <table className="w-full min-w-[880px] text-right text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-xs text-slate-500">
              <th className="px-3 py-3 font-medium">کاربر</th>
              <th className="px-3 py-3 font-medium">ایمیل</th>
              <th className="px-3 py-3 font-medium">عضویت</th>
              <th className="px-3 py-3 font-medium">آخرین فعالیت</th>
              <th className="px-3 py-3 font-medium">بازدید</th>
              <th className="px-3 py-3 font-medium">زمان استفاده</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {users.map((user) => (
              <tr key={user.id} className="hover:bg-slate-50">
                <td className="px-3 py-4">
                  <div className="flex items-center gap-2">
                    <div>
                      <p className="font-semibold text-slate-800">{user.displayName}</p>
                      <p className="text-xs text-slate-500" dir="ltr">@{user.username}</p>
                    </div>
                    {user.isAdmin ? (
                      <span title="مدیر"><ShieldCheck className="h-4 w-4 text-indigo-600" /></span>
                    ) : null}
                  </div>
                </td>
                <td className="px-3 py-4 text-slate-600" dir="ltr">{user.email ?? "—"}</td>
                <td className="px-3 py-4 text-slate-600">{formatDate(user.createdAt)}</td>
                <td className="px-3 py-4 text-slate-600">{formatDate(user.lastSeenAt)}</td>
                <td className="px-3 py-4 font-medium text-slate-700">{user.totalPageViews.toLocaleString("fa-IR")}</td>
                <td className="px-3 py-4 text-slate-600">{formatUsageDuration(user.totalActiveSeconds)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!users.length ? (
          <p className="py-12 text-center text-sm text-slate-500">کاربری با این مشخصات پیدا نشد.</p>
        ) : null}
      </div>

      {pages > 1 ? (
        <div className="mt-5 flex items-center justify-center gap-3 text-sm">
          {page > 1 ? (
            <Link href={`/admin/users?page=${page - 1}&q=${encodeURIComponent(query)}`} className="rounded-xl border border-slate-200 px-4 py-2">صفحه قبل</Link>
          ) : null}
          <span className="text-slate-500">صفحه {page.toLocaleString("fa-IR")} از {pages.toLocaleString("fa-IR")}</span>
          {page < pages ? (
            <Link href={`/admin/users?page=${page + 1}&q=${encodeURIComponent(query)}`} className="rounded-xl border border-slate-200 px-4 py-2">صفحه بعد</Link>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
