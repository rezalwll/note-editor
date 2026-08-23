import {
  ArrowLeft,
  Clock3,
  FileText,
  Folder,
  Lightbulb,
  ListChecks,
} from "lucide-react";
import Link from "next/link";

import { SearchTrigger } from "@/components/search-trigger";

type HomePageItem = {
  id: string;
  title: string;
  updatedAt: Date;
  notebookName: string;
  groupName: string | null;
};

type HomeCollectionItem = {
  id: string;
  name: string;
  pageCount: number;
  href: string;
};

type MobileHomeDashboardProps = {
  displayName: string;
  continuePage: HomePageItem | null;
  recentPages: HomePageItem[];
  collections: HomeCollectionItem[];
};

const recentIcons = [Lightbulb, ListChecks, FileText];
const recentColors = [
  { background: "#f0edff", foreground: "#7357ea" },
  { background: "#eaf9ef", foreground: "#16a765" },
  { background: "#eaf6ff", foreground: "#168ad0" },
];
const collectionColors = [
  { background: "#f0edff", foreground: "#7357ea" },
  { background: "#eaf9ef", foreground: "#16a765" },
  { background: "#eaf6ff", foreground: "#168ad0" },
];

function formatRelativeTime(date: Date) {
  const deltaMs = Date.now() - date.getTime();
  const hours = Math.max(1, Math.round(deltaMs / 3_600_000));

  if (hours < 24) {
    return `${hours.toLocaleString("fa-IR")} ساعت پیش`;
  }

  const days = Math.max(1, Math.round(hours / 24));
  return `${days.toLocaleString("fa-IR")} روز پیش`;
}

function getPagePath(page: HomePageItem) {
  return [page.groupName, page.notebookName].filter(Boolean).join(" ← ");
}

