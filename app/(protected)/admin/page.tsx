import type { Metadata } from "next";
import Link from "next/link";
import {
  Activity,
  ArrowLeft,
  Clock3,
  Eye,
  Headphones,
  UserPlus,
  Users,
} from "lucide-react";

import { SupportStatusBadge } from "@/components/support-status-badge";
import { requireAdmin } from "@/lib/admin";
import { getAdminDashboardData } from "@/lib/admin-dashboard";
import { getSectionDocumentTitle } from "@/lib/page-title";
import { formatSupportDate } from "@/lib/support";
import { formatUsageDuration } from "@/lib/usage-analytics";

export const metadata: Metadata = {
  title: getSectionDocumentTitle("مدیریت"),
};

const routeLabels: Record<string, string> = {
  "/": "خانه",
  "/pages/:id": "صفحه یادداشت",
  "/notebooks/:id": "دفتر",
  "/support": "پشتیبانی",
  "/support/:id": "گفت‌وگوی پشتیبانی",
  "/settings": "تنظیمات",
  "/trash": "حذف‌شده‌ها",
  "/admin": "مدیریت",
};

export default async function AdminDashboardPage() {
  await requireAdmin();
  const data = await getAdminDashboardData();
  const maxViews = Math.max(
    1,
    ...data.dailyUsage.map((item) => item._sum.pageViews ?? 0),
  );

  const cards = [
    {
      label: "کل کاربران",
      value: data.userCount.toLocaleString("fa-IR"),
      hint: `${data.newUsersSevenDays.toLocaleString("fa-IR")} عضو جدید در ۷ روز`,
      icon: Users,
      color: "bg-indigo-100 text-indigo-700",
    },
    {
      label: "کاربران فعال",
      value: data.activeUsersSevenDays.toLocaleString("fa-IR"),
      hint: "در ۷ روز گذشته",
      icon: Activity,
      color: "bg-emerald-100 text-emerald-700",
    },
    {
      label: "بازدید صفحات",
      value: data.totalPageViews.toLocaleString("fa-IR"),
      hint: "از شروع ثبت آمار",
      icon: Eye,
      color: "bg-sky-100 text-sky-700",
    },
    {
      label: "زمان استفاده",
      value: formatUsageDuration(data.totalActiveSeconds),
      hint: "مجموع زمان فعال",
      icon: Clock3,
      color: "bg-amber-100 text-amber-700",
    },
    {
      label: "درخواست‌های باز",
      value: data.openTickets.toLocaleString("fa-IR"),
      hint: "نیازمند بررسی یا پاسخ",
      icon: Headphones,
      color: "bg-violet-100 text-violet-700",
    },
    {
      label: "رشد هفتگی",
      value: data.newUsersSevenDays.toLocaleString("fa-IR"),
      hint: "حساب تازه ساخته‌شده",
      icon: UserPlus,
      color: "bg-rose-100 text-rose-700",
    },
  ];

  return (
    <>
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {cards.map(({ label, value, hint, icon: Icon, color }) => (
          <article key={label} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm text-slate-500">{label}</p>
                <p className="mt-2 text-2xl font-bold text-slate-900">{value}</p>
                <p className="mt-1 text-xs text-slate-400">{hint}</p>
              </div>
              <span className={`flex h-10 w-10 items-center justify-center rounded-xl ${color}`}>
                <Icon className="h-5 w-5" />
              </span>
            </div>
          </article>
        ))}
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.3fr_0.7fr]">
        <article className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-bold text-slate-900">روند بازدید ۳۰ روز اخیر</h2>
              <p className="mt-1 text-xs text-slate-500">فقط مسیر صفحه ثبت می‌شود؛ محتوای یادداشت‌ها ثبت نمی‌شود.</p>
            </div>
            <Eye className="h-5 w-5 text-indigo-500" />
          </div>
          {data.dailyUsage.length ? (
            <div className="mt-6 flex h-52 items-end gap-1.5 overflow-hidden" aria-label="نمودار بازدید روزانه">
              {data.dailyUsage.map((item) => {
                const views = item._sum.pageViews ?? 0;
                return (
                  <div key={item.day.toISOString()} className="group flex min-w-1 flex-1 flex-col items-center justify-end gap-2">
                    <span className="invisible text-[10px] text-slate-500 group-hover:visible">
                      {views.toLocaleString("fa-IR")}
                    </span>
                    <div
                      className="w-full min-w-1 rounded-t-md bg-[linear-gradient(180deg,#818cf8,#c7d2fe)] transition hover:bg-indigo-500"
                      style={{ height: `${Math.max(4, (views / maxViews) * 160)}px` }}
                      title={`${views.toLocaleString("fa-IR")} بازدید`}
                    />
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="mt-6 rounded-2xl bg-slate-50 px-4 py-12 text-center text-sm text-slate-500">
              داده استفاده از این پس به‌صورت روزانه نمایش داده می‌شود.
            </p>
          )}
        </article>

        <article className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="font-bold text-slate-900">بخش‌های پرکاربرد</h2>
          <p className="mt-1 text-xs text-slate-500">۳۰ روز اخیر</p>
          <div className="mt-4 grid gap-3">
            {data.popularRoutes.length ? (
              data.popularRoutes.map((route, index) => (
                <div key={route.path} className="flex items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-xs font-semibold text-slate-500">
                      {(index + 1).toLocaleString("fa-IR")}
                    </span>
                    <span className="truncate text-sm text-slate-700">
                      {routeLabels[route.path] ?? route.path}
                    </span>
                  </div>
                  <span className="text-xs font-semibold text-indigo-600">
                    {(route._sum.pageViews ?? 0).toLocaleString("fa-IR")}
                  </span>
                </div>
              ))
            ) : (
              <p className="text-sm text-slate-500">هنوز داده‌ای ثبت نشده است.</p>
            )}
          </div>
        </article>
      </section>

      <section className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="font-bold text-slate-900">آخرین پیام‌های پشتیبانی</h2>
            <p className="mt-1 text-xs text-slate-500">تازه‌ترین گفت‌وگوهای کاربران</p>
          </div>
          <Link href="/admin/support" className="inline-flex items-center gap-1 text-sm font-semibold text-indigo-600">
            مشاهده همه
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </div>
        <div className="mt-4 divide-y divide-slate-100">
          {data.recentTickets.map((ticket) => (
            <Link
              key={ticket.id}
              href={`/admin/support/${ticket.id}`}
              className="flex flex-col justify-between gap-3 py-4 transition hover:bg-slate-50 sm:flex-row sm:items-center sm:px-2"
            >
              <div className="min-w-0">
                <p className="truncate font-medium text-slate-800">{ticket.subject}</p>
                <p className="mt-1 text-xs text-slate-500">
                  {ticket.user.displayName} · @{ticket.user.username} · {formatSupportDate(ticket.lastMessageAt)}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-400">{ticket._count.messages.toLocaleString("fa-IR")} پیام</span>
                <SupportStatusBadge status={ticket.status} />
              </div>
            </Link>
          ))}
          {!data.recentTickets.length ? (
            <p className="py-8 text-center text-sm text-slate-500">پیام پشتیبانی جدیدی وجود ندارد.</p>
          ) : null}
        </div>
      </section>
    </>
  );
}
