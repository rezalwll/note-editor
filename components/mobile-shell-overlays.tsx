"use client";

import { FilePlus2, FolderPlus, LibraryBig, X } from "lucide-react";
import Link from "next/link";
import type { RefObject } from "react";

import type {
  InstallPromptEvent,
  MobileCurrentUser,
} from "@/components/mobile-shell-types";
import type {
  MobileGroupSection,
  MobileNotebook,
} from "@/components/use-mobile-shell-model";

type MobileCreateMenuProps = {
  canCreateNotebook: boolean;
  canCreatePage: boolean;
  close: () => void;
  createGroup: () => void;
  createNotebook: () => void;
  createPage: () => void;
};

/** Context-aware create sheet opened by the primary mobile plus action. */
export function MobileCreateMenu({
  canCreateNotebook,
  canCreatePage,
  close,
  createGroup,
  createNotebook,
  createPage,
}: MobileCreateMenuProps) {
  const actions = [
    {
      label: "صفحه جدید",
      description: "در زیرمجموعه فعال",
      icon: FilePlus2,
      onClick: createPage,
      disabled: !canCreatePage,
      colors: "bg-[#eeeaff] text-[#6f58e8]",
    },
    {
      label: "زیرمجموعه جدید",
      description: "در مجموعه فعال",
      icon: FolderPlus,
      onClick: createNotebook,
      disabled: !canCreateNotebook,
      colors: "bg-[#eaf9ef] text-[#16a765]",
    },
    {
      label: "مجموعه جدید",
      description: "یک فضای تازه بساز",
      icon: LibraryBig,
      onClick: createGroup,
      disabled: false,
      colors: "bg-[#eaf6ff] text-[#168ad0]",
    },
  ];

  return (
    <div className="fixed inset-0 z-[100] bg-[#1f2940]/25 backdrop-blur-[2px]" onClick={close}>
      <section
        className="absolute inset-x-3 bottom-[calc(88px+env(safe-area-inset-bottom))] rounded-[28px] border border-white/80 bg-white/96 p-4 shadow-[0_24px_70px_rgba(35,50,77,0.22)]"
        onClick={(event) => event.stopPropagation()}
        aria-label="ساخت مورد جدید"
      >
        <div className="mb-3 flex items-center justify-between" dir="rtl">
          <div>
            <h2 className="text-base font-bold text-[#23324d]">چه چیزی می‌سازی؟</h2>
            <p className="mt-0.5 text-xs text-[#8a92a4]">مقصد بر اساس فضای فعلی انتخاب می‌شود.</p>
          </div>
          <button
            type="button"
            onClick={close}
            className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-[#f3f3f8] text-[#6d7587]"
            aria-label="بستن منوی ساخت"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="grid gap-2" dir="rtl">
          {actions.map((action) => {
            const Icon = action.icon;
            return (
              <button
                key={action.label}
                type="button"
                onClick={action.onClick}
                disabled={action.disabled}
                className="flex min-h-[68px] items-center gap-3 rounded-[20px] border border-[#ededf4] bg-white px-3 text-right transition hover:bg-[#fafaff] disabled:cursor-not-allowed disabled:opacity-45"
              >
                <span className={`inline-flex h-11 w-11 items-center justify-center rounded-[14px] ${action.colors}`}>
                  <Icon className="h-5 w-5" />
                </span>
                <span>
                  <span className="block text-sm font-bold text-[#23324d]">{action.label}</span>
                  <span className="mt-0.5 block text-xs text-[#8a92a4]">{action.description}</span>
                </span>
              </button>
            );
          })}
        </div>
      </section>
    </div>
  );
}

type MobileActionSheetProps = {
  actionGroup: MobileGroupSection | null;
  actionNotebook: MobileNotebook | null;
  actionPage: MobileNotebook["pages"][number] | null;
  activeNotebook: MobileNotebook | null;
  archivePage: (pageId: string) => void;
  beginRenameGroup: (group: MobileGroupSection) => void;
  beginRenameNotebook: (notebook: MobileNotebook) => void;
  close: () => void;
  deleteGroup: (group: MobileGroupSection) => void;
  deleteNotebook: (notebook: MobileNotebook) => void;
  deletePagePermanently: (pageId: string) => void;
  restorePage: (pageId: string) => void;
};

/** Context-sensitive destructive and rename actions for mobile entities. */
export function MobileActionSheet({
  actionGroup,
  actionNotebook,
  actionPage,
  activeNotebook,
  archivePage,
  beginRenameGroup,
  beginRenameNotebook,
  close,
  deleteGroup,
  deleteNotebook,
  deletePagePermanently,
  restorePage,
}: MobileActionSheetProps) {
  return (
    <div className="fixed inset-0 z-[140] bg-black/30" onClick={close}>
      <div
        className="absolute inset-x-0 bottom-0 rounded-t-[28px] bg-white p-4 shadow-[0_-24px_80px_rgba(15,23,42,0.22)]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-3 text-center text-sm font-semibold text-[#1f2a37]">
          {actionGroup?.name ?? actionNotebook?.name ?? actionPage?.title}
        </div>
        <div className="grid gap-2">
          {actionGroup ? (
            <>
              <button
                type="button"
                onClick={() => beginRenameGroup(actionGroup)}
                className="rounded-2xl border border-[var(--border-soft)] px-4 py-3 text-right text-sm text-[#1f2a37]"
              >
                تغییر نام مجموعه
              </button>
              <button
                type="button"
                onClick={() => deleteGroup(actionGroup)}
                className="rounded-2xl border border-[#fecaca] px-4 py-3 text-right text-sm text-[#b42318]"
              >
                حذف مجموعه
              </button>
            </>
          ) : null}

          {actionNotebook ? (
            <>
              {!actionNotebook.deletedAt ? (
                <button
                  type="button"
                  onClick={() => beginRenameNotebook(actionNotebook)}
                  className="rounded-2xl border border-[var(--border-soft)] px-4 py-3 text-right text-sm text-[#1f2a37]"
                >
                  تغییر نام زیر مجموعه
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => deleteNotebook(actionNotebook)}
                className="rounded-2xl border border-[#fecaca] px-4 py-3 text-right text-sm text-[#b42318]"
              >
                {actionNotebook.deletedAt
                  ? "حذف دائمی زیر مجموعه"
                  : "انتقال زیر مجموعه به حذف‌شده‌ها"}
              </button>
            </>
          ) : null}

          {actionPage ? (
            <>
              {activeNotebook?.deletedAt && actionPage.originalNotebookId ? (
                <button
                  type="button"
                  onClick={() => restorePage(actionPage.id)}
                  className="rounded-2xl border border-[var(--border-soft)] px-4 py-3 text-right text-sm text-[#1f2a37]"
                >
                  بازیابی صفحه
                </button>
              ) : null}
              <button
                type="button"
                onClick={() =>
                  activeNotebook?.deletedAt
                    ? deletePagePermanently(actionPage.id)
                    : archivePage(actionPage.id)
                }
                className="rounded-2xl border border-[#fecaca] px-4 py-3 text-right text-sm text-[#b42318]"
              >
                {activeNotebook?.deletedAt ? "حذف دائمی صفحه" : "حذف صفحه"}
              </button>
            </>
          ) : null}

          <button
            type="button"
            onClick={close}
            className="rounded-2xl border border-[var(--border-soft)] px-4 py-3 text-center text-sm text-[#50607a]"
          >
            بستن
          </button>
        </div>
      </div>
    </div>
  );
}

type MobileProfileMenuProps = {
  closeAll: () => void;
  currentUser: MobileCurrentUser;
  handleInstall: (event: InstallPromptEvent) => Promise<void>;
  installEvent: InstallPromptEvent | null;
  logoutAndClearClientData: () => Promise<void>;
  position: { top: number; left: number };
  profileMenuRef: RefObject<HTMLDivElement | null>;
};

/** Positioned account menu, including install and direct logout actions. */
export function MobileProfileMenu({
  closeAll,
  currentUser,
  handleInstall,
  installEvent,
  logoutAndClearClientData,
  position,
  profileMenuRef,
}: MobileProfileMenuProps) {
  return (
    <>
      <div className="fixed inset-0 z-[120] bg-black/10" />
      <div
        ref={profileMenuRef}
        className="fixed z-[130] flex w-[224px] flex-col rounded-[24px] border border-[#e8e8f1] bg-white/96 p-2 shadow-[0_24px_64px_rgba(35,50,77,0.20)] backdrop-blur-xl"
        style={{ top: `${position.top}px`, left: `${position.left}px` }}
      >
        <div className="rounded-[18px] bg-[linear-gradient(135deg,#f3f0ff,#eef8ff)] px-3 py-3 text-right" dir="rtl">
          <div className="truncate text-sm font-bold text-[#23324d]">
            {currentUser.displayName}
          </div>
          <div className="mt-0.5 truncate text-[11px] text-[#7f8799]" dir="ltr">
            @{currentUser.username}
          </div>
        </div>

        {installEvent ? (
          <button
            type="button"
            onClick={() => handleInstall(installEvent)}
            className="mt-1 rounded-xl px-3 py-2.5 text-right text-sm text-[var(--text-main)] transition hover:bg-[var(--bg-softer)]"
          >
            نصب برنامه
          </button>
        ) : null}

        <Link
          href="/settings"
          onClick={closeAll}
          className="mt-1 rounded-xl px-3 py-2.5 text-right text-sm text-[var(--text-main)] transition hover:bg-[var(--bg-softer)]"
        >
          تنظیمات
        </Link>

        <Link
          href="/support"
          onClick={closeAll}
          className="rounded-xl px-3 py-2.5 text-right text-sm text-[var(--text-main)] transition hover:bg-[var(--bg-softer)]"
        >
          پشتیبانی
        </Link>

        {currentUser.isAdmin ? (
          <Link
            href="/admin"
            onClick={closeAll}
            className="rounded-xl px-2.5 py-2 text-center text-sm font-medium text-indigo-700 transition hover:bg-indigo-50"
          >
            مرکز مدیریت
          </Link>
        ) : null}

        <form action={logoutAndClearClientData}>
          <button
            type="submit"
            className="w-full rounded-xl px-3 py-2.5 text-right text-sm text-[#b42318] transition hover:bg-[#fff3f2]"
          >
            خروج از حساب
          </button>
        </form>
      </div>
    </>
  );
}
