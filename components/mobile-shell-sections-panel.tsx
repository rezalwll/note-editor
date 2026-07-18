"use client";

import { ChevronDown, EllipsisVertical, FolderPlus, Trash2, X } from "lucide-react";
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
  closeAll: () => void;
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
  submitRenameGroup: () => void;
  submitRenameNotebook: () => void;
  toggleGroupSelection: (groupId: string) => void;
};

export function MobileSectionsPanel({
  activeGroupId,
  activeNotebook,
  closeAll,
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
  submitRenameGroup,
  submitRenameNotebook,
  toggleGroupSelection,
}: MobileSectionsPanelProps) {
  return (
        <div className="fixed inset-0 z-50 cursor-pointer bg-black/20" onClick={closeAll}>
          <div
            className="absolute inset-x-0 top-0 max-h-[72vh] overflow-hidden rounded-b-[28px] bg-white shadow-[0_24px_80px_rgba(15,23,42,0.22)]"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-[var(--border-soft)] bg-white px-4 py-3">
              <button
                type="button"
                onClick={() => {
                  setEditingGroupId(null);
                  setDraftGroupName("");
                  setIsCreatingGroup((current) => !current);
                }}
                className="inline-flex items-center gap-2 rounded-full border border-[var(--border-soft)] px-3 py-1.5 text-xs font-semibold text-[#33406d]"
              >
                <FolderPlus className="h-3.5 w-3.5" />
                مجموعه جدید
              </button>
              <div className="flex items-center gap-3">
                <div className="text-sm font-semibold text-[var(--text-strong)]">مجموعه‌ها</div>
                <button type="button" onClick={closeAll} className="text-[var(--text-muted)]">
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            <div className="max-h-[calc(72vh-58px)] overflow-y-auto p-4">
              <div className="grid gap-4">
                {isCreatingGroup ? (
                  <div className="rounded-2xl border border-dashed border-[#b5baff] bg-[#f8f8ff] px-4 py-3">
                    <input
                      ref={groupInputRef}
                      value={draftGroupName}
                      onChange={(event) => setDraftGroupName(event.target.value)}
                      onBlur={submitCreateGroup}
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
                    <div key={group.id}>
                      <div className="flex items-center gap-2">
                        {canManageGroup ? (
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              setActionSheet({ type: "group", id: group.id });
                            }}
                            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-[var(--border-soft)] bg-white text-[#50607a]"
                            aria-label={`عملیات ${group.name}`}
                          >
                            <EllipsisVertical className="h-4 w-4" />
                          </button>
                        ) : null}

                        <button
                          type="button"
                          onClick={() => toggleGroupSelection(group.id)}
                          className="flex w-full items-center justify-between rounded-2xl border border-[var(--border-soft)] bg-[#fbfbff] px-4 py-3 text-right shadow-[0_2px_8px_rgba(15,23,42,0.05)]"
                          style={{
                            boxShadow: isActiveGroup
                              ? "0 0 0 1px rgba(255,255,255,0.96), 0 0 0 3px rgba(34,197,94,0.5), 0 8px 18px rgba(34,197,94,0.2)"
                              : undefined,
                          }}
                        >
                          <div className="flex items-center gap-3">
                            <ChevronDown
                              className={[
                                "h-4 w-4 text-[#708090] transition",
                                expandedGroupIds.includes(group.id) ? "rotate-180" : "",
                              ].join(" ")}
                            />
                            <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-semibold text-[#50607a]">
                              {group.notebookCount}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 text-sm font-semibold text-[#23324d]">
                            {group.systemKey === TRASH_GROUP_KEY ? (
                              <Trash2 className="h-3.5 w-3.5" />
                            ) : null}
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
                              <span>{group.name}</span>
                            )}
                          </div>
                        </button>
                      </div>

                      {expandedGroupIds.includes(group.id) ? (
                        <div className="mt-2 grid gap-2 pr-3">
                          {group.notebooks.length > 0 ? (
                            group.notebooks.map((notebook) => {
                              const theme = getNotebookTheme(notebook.id, notebook.themeKey);
                              const isActiveNotebook = activeNotebook?.id === notebook.id;
                              const canManageNotebook = !notebook.systemKey;
                              const isEditingNotebook = editingNotebookId === notebook.id;

                              return (
                                <div key={notebook.id} className="flex items-center gap-2">
                                  {canManageNotebook ? (
                                    <button
                                      type="button"
                                      onClick={(event) => {
                                        event.stopPropagation();
                                        setActionSheet({ type: "notebook", id: notebook.id });
                                      }}
                                      className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border bg-white text-[#50607a] shadow-[0_2px_8px_rgba(15,23,42,0.05)]"
                                      style={{ borderColor: theme.editorBorder }}
                                      aria-label={`عملیات ${notebook.name}`}
                                    >
                                      <EllipsisVertical className="h-4 w-4" />
                                    </button>
                                  ) : null}

                                  <button
                                    type="button"
                                    onClick={() => selectNotebook(notebook)}
                                    className="w-full rounded-2xl border px-4 py-3 text-right text-sm shadow-[0_2px_8px_rgba(15,23,42,0.05)] transition"
                                    style={{
                                      backgroundColor: isActiveNotebook
                                        ? theme.sidebarActive
                                        : theme.accentSoft,
                                      borderColor: isActiveNotebook
                                        ? theme.accent
                                        : theme.editorBorder,
                                      color: theme.sidebarText,
                                    }}
                                  >
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
                                        className="w-full border-none bg-transparent text-right text-sm outline-none"
                                        dir="rtl"
                                        onClick={(event) => event.stopPropagation()}
                                      />
                                    ) : (
                                      notebook.name
                                    )}
                                  </button>
                                </div>
                              );
                            })
                          ) : (
                            <div className="rounded-2xl border border-dashed border-[var(--border-soft)] bg-white px-4 py-3 text-right text-xs text-[#708090]">
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
