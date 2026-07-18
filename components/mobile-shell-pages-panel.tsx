"use client";

import Link from "next/link";
import { CirclePlus, EllipsisVertical, X } from "lucide-react";
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
        <div className="fixed inset-0 z-50 cursor-pointer bg-black/20" onClick={closeAll}>
          <div
            className="absolute inset-x-0 bottom-0 max-h-[78vh] overflow-hidden rounded-t-[28px] shadow-[0_-24px_80px_rgba(15,23,42,0.22)]"
            style={{ backgroundColor: activeTheme.sidebarBg }}
            onClick={(event) => event.stopPropagation()}
          >
            <div
              className="sticky top-0 z-10 flex items-center justify-between border-b px-4 py-3"
              style={{
                borderColor: activeTheme.sidebarBorder,
                backgroundColor: activeTheme.sidebarHeaderBg,
              }}
            >
              <button
                type="button"
                onClick={() => {
                  setDraftTitle("");
                  setIsCreating(true);
                }}
                className="inline-flex items-center gap-2 text-sm"
                style={{ color: activeTheme.sidebarText }}
                disabled={Boolean(activeNotebook?.deletedAt) || !activeNotebook}
              >
                <CirclePlus className="h-4 w-4" />
                صفحه جدید
              </button>
              <button type="button" onClick={closeAll} className="text-[var(--text-muted)]">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div
              className="sticky top-[57px] z-[9] border-b px-4 py-3 backdrop-blur"
              style={{
                borderColor: activeTheme.sidebarBorder,
                backgroundColor: `${activeTheme.sidebarBg}f0`,
              }}
            >
              <div className="mb-2 text-right text-[11px] font-semibold text-[var(--text-muted)]">
                {activeGroup
                  ? `زیر مجموعه‌های ${activeGroup.name}`
                  : "زیر مجموعه‌های مجموعه"}
              </div>
              <div className="flex gap-2 overflow-x-auto pb-1">
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
                      className="shrink-0 rounded-full border px-3 py-2 text-sm font-medium transition"
                      style={{
                        backgroundColor: isActiveNotebook
                          ? notebookTheme.sidebarActive
                          : notebookTheme.accentSoft,
                        borderColor: isActiveNotebook
                          ? notebookTheme.accent
                          : notebookTheme.editorBorder,
                        color: notebookTheme.sidebarText,
                      }}
                    >
                      {notebook.name}
                    </Link>
                  );
                })}
              </div>
            </div>

            {isCreating ? (
              <div
                className="border-b bg-white px-4 py-3"
                style={{ borderColor: activeTheme.sidebarBorder }}
              >
                <input
                  ref={inputRef}
                  value={draftTitle}
                  onChange={(event) => setDraftTitle(event.target.value)}
                  onBlur={submitCreate}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      submitCreate();
                    }
                  }}
                  disabled={isPending}
                  placeholder="صفحه بدون عنوان"
                  className="w-full border-none bg-transparent text-right text-sm outline-none"
                  dir="rtl"
                />
              </div>
            ) : null}

            <div className="max-h-[calc(78vh-138px)] overflow-y-auto">
              {activeGroupNotebooks.length === 0 ? (
                <div className="px-4 py-6 text-right text-sm text-[#708090]">
                  هنوز زیر مجموعه‌ای برای این مجموعه انتخاب نشده است.
                </div>
              ) : activeNotebook!.pages.length > 0 ? (
                  activeNotebook!.pages.map((page) => {
                    const isActive = pathname === `/pages/${page.id}`;

                    return (
                      <div key={page.id} className="flex items-center gap-2 border-b px-4 py-3" style={{ borderColor: activeTheme.sidebarBorder }}>
                        <button
                          type="button"
                          onClick={() => setActionSheet({ type: "page", id: page.id })}
                          className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-white/70 bg-white/80 text-[#50607a]"
                          aria-label={`عملیات ${page.title}`}
                        >
                          <EllipsisVertical className="h-4 w-4" />
                        </button>
                        <Link
                          href={`/pages/${page.id}`}
                          onClick={closeAll}
                          className="block w-full rounded-xl px-3 py-2 text-right transition"
                          style={{
                            backgroundColor: isActive ? activeTheme.sidebarHover : "transparent",
                          }}
                          dir="rtl"
                        >
                          <div className="text-sm" style={{ color: activeTheme.sidebarText }}>
                            {page.title}
                          </div>
                          <div className="mt-1 text-[11px]" style={{ color: activeTheme.sidebarMuted }}>
                            {formatDate(new Date(page.updatedAt))}
                          </div>
                        </Link>
                      </div>
                    );
                  })
              ) : (
                  <div
                    className="px-4 py-6 text-right text-sm"
                    style={{ color: activeTheme.sidebarMuted }}
                  >
                    این زیر مجموعه هنوز صفحه‌ای ندارد.
                  </div>
              )}
            </div>
          </div>
        </div>
  );
}
