"use client";

import {
  ChevronDown,
  EllipsisVertical,
  Folder,
  FolderPlus,
  NotebookPen,
  Trash2,
  X,
} from "lucide-react";
import type { Dispatch, RefObject, SetStateAction } from "react";

import {
  TRASH_GROUP_KEY,
  UNGROUPED_ID,
  type ActionSheetState,
  type MobileGroupSection,
  type MobileNotebook,
} from "@/components/use-mobile-shell-model";
import { getNotebookTheme } from "@/lib/notebook-theme";

type MobileSectionsPanelProps = {
  activeGroupId: string | null;
  activeNotebook: MobileNotebook | null;
  beginCreateNotebook: (groupId: string) => void;
  cancelCreateNotebook: () => void;
  closeAll: () => void;
  creatingNotebookGroupId: string | null;
  draftGroupName: string;
  draftNotebookName: string;
  editingGroupId: string | null;
  editingNotebookId: string | null;
  expandedGroupIds: string[];
  groupedNotebooks: MobileGroupSection[];
  groupInputRef: RefObject<HTMLInputElement | null>;
  isCreatingGroup: boolean;
  isPending: boolean;
  notebookInputRef: RefObject<HTMLInputElement | null>;
  selectNotebook: (notebook: MobileNotebook) => void;
  setActionSheet: Dispatch<SetStateAction<ActionSheetState>>;
  setDraftGroupName: Dispatch<SetStateAction<string>>;
  setDraftNotebookName: Dispatch<SetStateAction<string>>;
  setEditingGroupId: Dispatch<SetStateAction<string | null>>;
  setEditingNotebookId: Dispatch<SetStateAction<string | null>>;
  setIsCreatingGroup: Dispatch<SetStateAction<boolean>>;
  submitCreateGroup: () => void;
  submitCreateNotebook: () => void;
  submitRenameGroup: () => void;
  submitRenameNotebook: () => void;
  toggleGroupSelection: (groupId: string) => void;
};

