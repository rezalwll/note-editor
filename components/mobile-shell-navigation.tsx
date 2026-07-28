"use client";

import { FileText, Menu, NotebookTabs, UserRound } from "lucide-react";
import type { Dispatch, RefObject, SetStateAction } from "react";

import { AppLockButton } from "@/components/app-lock-button";
import { BrandLogo } from "@/components/brand-logo";
import { EditorToolbar } from "@/components/editor-toolbar";
import { SearchTrigger } from "@/components/search-trigger";
import { SyncStatusIndicator } from "@/components/sync-status-indicator";
import type { MobileCurrentUser } from "@/components/mobile-shell-types";

type MobileShellNavigationProps = {
  currentUser: MobileCurrentUser;
  profileTriggerRef: RefObject<HTMLButtonElement | null>;
  setPagesOpen: Dispatch<SetStateAction<boolean>>;
  setProfileOpen: Dispatch<SetStateAction<boolean>>;
  setSectionsOpen: Dispatch<SetStateAction<boolean>>;
};

/** Persistent top toolbar and bottom navigation shared by all mobile panels. */
export function MobileShellNavigation({
  currentUser,
  profileTriggerRef,
  setPagesOpen,
  setProfileOpen,
  setSectionsOpen,
}: MobileShellNavigationProps) {
  const toggleSections = () => {
    setSectionsOpen((current) => !current);
    setPagesOpen(false);
    setProfileOpen(false);
  };
  const togglePages = () => {
    setPagesOpen((current) => !current);
    setSectionsOpen(false);
    setProfileOpen(false);
  };
  const toggleProfile = () => {
    setProfileOpen((current) => !current);
    setSectionsOpen(false);
    setPagesOpen(false);
  };

  return (
    <>
      <div className="sticky top-0 z-40 border-b border-[#b5baff] bg-[linear-gradient(90deg,rgba(159,161,255,0.95)_0%,rgba(181,186,255,0.95)_36%,rgba(174,226,255,0.92)_74%,rgba(217,249,223,0.9)_100%)] backdrop-blur">
        <div className="flex items-center justify-between gap-3 px-3 py-2">
          <button
            type="button"
            onClick={toggleSections}
            className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-white/60 bg-white/78 text-[#33406d] shadow-[0_10px_26px_rgba(116,125,255,0.18)]"
            aria-label="باز کردن مجموعه‌ها"
          >
            <Menu className="h-5 w-5" />
          </button>

          <BrandLogo frameClassName="h-7 w-[100px]" showWordmark={false} />

          <div className="flex items-center gap-2">
            <SyncStatusIndicator userId={currentUser.id} />
            <button
              ref={profileTriggerRef}
              type="button"
              onClick={toggleProfile}
              className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-white/60 bg-white/78 text-[#33406d] shadow-[0_10px_26px_rgba(116,125,255,0.18)]"
              aria-label="باز کردن پروفایل"
            >
              <UserRound className="h-5 w-5" />
            </button>
            <SearchTrigger className="inline-flex h-10 items-center gap-2 rounded-xl border border-white/60 bg-white/78 px-3 text-[#33406d] shadow-[0_10px_26px_rgba(116,125,255,0.18)]" />
          </div>
        </div>

        <div className="overflow-x-auto px-3 pb-2">
          <div className="min-w-max">
            <EditorToolbar />
          </div>
        </div>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-[#b5baff] bg-[linear-gradient(90deg,rgba(159,161,255,0.94)_0%,rgba(181,186,255,0.94)_30%,rgba(174,226,255,0.92)_68%,rgba(217,249,223,0.9)_100%)] backdrop-blur">
        <div className="grid grid-cols-4 gap-2 px-3 py-2">
          <button
            type="button"
            onClick={toggleSections}
            className="inline-flex flex-col items-center justify-center gap-1 rounded-xl py-2 text-xs font-medium text-[#33406d]"
          >
            <NotebookTabs className="h-5 w-5" />
            مجموعه‌ها
          </button>
          <button
            type="button"
            onClick={togglePages}
            className="inline-flex flex-col items-center justify-center gap-1 rounded-xl py-2 text-xs font-medium text-[#33406d]"
          >
            <FileText className="h-5 w-5" />
            صفحه‌ها
          </button>
          <AppLockButton
            configured={Boolean(currentUser.appLockConfigured)}
            recoveryAvailable={Boolean(currentUser.appLockRecoveryAvailable)}
            variant="navigation"
          />
          <button
            type="button"
            onClick={toggleProfile}
            className="inline-flex flex-col items-center justify-center gap-1 rounded-xl py-2 text-xs font-medium text-[#33406d]"
          >
            <UserRound className="h-5 w-5" />
            پروفایل
          </button>
        </div>
      </div>
    </>
  );
}
