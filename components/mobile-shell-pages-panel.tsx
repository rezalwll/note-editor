"use client";

import Link from "next/link";
import { CirclePlus, EllipsisVertical, FileText, NotebookPen, X } from "lucide-react";
import type { Dispatch, RefObject, SetStateAction } from "react";

import type {
  ActionSheetState,
  MobileGroupSection,
  MobileNotebook,
} from "@/components/use-mobile-shell-model";
import { getNotebookTheme, type NotebookTheme } from "@/lib/notebook-theme";
import { formatDate } from "@/lib/utils";

type MobilePagesPanelProps = {
  activeGroup: MobileGroupSection | null;
  activeGroupNotebooks: MobileNotebook[];
  activeNotebook: MobileNotebook | null;
  activeTheme: NotebookTheme;
  closeAll: () => void;
  draftTitle: string;
  inputRef: RefObject<HTMLInputElement | null>;
  isCreating: boolean;
  isPending: boolean;
  pathname: string;
  setActionSheet: Dispatch<SetStateAction<ActionSheetState>>;
  setDraftTitle: Dispatch<SetStateAction<string>>;
  setIsCreating: Dispatch<SetStateAction<boolean>>;
  setSelectedNotebookId: Dispatch<SetStateAction<string | null>>;
  submitCreate: () => void;
};

