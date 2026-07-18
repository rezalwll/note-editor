"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronDown, Plus } from "lucide-react";
import type { Dispatch, RefObject, SetStateAction } from "react";

import { useContextMenu } from "@/components/context-menu";
import {
  TRASH_GROUP_KEY,
  type NotebookGroupTab,
  type NotebookTab,
} from "@/components/section-tabs-model";
import {
  NOTEBOOK_THEMES,
  getNotebookTheme,
  type ThemeKey,
} from "@/lib/notebook-theme";
import { cn } from "@/lib/utils";

type SectionNotebookTabsProps = {
  activeGroupKey: string | null;
  activeNotebookId: string | null;
  beginCreateGroup: () => void;
  beginCreateNotebook: () => void;
  beginRenameNotebook: (notebook: NotebookTab) => void;
  cancelNotebookEdit: () => void;
  deleteNotebooks: (notebookIds: string[], permanently?: boolean) => void;
  draftName: string;
  draftNotebook: NotebookTab | null;
  draggedNotebookId: string | null;
  editingNotebookId: string | null;
  groupItems: NotebookGroupTab[];
  handleNotebookDrop: (targetNotebookId: string) => void;
  hasWritableGroup: boolean;
  isOverflowOpen: boolean;
  isPending: boolean;
  isTrashGroup: (groupId: string | null | undefined) => boolean;
  moveNotebooksToGroup: (notebookIds: string[], groupId: string | null) => void;
  notebookInputRef: RefObject<HTMLInputElement | null>;
  overflowNotebooks: NotebookTab[];
  selectedNotebookIds: string[];
  selectSingleNotebook: (notebookId: string) => void;
  setDraftName: Dispatch<SetStateAction<string>>;
  setDraggedNotebookId: Dispatch<SetStateAction<string | null>>;
  setIsOverflowOpen: Dispatch<SetStateAction<boolean>>;
  setManualGroupKey: Dispatch<SetStateAction<string | null>>;
  setSelectedNotebookIds: Dispatch<SetStateAction<string[]>>;
  submitNotebookRename: () => void;
  toggleNotebookSelection: (notebookId: string) => void;
  updateNotebookTheme: (notebookId: string, themeKey: ThemeKey) => void;
  visibleNotebooks: NotebookTab[];
};