export function MobileHomeDashboard({
  displayName,
  continuePage,
  recentPages,
  collections,
}: MobileHomeDashboardProps) {
  const firstName = displayName.trim().split(/\s+/)[0] || displayName;

  return (
    <div className="min-h-full bg-[#fafaff]" dir="rtl">
      <div className="mx-auto w-full max-w-3xl px-4 pb-32 pt-5 md:px-7 xl:max-w-5xl xl:pb-10 xl:pt-10">
        <section className="xl:hidden">
          <h1 className="text-[28px] font-bold tracking-[-0.02em] text-[#23324d]">
            سلام، <bdi className="inline-block" dir="auto">{firstName}</bdi>
          </h1>
          <p className="mt-1 text-sm text-[#7a849b]">
            امروز روی کدام ایده کار می‌کنیم؟
          </p>

          <SearchTrigger
            ariaLabel="باز کردن جست‌وجو از خانه"
            label="جستجو در یادداشت‌ها"
            className="mt-5 flex min-h-14 w-full items-center justify-between rounded-[20px] border border-[#e6e8f2] bg-white px-4 text-[#8991a5] shadow-[0_10px_30px_rgba(49,61,99,0.07)]"
          />
        </section>

        {continuePage ? (
          <section className="mt-6 xl:mt-0">
            <Link
              href={`/pages/${continuePage.id}`}
              className="group block rounded-[26px] border border-[#cfd0ff] bg-[linear-gradient(135deg,#fbfaff_0%,#f4f2ff_52%,#f8fbff_100%)] p-5 shadow-[0_16px_40px_rgba(121,105,238,0.10)] transition hover:-translate-y-0.5 hover:shadow-[0_20px_44px_rgba(121,105,238,0.15)] md:p-6"
            >
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm font-bold text-[#715cf0]">ادامه نوشتن</span>
                <ArrowLeft className="h-5 w-5 text-[#737b90] transition group-hover:-translate-x-1" />
              </div>
              <div className="mt-5 flex items-center gap-4">
                <div className="flex h-[72px] w-[72px] shrink-0 items-center justify-center rounded-[20px] bg-[#e9e5ff] text-[#7357ea]">
                  <FileText className="h-8 w-8" />
                </div>
                <div className="min-w-0 flex-1">
                  <h2 className="truncate text-xl font-bold text-[#23324d]">
                    {continuePage.title || "صفحه بدون عنوان"}
                  </h2>
                  <p className="mt-1 truncate text-sm text-[#7f8799]">
                    {getPagePath(continuePage)}
                  </p>
                  <p className="mt-2 inline-flex items-center gap-1.5 text-xs text-[#9299a9]">
                    <Clock3 className="h-3.5 w-3.5" />
                    ویرایش‌شده {formatRelativeTime(continuePage.updatedAt)}
                  </p>
                </div>
              </div>
            </Link>
          </section>
        ) : (
          <section className="mt-6 rounded-[26px] border border-dashed border-[#cfd0ff] bg-white px-5 py-8 text-center">
            <FileText className="mx-auto h-9 w-9 text-[#8c82f4]" />
            <h2 className="mt-3 text-base font-bold text-[#23324d]">اولین صفحه‌ات را بساز</h2>
            <p className="mt-1 text-sm text-[#7f8799]">
              از دکمهٔ ساخت در پایین صفحه شروع کن.
            </p>
          </section>
        )}

        {recentPages.length > 0 ? (
          <section className="mt-8">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-lg font-bold text-[#23324d]">اخیراً بازشده</h2>
              <SearchTrigger
                ariaLabel="نمایش همه یادداشت‌های اخیر"
                label="مشاهده همه"
                className="inline-flex items-center gap-1 text-xs font-semibold text-[#715cf0]"
              />
            </div>
            <div className="notava-scrollbar-hidden -mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-3 md:mx-0 md:grid md:grid-cols-3 md:overflow-visible md:px-0">
              {recentPages.slice(0, 3).map((page, index) => {
                const Icon = recentIcons[index % recentIcons.length];
                const colors = recentColors[index % recentColors.length];
                return (
                  <Link
                    key={page.id}
                    href={`/pages/${page.id}`}
                    className="w-[180px] shrink-0 snap-start rounded-[22px] border border-[#ececf3] bg-white p-4 shadow-[0_10px_28px_rgba(35,50,77,0.07)] md:w-auto"
                  >
                    <span
                      className="inline-flex h-11 w-11 items-center justify-center rounded-[14px]"
                      style={{ backgroundColor: colors.background, color: colors.foreground }}
                    >
                      <Icon className="h-5 w-5" />
                    </span>
                    <h3 className="mt-4 truncate text-sm font-bold text-[#23324d]">
                      {page.title || "صفحه بدون عنوان"}
                    </h3>
                    <p className="mt-2 flex items-center gap-1 text-[11px] text-[#969dac]">
                      <Clock3 className="h-3 w-3" />
                      {formatRelativeTime(page.updatedAt)}
                    </p>
                  </Link>
                );
              })}
            </div>
          </section>
        ) : null}

        <section className="mt-7">
          <h2 className="mb-3 text-lg font-bold text-[#23324d]">مجموعه‌ها</h2>
          <div className="grid gap-2.5">
            {collections.length > 0 ? (
              collections.slice(0, 5).map((collection, index) => {
                const colors = collectionColors[index % collectionColors.length];
                return (
                  <Link
                    key={collection.id}
                    href={collection.href}
                    className="flex min-h-[76px] items-center gap-3 rounded-[22px] border border-[#ececf3] bg-white px-4 shadow-[0_8px_24px_rgba(35,50,77,0.055)]"
                  >
                    <span
                      className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[15px]"
                      style={{ backgroundColor: colors.background, color: colors.foreground }}
                    >
                      <Folder className="h-6 w-6" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <h3 className="truncate text-base font-bold text-[#23324d]">{collection.name}</h3>
                      <p className="mt-0.5 text-xs text-[#9299a9]">
                        {collection.pageCount.toLocaleString("fa-IR")} یادداشت
                      </p>
                    </div>
                    <ArrowLeft className="h-5 w-5 text-[#8e95a4]" />
                  </Link>
                );
              })
            ) : (
              <div className="rounded-[22px] border border-dashed border-[#d8d9f7] bg-white p-6 text-center text-sm text-[#7f8799]">
                هنوز مجموعه‌ای نداری.
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