export function MobilePagesPanel({
  activeGroup,
  activeGroupNotebooks,
  activeNotebook,
  activeTheme,
  closeAll,
  draftTitle,
  inputRef,
  isCreating,
  isPending,
  pathname,
  setActionSheet,
  setDraftTitle,
  setIsCreating,
  setSelectedNotebookId,
  submitCreate,
}: MobilePagesPanelProps) {
  return (
    <div className="fixed inset-0 z-50 cursor-pointer bg-[#1f2940]/20" onClick={closeAll}>
      <div
        className="absolute inset-0 overflow-hidden bg-[#f7f8fc]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="sticky top-0 z-10 min-h-16 border-b border-[#e9eaf1] bg-white/96 px-3 pt-[max(8px,env(safe-area-inset-top))] backdrop-blur-xl">
          <div className="relative flex min-h-14 items-center justify-center">
            <button
              type="button"
              onClick={closeAll}
              className="absolute left-0 inline-flex h-9 w-9 items-center justify-center rounded-xl text-[#758096] transition hover:bg-[#f3f3f8]"
              aria-label="بستن فهرست صفحه‌ها"
            >
              <X className="h-5 w-5" />
            </button>

            <div className="min-w-0 px-24 text-center">
              <div className="text-sm font-bold text-[#23324d]">صفحه‌ها</div>
              <div className="mt-0.5 truncate text-[10px] text-[#8a92a4]">
                {activeNotebook?.name ?? "یک زیرمجموعه انتخاب کن"}
              </div>
            </div>

            <button
              type="button"
              onClick={() => {
                setDraftTitle("");
                setIsCreating(true);
              }}
              className="absolute right-0 inline-flex min-h-9 items-center gap-1.5 rounded-xl bg-[#6756d8] px-2.5 text-xs font-medium text-white transition hover:bg-[#5b49cc] disabled:cursor-not-allowed disabled:opacity-45"
              disabled={Boolean(activeNotebook?.deletedAt) || !activeNotebook}
            >
              <CirclePlus className="h-3.5 w-3.5" />
              صفحه جدید
            </button>
          </div>
        </div>

        <div className="sticky top-[64px] z-[9] border-b border-[#e9eaf1] bg-white/92 px-3 py-3 backdrop-blur-xl">
          <div className="mb-2 flex items-center justify-between text-[11px]" dir="rtl">
            <span className="font-medium text-[#59657a]">
              {activeGroup?.name ?? "مجموعه"}
            </span>
            <span className="text-[#9299a8]">
              {activeGroupNotebooks.length.toLocaleString("fa-IR")} زیرمجموعه
            </span>
          </div>
          <div className="notava-scrollbar-hidden flex gap-1.5 overflow-x-auto" dir="rtl">
            {activeGroupNotebooks.map((notebook) => {
              const isActiveNotebook = notebook.id === activeNotebook?.id;
              const notebookTheme = getNotebookTheme(notebook.id, notebook.themeKey);

              return (
                <Link
                  key={notebook.id}
                  href={`/notebooks/${notebook.id}`}
                  onClick={() => {
                    setDraftTitle("");
                    setIsCreating(false);
                    setSelectedNotebookId(notebook.id);
                  }}
                  className={`inline-flex shrink-0 items-center gap-1.5 rounded-xl border px-2.5 py-1.5 text-xs font-medium transition ${
                    isActiveNotebook
                      ? "border-[#d1cbfa] bg-[#eeebff] text-[#5847c8]"
                      : "border-transparent bg-[#f3f4f7] text-[#59657a]"
                  }`}
                >
                  <span
                    className="h-1.5 w-1.5 rounded-full"
                    style={{ backgroundColor: notebookTheme.accent }}
                    aria-hidden="true"
                  />
                  {notebook.name}
                </Link>
              );
            })}
          </div>
        </div>

        <div className="h-[calc(100dvh-132px-env(safe-area-inset-top))] overflow-y-auto px-3 py-3 pb-24">
          {isCreating ? (
            <div className="mb-2 rounded-[16px] border border-dashed border-[#b9b1f6] bg-[#faf9ff] px-3 py-3">
              <input
                ref={inputRef}
                value={draftTitle}
                onChange={(event) => setDraftTitle(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    submitCreate();
                  }
                }}
                disabled={isPending}
                placeholder="صفحه بدون عنوان"
                className="w-full border-none bg-transparent text-right text-sm outline-none placeholder:text-[#8b92a3]"
                dir="rtl"
              />
            </div>
          ) : null}

          {activeGroupNotebooks.length === 0 ? (
            <div className="flex min-h-56 flex-col items-center justify-center px-6 text-center">
              <span className="mb-3 inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-[#eeebff] text-[#6756d8]">
                <NotebookPen className="h-5 w-5" />
              </span>
              <p className="text-sm font-medium text-[#4b566b]">
                هنوز زیر مجموعه‌ای برای این مجموعه انتخاب نشده است.
              </p>
              <p className="mt-1 text-xs text-[#9097a7]">ابتدا یک زیرمجموعه بساز یا انتخاب کن.</p>
            </div>
          ) : activeNotebook && activeNotebook.pages.length > 0 ? (
            <div className="grid gap-2">
              {activeNotebook.pages.map((page) => {
                const isActive = pathname === `/pages/${page.id}`;

                return (
                  <div
                    key={page.id}
                    className={`flex items-center gap-1 rounded-[18px] border bg-white p-1.5 transition ${
                      isActive
                        ? "border-[#c9c2fb] ring-2 ring-[#ebe8ff]"
                        : "border-[#e7e8f0]"
                    }`}
                    dir="rtl"
                  >
                    <Link
                      href={`/pages/${page.id}`}
                      onClick={closeAll}
                      className="flex min-h-14 min-w-0 flex-1 items-center gap-3 rounded-[14px] px-2.5 text-right transition hover:bg-[#f8f8fc]"
                    >
                      <span
                        className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
                        style={{ backgroundColor: activeTheme.accentSoft, color: activeTheme.accent }}
                      >
                        <FileText className="h-4 w-4" />
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium text-[#303c52]">
                          {page.title}
                        </span>
                        <span className="mt-0.5 block text-[10px] text-[#9299a8]">
                          {formatDate(new Date(page.updatedAt))}
                        </span>
                      </span>
                    </Link>
                    <button
                      type="button"
                      onClick={() => setActionSheet({ type: "page", id: page.id })}
                      className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-[#778094] transition hover:bg-[#f2f2f8]"
                      aria-label={`عملیات ${page.title}`}
                    >
                      <EllipsisVertical className="h-4 w-4" />
                    </button>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="flex min-h-56 flex-col items-center justify-center px-6 text-center">
              <span className="mb-3 inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-[#f0f1f5] text-[#7e8799]">
                <FileText className="h-5 w-5" />
              </span>
              <p className="text-sm font-medium text-[#4b566b]">این زیر مجموعه هنوز صفحه‌ای ندارد.</p>
              <p className="mt-1 text-xs text-[#9097a7]">برای شروع، «صفحه جدید» را بزن.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
