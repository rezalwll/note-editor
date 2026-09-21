"use client";

import {
  ChevronRight,
  FileText,
  Folder,
  Home,
  Menu,
  Plus,
  UserRound,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Dispatch, RefObject, SetStateAction } from "react";

import { BrandLogo } from "@/components/brand-logo";
import { EditorToolbar } from "@/components/editor-toolbar";
import { SearchTrigger } from "@/components/search-trigger";
import { SyncStatusIndicator } from "@/components/sync-status-indicator";
import type { MobileCurrentUser } from "@/components/mobile-shell-types";
import type {
  MobileGroupSection,
  MobileNotebook,
} from "@/components/use-mobile-shell-model";

type MobileShellNavigationProps = {
  activeGroup: MobileGroupSection | null;
  activeNotebook: MobileNotebook | null;
  createMenuOpen: boolean;
  currentUser: MobileCurrentUser;
  pathname: string;
  profileTriggerRef: RefObject<HTMLButtonElement | null>;
  setCreateMenuOpen: Dispatch<SetStateAction<boolean>>;
  setPagesOpen: Dispatch<SetStateAction<boolean>>;
  setProfileOpen: Dispatch<SetStateAction<boolean>>;
  setSectionsOpen: Dispatch<SetStateAction<boolean>>;
};

function NavLabel({ children }: { children: React.ReactNode }) {
  return <span className="text-[11px] font-semibold">{children}</span>;
}

