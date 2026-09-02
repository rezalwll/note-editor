"use client";

import { FolderPlus, Trash2 } from "lucide-react";
import type { Dispatch, RefObject, SetStateAction } from "react";

import { useContextMenu } from "@/components/context-menu";
import {
  TRASH_GROUP_KEY,
  type NotebookGroupTab,
} from "@/components/section-tabs-model";
import {
  NOTEBOOK_THEMES,
  getGroupThemeByKey,
  type ThemeKey,
} from "@/lib/notebook-theme";
import { cn, formatNumber } from "@/lib/utils";

type SectionGroupTabsProps = {
  activeGroupKey: string | null;
  beginCreateGroup: () => void;
  beginRenameGroup: (groupId: string, groupName: string) => void;
  cancelGroupEdit: () => void;
  clearTrash: () => void;
  deleteGroup: (groupId: string) => void;
  draftGroupName: string;
  draggedGroupId: string | null;
  editingGroupId: string | null;
  groupInputRef: RefObject<HTMLInputElement | null>;
  groupTabs: NotebookGroupTab[];
  handleGroupDrop: (targetGroupId: string) => void;
  setDraftGroupName: Dispatch<SetStateAction<string>>;
  setDraggedGroupId: Dispatch<SetStateAction<string | null>>;
  setManualGroupKey: Dispatch<SetStateAction<string | null>>;
  submitGroupRename: () => void;
  updateGroupTheme: (groupId: string, themeKey: ThemeKey) => void;
};