export function SectionNotebookTabs({
  activeGroupKey,
  activeNotebookId,
  beginCreateGroup,
  beginCreateNotebook,
  beginRenameNotebook,
  cancelNotebookEdit,
  deleteNotebooks,
  draftName,
  draftNotebook,
  draggedNotebookId,
  editingNotebookId,
  groupItems,
  handleNotebookDrop,
  hasWritableGroup,
  isOverflowOpen,
  isPending,
  isTrashGroup,
  moveNotebooksToGroup,
  notebookInputRef,
  overflowNotebooks,
  selectedNotebookIds,
  selectSingleNotebook,
  setDraftName,
  setDraggedNotebookId,
  setIsOverflowOpen,
  setManualGroupKey,
  setSelectedNotebookIds,
  submitNotebookRename,
  toggleNotebookSelection,
  updateNotebookTheme,
  visibleNotebooks,
}: SectionNotebookTabsProps) {
  const router = useRouter();
  const { openMenu } = useContextMenu();

  return (
<div
        className="mt-2 flex flex-wrap items-end gap-1"
        onContextMenu={(event) => {
          const target = event.target as HTMLElement;

          if (target.closest("[data-section-tab]")) {
            return;
          }

          event.preventDefault();
          openMenu(event, {
            title: "زیر مجموعه‌ها",
            items: [
              ...(!isTrashGroup(activeGroupKey) && hasWritableGroup
                ? [
                    {
                id: "new-section",
                label: "زیر مجموعه جدید",
                onSelect: beginCreateNotebook,
                    },
                  ]
                : []),
              {
                id: "new-category",
                label: "مجموعه جدید",
                onSelect: beginCreateGroup,
              },
              ...(selectedNotebookIds.length > 0
                ? [
                    { id: "separator-1", separator: true as const },
                    {
                      id: "clear-selection",
                      label: `پاک کردن انتخاب ${selectedNotebookIds.length} زیر مجموعه`,
                      onSelect: () => setSelectedNotebookIds([]),
                    },
                  ]
                : []),
            ],
          });
        }}
      >

        {visibleNotebooks.map((notebook) => {
          const theme = getNotebookTheme(notebook.id, notebook.themeKey);
          const isActive = activeNotebookId === notebook.id;
          const isEditing = editingNotebookId === notebook.id;
          const isSelected = selectedNotebookIds.includes(notebook.id);
          const isDeleted = Boolean(notebook.deletedAt);
          const isSystemNotebook = Boolean(notebook.systemKey);
          const selectionIds =
            isSelected && selectedNotebookIds.length > 1
              ? selectedNotebookIds
              : [notebook.id];

          return (
            <div
              key={notebook.id}
              data-section-tab="true"
              data-testid={`notebook-tab-${notebook.id}`}
              data-notebook-id={notebook.id}
              data-notebook-system-key={notebook.systemKey ?? ""}
              draggable={!isEditing && !isDeleted && !isSystemNotebook && !isTrashGroup(activeGroupKey)}
              onDragStart={() => {
                if (isDeleted || isSystemNotebook || isTrashGroup(activeGroupKey)) {
                  return;
                }

                setDraggedNotebookId(notebook.id);
              }}
              onDragEnd={() => setDraggedNotebookId(null)}
              onDragOver={(event) => {
                if (draggedNotebookId) {
                  event.preventDefault();
                }
              }}
              onDrop={(event) => {
                event.preventDefault();
                handleNotebookDrop(notebook.id);
              }}
              onContextMenu={(event) => {
                if (isEditing) {
                  return;
                }

                event.preventDefault();
                if (!isSelected) {
                  setSelectedNotebookIds([notebook.id]);
                }

                openMenu(event, {
                  title:
                    selectionIds.length > 1
                      ? `${selectionIds.length} زیر مجموعه انتخاب شده`
                      : notebook.name || "زیر مجموعه بدون عنوان",
                  items: [
                    ...(selectionIds.length === 1
                      ? [
                          {
                            id: "open",
                            label: "باز کردن زیر مجموعه",
                            onSelect: () => router.push(`/notebooks/${notebook.id}`),
                          },
                          ...(!isSystemNotebook
                            ? [
                                {
                                  id: "rename",
                                  label: "تغییر نام زیر مجموعه",
                                  onSelect: () => beginRenameNotebook(notebook),
                                },
                                {
                                  id: "notebook-color",
                                  label: "رنگ",
                                  submenu: NOTEBOOK_THEMES.map((colorTheme) => ({
                                    id: `theme-notebook-${colorTheme.key}`,
                                    label: colorTheme.label,
                                    swatch: colorTheme.tab,
                                    selected: theme.key === colorTheme.key,
                                    onSelect: () =>
                                      updateNotebookTheme(
                                        notebook.id,
                                        colorTheme.key,
                                      ),
                                  })),
                                },
                              ]
                            : []),
                          { id: "separator-open", separator: true as const },
                        ]
                      : []),
                    ...(!isSystemNotebook
                      ? [
                          {
                            id: "move-ungrouped",
                            label: "انتقال به بدون مجموعه",
                            onSelect: () =>
                              moveNotebooksToGroup(selectionIds, null),
                          },
                          ...groupItems
                            .filter(
                              (group) =>
                                group.id !== notebook.groupId &&
                                group.systemKey !== TRASH_GROUP_KEY,
                            )
                            .map((group) => ({
                              id: `move-${group.id}`,
                              label: `انتقال به ${group.name}`,
                              onSelect: () =>
                                moveNotebooksToGroup(selectionIds, group.id),
                            })),
                        ]
                      : []),
                    { id: "separator-delete", separator: true as const },
                    {
                      id: "delete",
                      label:
                        selectionIds.length > 1
                          ? "حذف زیر مجموعه‌های انتخاب‌شده"
                          : "حذف زیر مجموعه",
                      danger: true,
                      onSelect: () => deleteNotebooks(selectionIds, isDeleted),
                    },
                  ],
                });
              }}
               className={cn(
                 "inline-flex h-6 items-center rounded-t-md text-xs transition",
                 "cursor-pointer",
                 isEditing ? "px-4" : null,
                 isActive ? "translate-y-[1px]" : "hover:-translate-y-px",
                 draggedNotebookId === notebook.id ? "opacity-70" : null,
               )}
              style={{
                backgroundColor: theme.tab,
                color: theme.tabText,
                boxShadow: [
                  isSelected ? `0 0 0 2px ${theme.tabBorder}` : null,
                  isActive
                    ? `inset 0 0 0 1px ${theme.tabBorder}, inset 0 -1px 0 rgba(0,0,0,0.08)`
                    : "inset 0 -1px 0 rgba(0,0,0,0.08)",
                ]
                  .filter(Boolean)
                  .join(", "),
              }}
            >
              {isEditing ? (
                <input
                  ref={notebookInputRef}
                  data-testid={
                    draftNotebook?.id === notebook.id
                      ? "new-notebook-name"
                      : `rename-notebook-${notebook.id}`
                  }
                  autoFocus
                  disabled={isPending}
                  value={draftName}
                  onChange={(event) => setDraftName(event.target.value)}
                  onBlur={submitNotebookRename}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      submitNotebookRename();
                    }

                    if (event.key === "Escape") {
                      event.preventDefault();
                      cancelNotebookEdit();
                    }
                  }}
                  className="w-10 border-none bg-transparent text-xs outline-none"
                  style={{ color: theme.tabText, caretColor: theme.tabText }}
                />
              ) : (
                <Link
                  href={`/notebooks/${notebook.id}`}
                  className="inline-flex h-full items-center px-4"
                  onClick={(event) => {
                    if (event.ctrlKey || event.metaKey) {
                      event.preventDefault();
                      toggleNotebookSelection(notebook.id);
                      return;
                    }

                    selectSingleNotebook(notebook.id);
                    setManualGroupKey(notebook.groupId);
                    setIsOverflowOpen(false);
                  }}
                >
                  {notebook.name || "زیر مجموعه بدون عنوان"}
                </Link>
              )}
            </div>
          );
        })}

        {overflowNotebooks.length > 0 ? (
          <div className="relative">
            <button
              type="button"
              onClick={() => setIsOverflowOpen((current) => !current)}
              className="inline-flex h-6 items-center gap-1 rounded-t-md border border-[var(--border-soft)] bg-[var(--bg-softer)] px-3 text-xs text-[var(--text-main)] transition hover:bg-white"
            >
              بیشتر
              <ChevronDown className="h-3.5 w-3.5" />
            </button>

            {isOverflowOpen ? (
              <div className="absolute left-0 top-[calc(100%+6px)] z-50 min-w-[220px] rounded-2xl border border-[var(--border-soft)] bg-white p-2 shadow-[var(--shadow-soft)]">
                <div className="mb-2 px-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">
                  زیر مجموعه‌های پنهان
                </div>
                <div className="grid gap-1">
                  {overflowNotebooks.map((notebook) => (
                    <Link
                      key={`overflow-${notebook.id}`}
                      href={`/notebooks/${notebook.id}`}
                      onClick={() => {
                        setSelectedNotebookIds([notebook.id]);
                        setManualGroupKey(notebook.groupId);
                        setIsOverflowOpen(false);
                      }}
                      className="rounded-xl px-3 py-2 text-xs text-[var(--text-strong)] transition hover:bg-[var(--bg-softer)]"
                    >
                      {notebook.name || "زیر مجموعه بدون عنوان"}
                    </Link>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        ) : null}

        {!isTrashGroup(activeGroupKey) && hasWritableGroup ? (
        <button
          type="button"
          data-testid="create-notebook"
          onClick={beginCreateNotebook}
          disabled={isPending}
          className="flex h-6 w-9 items-center justify-center rounded-t-md border border-stone-300 bg-white text-stone-700 transition hover:bg-stone-100 disabled:cursor-wait disabled:opacity-60"
          title={
            isTrashGroup(activeGroupKey)
              ? "در مجموعه حذف‌شده‌ها نمی‌توان زیر مجموعه جدید ساخت."
              : "زیر مجموعه جدید"
          }
        >
          <Plus className="h-4 w-4" />
        </button>
        ) : null}
      </div>
  );
}