/** Route-aware mobile chrome: quiet editor mode and a product-level bottom nav. */
export function MobileShellNavigation({
  activeGroup,
  activeNotebook,
  createMenuOpen,
  currentUser,
  pathname,
  profileTriggerRef,
  setCreateMenuOpen,
  setPagesOpen,
  setProfileOpen,
  setSectionsOpen,
}: MobileShellNavigationProps) {
  const router = useRouter();
  const isEditor = pathname.startsWith("/pages/");
  const isHome = pathname === "/workspace";

  const closeTransientPanels = () => {
    setCreateMenuOpen(false);
    setPagesOpen(false);
    setProfileOpen(false);
    setSectionsOpen(false);
  };
  const toggleSections = () => {
    setSectionsOpen((current) => !current);
    setCreateMenuOpen(false);
    setPagesOpen(false);
    setProfileOpen(false);
  };
  const togglePages = () => {
    setPagesOpen((current) => !current);
    setCreateMenuOpen(false);
    setSectionsOpen(false);
    setProfileOpen(false);
  };
  const toggleProfile = () => {
    setProfileOpen((current) => !current);
    setCreateMenuOpen(false);
    setSectionsOpen(false);
    setPagesOpen(false);
  };

  if (isEditor) {
    return (
      <>
        <header className="sticky top-0 z-40 border-b border-[#ececf4] bg-white/95 backdrop-blur-xl">
          <div className="relative flex min-h-14 items-center justify-center px-32">
            <div className="absolute left-3 flex items-center gap-1">
              <SyncStatusIndicator userId={currentUser.id} variant="plain" />
              <SearchTrigger
                ariaLabel="باز کردن جست‌وجو"
                label=""
                className="inline-flex h-10 w-10 items-center justify-center rounded-xl text-[#2f3d59] transition hover:bg-[#f3f3fb]"
              />
              <button
                type="button"
                onClick={togglePages}
                className="inline-flex h-10 w-10 items-center justify-center rounded-xl text-[#2f3d59] transition hover:bg-[#f3f3fb]"
                aria-label="صفحه‌ها"
              >
                <FileText className="h-5 w-5" />
              </button>
            </div>

            <button
              type="button"
              onClick={toggleSections}
              className="min-w-0 max-w-full px-2 text-center"
              aria-label="باز کردن مجموعه‌ها"
            >
              <span className="block truncate text-sm font-bold text-[#23324d]">
                {activeGroup?.name ?? "مجموعه"} ← {activeNotebook?.name ?? "زیرمجموعه"}
              </span>
            </button>

            <div className="absolute right-3 flex justify-end">
              <button
                type="button"
                onClick={() => router.back()}
                className="inline-flex h-10 w-10 items-center justify-center rounded-xl text-[#23324d] transition hover:bg-[#f3f3fb]"
                aria-label="بازگشت"
              >
                <ChevronRight className="h-6 w-6" />
              </button>
            </div>
          </div>
        </header>

        <div className="fixed inset-x-3 bottom-[max(14px,env(safe-area-inset-bottom))] z-40 overflow-x-auto rounded-[22px] bg-white/92 shadow-[0_18px_50px_rgba(35,50,77,0.20)] backdrop-blur-xl">
          <EditorToolbar variant="mobile" />
        </div>
      </>
    );
  }

  return (
    <>
      <header className="sticky top-0 z-40 border-b border-[#ececf4] bg-white/94 backdrop-blur-xl">
        <div className="flex min-h-16 items-center justify-between gap-3 px-3">
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={toggleSections}
              className="inline-flex h-10 w-10 items-center justify-center rounded-xl text-[#33406d] transition hover:bg-[#f3f3fb]"
              aria-label="باز کردن مجموعه‌ها"
            >
              <Menu className="h-5 w-5" />
            </button>
            <button
              type="button"
              onClick={togglePages}
              className="inline-flex h-10 w-10 items-center justify-center rounded-xl text-[#33406d] transition hover:bg-[#f3f3fb]"
              aria-label="صفحه‌ها"
            >
              <FileText className="h-5 w-5" />
            </button>
            <BrandLogo frameClassName="h-8 w-[104px]" showWordmark={false} />
          </div>

          <div className="flex items-center gap-1">
            <SearchTrigger
              ariaLabel="باز کردن جست‌وجو"
              label=""
              className="inline-flex h-10 w-10 items-center justify-center rounded-xl text-[#33406d] transition hover:bg-[#f3f3fb]"
            />
            <button
              ref={profileTriggerRef}
              type="button"
              onClick={toggleProfile}
              className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-[linear-gradient(135deg,#eeeaff,#e9f7ff)] text-[#6555dc] ring-1 ring-[#d9d7fb]"
              aria-label="باز کردن پروفایل"
            >
              <UserRound className="h-5 w-5" />
            </button>
          </div>
        </div>
      </header>

      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-[#e5e6ef] bg-white/94 pb-[env(safe-area-inset-bottom)] shadow-[0_-12px_34px_rgba(35,50,77,0.08)] backdrop-blur-xl" aria-label="ناوبری اصلی">
        <div className="grid h-[76px] grid-cols-5 items-center px-2" dir="rtl">
          <Link
            href="/workspace"
            onClick={closeTransientPanels}
            className={`flex h-14 flex-col items-center justify-center gap-1 rounded-2xl ${isHome ? "text-[#715cf0]" : "text-[#5f687b]"}`}
            aria-current={isHome ? "page" : undefined}
          >
            <Home className={`h-5 w-5 ${isHome ? "fill-[#715cf0]" : ""}`} />
            <NavLabel>خانه</NavLabel>
          </Link>

          <SearchTrigger
            ariaLabel="جستجو"
            label="جستجو"
            className="flex h-14 flex-col-reverse items-center justify-center gap-1 rounded-2xl text-[#5f687b]"
          />

          <button
            type="button"
            onClick={() => {
              setCreateMenuOpen((current) => !current);
              setPagesOpen(false);
              setProfileOpen(false);
              setSectionsOpen(false);
            }}
            className="mx-auto -mt-7 inline-flex h-16 w-16 items-center justify-center rounded-full bg-[linear-gradient(145deg,#8a75ff,#6958ed)] text-white shadow-[0_14px_32px_rgba(105,88,237,0.38)] ring-[7px] ring-white"
            aria-label="ساخت مورد جدید"
            aria-expanded={createMenuOpen}
          >
            <Plus className="h-8 w-8" />
          </button>

          <button
            type="button"
            onClick={toggleSections}
            className="flex h-14 flex-col items-center justify-center gap-1 rounded-2xl text-[#5f687b]"
          >
            <Folder className="h-5 w-5" />
            <NavLabel>مجموعه‌ها</NavLabel>
          </button>

          <button
            type="button"
            onClick={toggleProfile}
            className="flex h-14 flex-col items-center justify-center gap-1 rounded-2xl text-[#5f687b]"
          >
            <UserRound className="h-5 w-5" />
            <NavLabel>پروفایل</NavLabel>
          </button>
        </div>
      </nav>
    </>
  );
}