export function SectionGroupTabs({
  activeGroupKey,
  beginCreateGroup,
  beginRenameGroup,
  cancelGroupEdit,
  clearTrash,
  deleteGroup,
  draftGroupName,
  draggedGroupId,
  editingGroupId,
  groupInputRef,
  groupTabs,
  handleGroupDrop,
  setDraftGroupName,
  setDraggedGroupId,
  setManualGroupKey,
  submitGroupRename,
  updateGroupTheme,
}: SectionGroupTabsProps) {
  const { openMenu } = useContextMenu();

  function getGroupPillTheme(themeKey?: string | null) {
    return getGroupThemeByKey(themeKey);
  }

  return (
<div className="flex flex-wrap items-center gap-2">
        {groupTabs.map((group) => {
          const isActive = activeGroupKey === group.id;
          const isEditing = editingGroupId === group.id;
          const pillTheme = getGroupPillTheme(group.themeKey);
          const isTrash = group.systemKey === TRASH_GROUP_KEY;

          return (
            <div
              key={group.id}
              data-testid={`group-tab-${group.id}`}
              data-group-id={group.id}
              data-group-system-key={group.systemKey ?? ""}
              draggable={!isEditing && !isTrash}
              onDragStart={() => {
                if (isTrash) {
                  return;
                }

                setDraggedGroupId(group.id);
              }}
              onDragEnd={() => setDraggedGroupId(null)}
              onDragOver={(event) => {
                if (!isTrash && draggedGroupId) {
                  event.preventDefault();
                }
              }}
              onDrop={(event) => {
                if (isTrash) {
                  return;
                }

                event.preventDefault();
                handleGroupDrop(group.id);
              }}
              onClick={() => {
                if (!isEditing) {
                  setManualGroupKey(group.id);
                }
              }}
              onContextMenu={(event) => {
                if (isEditing) {
                  return;
                }

                event.preventDefault();
                openMenu(event, {
                  title: group.name,
                  items: [
                    {
                      id: "open-group",
                      label: "باز کردن مجموعه",
                      onSelect: () => setManualGroupKey(group.id),
                    },
                    ...(isTrash
                      ? [
                          { id: "separator-trash", separator: true as const },
                          {
                            id: "empty-trash",
                            label: "خالی کردن حذف‌شده‌ها",
                            danger: true,
                            onSelect: clearTrash,
                          },
                        ]
                      : [
                          {
                            id: "rename-group",
                            label: "تغییر نام مجموعه",
                            onSelect: () => beginRenameGroup(group.id, group.name),
                          },
                          { id: "separator-1", separator: true as const },
                          {
                            id: "group-color",
                            label: "رنگ",
                            submenu: NOTEBOOK_THEMES.map((theme) => ({
                              id: `theme-group-${theme.key}`,
                              label: theme.label,
                              swatch: theme.tab,
                              selected: pillTheme.key === theme.key,
                              onSelect: () =>
                                updateGroupTheme(group.id, theme.key),
                            })),
                          },
                          { id: "separator-2", separator: true as const },
                          {
                            id: "delete-group",
                            label: "حذف مجموعه",
                            danger: true,
                            onSelect: () => deleteGroup(group.id),
                          },
                        ]),
                  ].filter((item) => item.id !== "move-ungrouped"),
                });
              }}
               className={cn(
                 "inline-flex h-8 items-center rounded-full border px-3 text-xs font-medium transition duration-200 hover:-translate-y-px",
                 "cursor-pointer",
                 draggedGroupId === group.id ? "opacity-70" : null,
               )}
              style={{
                borderColor: pillTheme.border,
                backgroundColor: isTrash ? "#ffe5ea" : pillTheme.bg,
                color: isTrash ? "#1f2937" : pillTheme.text,
                boxShadow: isActive
                  ? "0 0 0 1px rgba(255,255,255,0.96), 0 0 0 3px rgba(34,197,94,0.5), 0 8px 18px rgba(34,197,94,0.2)"
                  : `0 6px 18px ${pillTheme.border}33`,
                opacity: 0.92,
              }}
              title={
                isTrash
                  ? "زیر مجموعه‌ها و صفحه‌های حذف‌شده تا ۳۰ روز اینجا نگه‌داری می‌شوند و بعد حذف خواهند شد."
                  : undefined
              }
            >
              {isEditing ? (
                <input
                  ref={groupInputRef}
                  value={draftGroupName}
                  onChange={(event) => setDraftGroupName(event.target.value)}
                  onBlur={submitGroupRename}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      submitGroupRename();
                    }

                    if (event.key === "Escape") {
                      event.preventDefault();
                      cancelGroupEdit();
                    }
                  }}
                  className="w-24 border-none bg-transparent text-xs outline-none"
                  style={{
                    color: isTrash ? "#1f2937" : pillTheme.text,
                    caretColor: isTrash ? "#1f2937" : pillTheme.text,
                  }}
                />
              ) : (
                <button
                  type="button"
                  className={cn(
                    "inline-flex items-center gap-2",
                  )}
                >
                  {isTrash ? <Trash2 className="h-3.5 w-3.5" /> : null}
                  <span>{group.name}</span>
                    <span
                      className={cn(
                        "inline-flex min-w-5 items-center justify-center rounded-full px-1.5 py-0.5 text-[10px] leading-none tabular-nums",
                      )}
                      style={{
                        backgroundColor: isTrash
                          ? "rgba(255,255,255,0.72)"
                          : pillTheme.badgeBg,
                        color: isTrash ? "#1f2937" : pillTheme.badgeText,
                      }}
                    >
                      {formatNumber(group.notebookCount)}
                    </span>
                </button>
              )}
            </div>
          );
        })}

        {editingGroupId === "__new__" ? (
          <div className="inline-flex h-8 items-center rounded-full border border-dashed border-[#9DA6FF] bg-[linear-gradient(90deg,#9FA1FF_0%,#B5BAFF_35%,#AEE2FF_70%,#D9F9DF_100%)] px-3 text-xs font-medium text-[#30416c] shadow-[0_8px_22px_rgba(159,161,255,0.2)]">
            <input
              ref={groupInputRef}
              data-testid="new-group-name"
              value={draftGroupName}
              onChange={(event) => setDraftGroupName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  submitGroupRename();
                }

                if (event.key === "Escape") {
                  event.preventDefault();
                  cancelGroupEdit();
                }
              }}
              placeholder="مجموعه جدید"
              className="w-24 border-none bg-transparent text-xs text-[#30416c] outline-none placeholder:text-[#30416c]/70"
              style={{ caretColor: "#30416c" }}
            />
          </div>
        ) : (
          <button
            type="button"
            data-testid="create-group"
            onClick={beginCreateGroup}
            className="inline-flex h-8 items-center gap-2 rounded-full border border-dashed border-[#9DA6FF] bg-[linear-gradient(90deg,#9FA1FF_0%,#B5BAFF_35%,#AEE2FF_70%,#D9F9DF_100%)] px-3 text-xs font-medium text-[#30416c] shadow-[0_8px_22px_rgba(159,161,255,0.2)] transition hover:brightness-[1.03]"
          >
            <FolderPlus className="h-3.5 w-3.5" />
            مجموعه جدید
          </button>
        )}
      </div>
  );
}
