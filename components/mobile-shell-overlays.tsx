"use client";

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
        className="fixed z-[130] flex w-[176px] flex-col rounded-[18px] border border-[var(--border-soft)] bg-white p-1.5 shadow-[0_22px_54px_rgba(15,23,42,0.16)]"
        style={{ top: `${position.top}px`, left: `${position.left}px` }}
      >
        <div className="border-b border-[var(--border-soft)] px-2.5 py-2 text-center">
          <div className="truncate text-sm font-semibold text-[#1f2a37]">
            {currentUser.displayName}
          </div>
          <div className="truncate text-[11px] text-[#708090]" dir="ltr">
            @{currentUser.username}
          </div>
        </div>

        {installEvent ? (
          <button
            type="button"
            onClick={() => handleInstall(installEvent)}
            className="mt-1 rounded-xl px-2.5 py-2 text-center text-sm text-[var(--text-main)] transition hover:bg-[var(--bg-softer)]"
          >
            نصب برنامه
          </button>
        ) : null}

        <Link
          href="/settings"
          onClick={closeAll}
          className="mt-1 rounded-xl px-2.5 py-2 text-center text-sm text-[var(--text-main)] transition hover:bg-[var(--bg-softer)]"
        >
          تنظیمات
        </Link>

        <form action={logoutAndClearClientData}>
          <button
            type="submit"
            className="w-full rounded-xl px-2.5 py-2 text-center text-sm text-[#b42318] transition hover:bg-[#fff3f2]"
          >
            خروج از حساب
          </button>
        </form>
      </div>
    </>
  );
}