export function MobileSectionsPanel({
  activeGroupId,
  activeNotebook,
  beginCreateNotebook,
  cancelCreateNotebook,
  closeAll,
  creatingNotebookGroupId,
  draftGroupName,
  draftNotebookName,
  editingGroupId,
  editingNotebookId,
  expandedGroupIds,
  groupedNotebooks,
  groupInputRef,
  isCreatingGroup,
  isPending,
  notebookInputRef,
  selectNotebook,
  setActionSheet,
  setDraftGroupName,
  setDraftNotebookName,
  setEditingGroupId,
  setEditingNotebookId,
  setIsCreatingGroup,
  submitCreateGroup,
  submitCreateNotebook,
  submitRenameGroup,
  submitRenameNotebook,
  toggleGroupSelection,
}: MobileSectionsPanelProps) {
  const createNotebookGroup =
    groupedNotebooks.find(
      (group) =>
        group.id === activeGroupId &&
        group.id !== UNGROUPED_ID &&
        group.systemKey !== TRASH_GROUP_KEY,
    ) ??
    groupedNotebooks.find(
      (group) =>
        group.id !== UNGROUPED_ID && group.systemKey !== TRASH_GROUP_KEY,
    ) ??
    null;

  return (
        <div className="fixed inset-0 z-50 cursor-pointer bg-[#1f2940]/20" onClick={closeAll}>
          <div
            className="absolute inset-0 overflow-hidden bg-[#f7f8fc]"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="sticky top-0 z-10 border-b border-[#e9eaf1] bg-white/96 px-4 pb-3 pt-[max(12px,env(safe-area-inset-top))] backdrop-blur-xl">
              <div className="relative flex min-h-10 items-center justify-center">
                <button
                  type="button"
                  onClick={closeAll}
                  className="absolute left-0 inline-flex h-9 w-9 items-center justify-center rounded-xl text-[var(--text-muted)] transition hover:bg-[var(--bg-softer)]"
                  aria-label="بستن فهرست مجموعه‌ها"
                >
                  <X className="h-5 w-5" />
                </button>
                <div className="text-center">
                  <div className="text-base font-bold text-[#23324d]">مجموعه‌ها</div>
                  <div className="mt-0.5 text-[11px] text-[#8a92a4]">خانه / مجموعه‌ها</div>
                </div>
              </div>

              <div className="mt-3 grid grid-cols-2 gap-2" dir="rtl">
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    if (createNotebookGroup) {
                      beginCreateNotebook(createNotebookGroup.id);
                    }
                  }}
                  disabled={!createNotebookGroup || isPending}
                  className="inline-flex min-h-11 items-center justify-center gap-2 rounded-[14px] bg-[#6756d8] px-3 text-xs font-medium text-white transition hover:bg-[#5b49cc] disabled:cursor-not-allowed disabled:opacity-45"
                  title={
                    createNotebookGroup
                      ? `افزودن به ${createNotebookGroup.name}`
                      : "ابتدا یک مجموعه بسازید"
                  }
                >
                  <FolderPlus className="h-4 w-4" />
                  زیر مجموعه جدید
                </button>
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    setEditingGroupId(null);
                    setDraftGroupName("");
                    setIsCreatingGroup((current) => !current);
                  }}
                  className="inline-flex min-h-11 items-center justify-center gap-2 rounded-[14px] border border-[#dedfea] bg-white px-3 text-xs font-medium text-[#33406d] transition hover:bg-[#f7f7fb]"
                >
                  <FolderPlus className="h-4 w-4" />
                  مجموعه جدید
                </button>
              </div>
            </div>

            <div className="h-[calc(100dvh-122px-env(safe-area-inset-top))] overflow-y-auto px-3 py-4 pb-28">
              <div className="grid gap-3">
                {isCreatingGroup ? (
                  <div className="rounded-2xl border border-dashed border-[#b5baff] bg-[#f8f8ff] px-4 py-3">
                    <input
                      ref={groupInputRef}
                      value={draftGroupName}
                      onChange={(event) => setDraftGroupName(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          submitCreateGroup();
                        }

                        if (event.key === "Escape") {
                          event.preventDefault();
                          setDraftGroupName("");
                          setIsCreatingGroup(false);
                        }
                      }}
                      disabled={isPending}
                      placeholder="نام مجموعه جدید"
                      className="w-full border-none bg-transparent text-right text-sm outline-none placeholder:text-[#708090]"
                      dir="rtl"
                    />
                  </div>
                ) : null}

                {groupedNotebooks
                  .filter((group) => group.id !== UNGROUPED_ID)
                  .map((group) => {
                  const canManageGroup =
                    group.id !== UNGROUPED_ID && group.systemKey !== TRASH_GROUP_KEY;
                  const isEditing = editingGroupId === group.id;
                  const isActiveGroup = activeGroupId === group.id;

                  return (
                    <div
                      key={group.id}
                      className={`rounded-[22px] border bg-white p-2 transition ${
                        isActiveGroup
                          ? "border-[#c9c2fb] ring-2 ring-[#ebe8ff]"
                          : "border-[#e7e8f0]"
                      }`}
                    >
                      <div className="flex items-center gap-1.5" dir="rtl">
                        <button
                          type="button"
                          onClick={() => toggleGroupSelection(group.id)}
                          className="flex min-h-12 min-w-0 flex-1 items-center justify-between rounded-[16px] px-2.5 text-right transition hover:bg-[#f8f8fc]"
                          aria-label={`${group.notebookCount} ${group.name}`}
                        >
                          <span className="flex min-w-0 items-center gap-2.5 text-sm font-semibold text-[#23324d]">
                            <span className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ${
                              group.systemKey === TRASH_GROUP_KEY
                                ? "bg-[#fff1f0] text-[#c43f38]"
                                : "bg-[#f0eeff] text-[#6a58d7]"
                            }`}>
                              {group.systemKey === TRASH_GROUP_KEY ? (
                                <Trash2 className="h-4 w-4" />
                              ) : (
                                <Folder className="h-4 w-4" />
                              )}
                            </span>
                            {isEditing ? (
                              <input
                                ref={groupInputRef}
                                value={draftGroupName}
                                onChange={(event) => setDraftGroupName(event.target.value)}
                                onBlur={submitRenameGroup}
                                onKeyDown={(event) => {
                                  if (event.key === "Enter") {
                                    event.preventDefault();
                                    submitRenameGroup();
                                  }
                                  if (event.key === "Escape") {
                                    event.preventDefault();
                                    setEditingGroupId(null);
                                    setDraftGroupName("");
                                  }
                                }}
                                className="min-w-0 border-none bg-transparent text-right text-sm outline-none"
                                dir="rtl"
                                onClick={(event) => event.stopPropagation()}
                              />
                            ) : (
                              <span className="truncate">{group.name}</span>
                            )}
                          </span>
                          <span className="mr-2 flex shrink-0 items-center gap-2 text-[#7b8497]">
                            <span className="min-w-5 rounded-full bg-[#f2f3f7] px-1.5 py-0.5 text-center text-[10px] font-medium">
                              {group.notebookCount}
                            </span>
                            <ChevronDown
                              className={`h-3.5 w-3.5 transition ${
                                expandedGroupIds.includes(group.id) ? "rotate-180" : ""
                              }`}
                            />
                          </span>
                        </button>

                        {canManageGroup ? (
                          <>
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                beginCreateNotebook(group.id);
                              }}
                              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-[#667085] transition hover:bg-[#f2f2f8]"
                              aria-label={`افزودن زیر مجموعه به ${group.name}`}
                            >
                              <FolderPlus className="h-4 w-4" />
                            </button>
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                setActionSheet({ type: "group", id: group.id });
                              }}
                              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-[#667085] transition hover:bg-[#f2f2f8]"
                              aria-label={`عملیات ${group.name}`}
                            >
                              <EllipsisVertical className="h-4 w-4" />
                            </button>
                          </>
                        ) : null}
                      </div>

                      {expandedGroupIds.includes(group.id) ? (
                        <div className="mt-2 grid gap-1.5 border-t border-[#eff0f5] px-1 pt-2">
                          {creatingNotebookGroupId === group.id ? (
                            <div className="rounded-[14px] border border-dashed border-[#b9b1f6] bg-[#faf9ff] px-3 py-2.5">
                              <input
                                ref={notebookInputRef}
                                value={draftNotebookName}
                                onChange={(event) => setDraftNotebookName(event.target.value)}
                                onKeyDown={(event) => {
                                  if (event.key === "Enter") {
                                    event.preventDefault();
                                    submitCreateNotebook();
                                  }
                                  if (event.key === "Escape") {
                                    event.preventDefault();
                                    cancelCreateNotebook();
                                  }
                                }}
                                disabled={isPending}
                                placeholder="نام زیر مجموعه جدید"
                                className="w-full border-none bg-transparent text-right text-sm outline-none placeholder:text-[#8b92a3]"
                                dir="rtl"
                              />
                            </div>
                          ) : null}
                          {group.notebooks.length > 0 ? (
                            group.notebooks.map((notebook) => {
                              const theme = getNotebookTheme(notebook.id, notebook.themeKey);
                              const isActiveNotebook = activeNotebook?.id === notebook.id;
                              const canManageNotebook = !notebook.systemKey;
                              const isEditingNotebook = editingNotebookId === notebook.id;

                              return (
                                <div key={notebook.id} className="flex items-center gap-1" dir="rtl">
                                  <button
                                    type="button"
                                    onClick={() => selectNotebook(notebook)}
                                    className="flex min-h-11 min-w-0 flex-1 items-center gap-2.5 rounded-[14px] border px-3 text-right text-sm transition"
                                    style={{
                                      backgroundColor: isActiveNotebook ? theme.accentSoft : "#fbfbfd",
                                      borderColor: isActiveNotebook ? theme.accent : "#ececf3",
                                      color: isActiveNotebook ? theme.sidebarText : "#3c485f",
                                      boxShadow: isActiveNotebook
                                        ? `inset -3px 0 0 ${theme.accent}`
                                        : undefined,
                                    }}
                                  >
                                    <span
                                      className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg"
                                      style={{ backgroundColor: theme.accentSoft, color: theme.accent }}
                                    >
                                      <NotebookPen className="h-3.5 w-3.5" />
                                    </span>
                                    {isEditingNotebook ? (
                                      <input
                                        ref={notebookInputRef}
                                        value={draftNotebookName}
                                        onChange={(event) => setDraftNotebookName(event.target.value)}
                                        onBlur={submitRenameNotebook}
                                        onKeyDown={(event) => {
                                          if (event.key === "Enter") {
                                            event.preventDefault();
                                            submitRenameNotebook();
                                          }
                                          if (event.key === "Escape") {
                                            event.preventDefault();
                                            setEditingNotebookId(null);
                                            setDraftNotebookName("");
                                          }
                                        }}
                                        className="min-w-0 flex-1 border-none bg-transparent text-right text-sm outline-none"
                                        dir="rtl"
                                        onClick={(event) => event.stopPropagation()}
                                      />
                                    ) : (
                                      <span className="truncate">{notebook.name}</span>
                                    )}
                                  </button>

                                  {canManageNotebook ? (
                                    <button
                                      type="button"
                                      onClick={(event) => {
                                        event.stopPropagation();
                                        setActionSheet({ type: "notebook", id: notebook.id });
                                      }}
                                      className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-[#778094] transition hover:bg-[#f2f2f8]"
                                      aria-label={`عملیات ${notebook.name}`}
                                    >
                                      <EllipsisVertical className="h-4 w-4" />
                                    </button>
                                  ) : null}
                                </div>
                              );
                            })
                          ) : (
                            <div className="rounded-[14px] border border-dashed border-[#dedfe8] bg-[#fbfbfd] px-3 py-3 text-right text-xs text-[#858da0]">
                              هنوز زیر مجموعه‌ای در این مجموعه نیست
                            </div>
                          )}
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
  );
}
