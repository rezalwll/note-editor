"use client";

import Link from "next/link";
import { ChevronDown, FolderPlus, Plus } from "lucide-react";
import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useOptimistic,
  useRef,
  useState,
  useTransition,
} from "react";
import { usePathname, useRouter } from "next/navigation";

import {
  archiveNotebookInlineAction,
  assignNotebookGroupInlineAction,
  createNotebookGroupInlineAction,
  createNotebookInlineAction,
  deleteNotebookGroupInlineAction,
  renameNotebookGroupInlineAction,
  renameNotebookInlineAction,
} from "@/app/actions";
import { useContextMenu } from "@/components/context-menu";
import { getNotebookTheme } from "@/lib/notebook-theme";
import { cn } from "@/lib/utils";

type NotebookTab = {
  id: string;
  name: string;
  groupId: string | null;
  groupName?: string | null;
};

type NotebookGroupTab = {
  id: string;
  name: string;
  notebookCount: number;
};

type SectionTabsProps = {
  groups: NotebookGroupTab[];
  notebooks: NotebookTab[];
};

const UNGROUPED_KEY = "__ungrouped__";
const GROUP_PILL_PALETTE = [
  {
    bg: "#9FA1FF",
    border: "#858BFF",
    text: "#ffffff",
    badgeBg: "rgba(255,255,255,0.22)",
    badgeText: "#ffffff",
  },
  {
    bg: "#B5BAFF",
    border: "#9DA6FF",
    text: "#2f3864",
    badgeBg: "rgba(255,255,255,0.52)",
    badgeText: "#2f3864",
  },
  {
    bg: "#AEE2FF",
    border: "#8FD4FF",
    text: "#24465B",
    badgeBg: "rgba(255,255,255,0.56)",
    badgeText: "#24465B",
  },
  {
    bg: "#D9F9DF",
    border: "#BAEEC4",
    text: "#2E5440",
    badgeBg: "rgba(255,255,255,0.6)",
    badgeText: "#2E5440",
  },
] as const;

export function SectionTabs({ groups, notebooks }: SectionTabsProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { openMenu } = useContextMenu();
  const [selectedNotebookIds, setSelectedNotebookIds] = useState<string[]>([]);
  const [editingNotebookId, setEditingNotebookId] = useState<string | null>(null);
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [createdNotebookId, setCreatedNotebookId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState("");
  const [draftGroupName, setDraftGroupName] = useState("");
  const [manualGroupKey, setManualGroupKey] = useState<string | null>(null);
  const [overflowNotebookIds, setOverflowNotebookIds] = useState<string[]>([]);
  const [isOverflowOpen, setIsOverflowOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const notebookInputRef = useRef<HTMLInputElement | null>(null);
  const groupInputRef = useRef<HTMLInputElement | null>(null);
  const measureRef = useRef<HTMLDivElement | null>(null);
  const [items, updateNotebooks] = useOptimistic(
    notebooks,
    (
      current,
      action:
        | { type: "append"; notebook: NotebookTab }
        | { type: "rename"; notebookId: string; name: string }
        | { type: "remove-many"; notebookIds: string[] }
        | {
            type: "move-many";
            notebookIds: string[];
            groupId: string | null;
            groupName: string | null;
          },
    ) => {
      switch (action.type) {
        case "append":
          return [...current, action.notebook];
        case "rename":
          return current.map((notebook) =>
            notebook.id === action.notebookId
              ? { ...notebook, name: action.name }
              : notebook,
          );
        case "remove-many":
          return current.filter(
            (notebook) => !action.notebookIds.includes(notebook.id),
          );
        case "move-many":
          return current.map((notebook) =>
            action.notebookIds.includes(notebook.id)
              ? {
                  ...notebook,
                  groupId: action.groupId,
                  groupName: action.groupName,
                }
              : notebook,
          );
      }
    },
  );
  const [groupItems, updateGroups] = useOptimistic(
    groups,
    (
      current,
      action:
        | { type: "append"; group: NotebookGroupTab }
        | { type: "rename"; groupId: string; name: string }
        | { type: "delete"; groupId: string },
    ) => {
      switch (action.type) {
        case "append":
          return [...current, action.group];
        case "rename":
          return current.map((group) =>
            group.id === action.groupId ? { ...group, name: action.name } : group,
          );
        case "delete":
          return current.filter((group) => group.id !== action.groupId);
      }
    },
  );

  const activeNotebookId =
    pathname.match(/^\/notebooks\/([^/]+)/)?.[1] ??
    items.find((notebook) => pathname.includes(notebook.id))?.id ??
    null;
  const currentActiveNotebookGroupKey =
    items.find((notebook) => notebook.id === activeNotebookId)?.groupId ??
    UNGROUPED_KEY;
  const activeGroupKey = manualGroupKey ?? currentActiveNotebookGroupKey;

  useEffect(() => {
    if (editingNotebookId) {
      requestAnimationFrame(() => {
        const input = notebookInputRef.current;

        if (!input) {
          return;
        }

        input.focus();
        const caretPosition = input.value.length;
        input.setSelectionRange(caretPosition, caretPosition);
      });
    }
  }, [editingNotebookId]);

  useEffect(() => {
    if (editingGroupId) {
      requestAnimationFrame(() => {
        const input = groupInputRef.current;

        if (!input) {
          return;
        }

        input.focus();
        const caretPosition = input.value.length;
        input.setSelectionRange(caretPosition, caretPosition);
      });
    }
  }, [editingGroupId]);

  const activeGroupNotebooks = useMemo(
    () =>
      items.filter((notebook) =>
        activeGroupKey === UNGROUPED_KEY
          ? notebook.groupId === null
          : notebook.groupId === activeGroupKey,
      ),
    [activeGroupKey, items],
  );
  const activeGroupNotebookSignature = useMemo(
    () =>
      activeGroupNotebooks
        .map((notebook) => `${notebook.id}:${notebook.name}:${notebook.groupId ?? ""}`)
        .join("|"),
    [activeGroupNotebooks],
  );

  useLayoutEffect(() => {
    const container = measureRef.current;

    if (!container) {
      return;
    }

    const notebookElements = Array.from(
      container.querySelectorAll<HTMLElement>("[data-measure-notebook-id]"),
    );

    if (notebookElements.length === 0) {
      setOverflowNotebookIds((current) =>
        current.length === 0 ? current : [],
      );
      return;
    }

    const rows: number[] = [];
    const visibleIds: string[] = [];
    const overflowIds: string[] = [];

    for (const element of notebookElements) {
      const top = element.offsetTop;

      if (!rows.includes(top)) {
        rows.push(top);
      }

      const notebookId = element.dataset.measureNotebookId;
      if (!notebookId) {
        continue;
      }

      if (rows.length <= 2) {
        visibleIds.push(notebookId);
      } else {
        overflowIds.push(notebookId);
      }
    }

    if (overflowIds.length > 0 && visibleIds.length > 0) {
      overflowIds.unshift(visibleIds.pop()!);
    }

    setOverflowNotebookIds((current) =>
      current.join(",") === overflowIds.join(",") ? current : overflowIds,
    );
  }, [activeGroupNotebookSignature, editingNotebookId]);

  const visibleNotebooks = useMemo(() => {
    const hiddenIds = new Set(overflowNotebookIds);
    return activeGroupNotebooks.filter((notebook) => !hiddenIds.has(notebook.id));
  }, [activeGroupNotebooks, overflowNotebookIds]);

  const overflowNotebooks = useMemo(() => {
    const hiddenIds = new Set(overflowNotebookIds);
    return activeGroupNotebooks.filter((notebook) => hiddenIds.has(notebook.id));
  }, [activeGroupNotebooks, overflowNotebookIds]);

  const groupTabs = useMemo(() => {
    const grouped = groupItems.map((group) => ({
      id: group.id,
      name: group.name,
      notebookCount: items.filter((item) => item.groupId === group.id).length,
    }));
    const ungroupedCount = items.filter((item) => item.groupId === null).length;

    return [
      ...grouped,
      {
        id: UNGROUPED_KEY,
        name: "بدون دسته",
        notebookCount: ungroupedCount,
      },
    ];
  }, [groupItems, items]);

  function getGroupPillTheme(index: number) {
    return GROUP_PILL_PALETTE[index % GROUP_PILL_PALETTE.length];
  }

  function beginCreateNotebook() {
    if (isPending) {
      return;
    }

    startTransition(async () => {
      const result = await createNotebookInlineAction(
        "",
        activeGroupKey === UNGROUPED_KEY ? null : activeGroupKey,
      );

      if ("id" in result && result.id) {
        updateNotebooks({
          type: "append",
          notebook: {
            id: result.id,
            name: "",
            groupId: activeGroupKey === UNGROUPED_KEY ? null : activeGroupKey,
            groupName:
              groupItems.find((group) => group.id === activeGroupKey)?.name ?? null,
          },
        });
        setCreatedNotebookId(result.id);
        setEditingNotebookId(result.id);
        setDraftName("");
        setSelectedNotebookIds([result.id]);
      }
    });
  }


  function beginCreateGroup() {
    setEditingGroupId("__new__");
    setDraftGroupName("");
  }

  function beginRenameNotebook(notebook: NotebookTab) {
    setSelectedNotebookIds([notebook.id]);
    setEditingNotebookId(notebook.id);
    setDraftName(notebook.name);
  }

  function beginRenameGroup(groupId: string, groupName: string) {
    setEditingGroupId(groupId);
    setDraftGroupName(groupName);
  }

  function cancelNotebookEdit() {
    setDraftName("");
    setEditingNotebookId(null);
  }

  function cancelGroupEdit() {
    setDraftGroupName("");
    setEditingGroupId(null);
  }

  function toggleNotebookSelection(notebookId: string) {
    setSelectedNotebookIds((current) =>
      current.includes(notebookId)
        ? current.filter((id) => id !== notebookId)
        : [...current, notebookId],
    );
  }

  function selectSingleNotebook(notebookId: string) {
    setSelectedNotebookIds([notebookId]);
  }

  function submitNotebookRename() {
    if (!editingNotebookId) {
      return;
    }

    const targetNotebookId = editingNotebookId;
    const nextName = draftName.trim() || "دفتر بدون عنوان";

    setEditingNotebookId(null);
    setDraftName("");

    if (createdNotebookId === targetNotebookId) {
      setCreatedNotebookId(null);
      router.push(`/notebooks/${targetNotebookId}`);
    }

    startTransition(async () => {
      updateNotebooks({
        type: "rename",
        notebookId: targetNotebookId,
        name: nextName,
      });
      await renameNotebookInlineAction(targetNotebookId, nextName);
      router.refresh();
    });
  }

  function submitGroupRename() {
    const nextName = draftGroupName.trim() || "دسته بدون عنوان";

    if (editingGroupId === "__new__") {
      setEditingGroupId(null);
      setDraftGroupName("");

      startTransition(async () => {
        const result = await createNotebookGroupInlineAction(nextName);

        if ("id" in result && result.id) {
          updateGroups({
            type: "append",
            group: {
              id: result.id,
              name: nextName,
              notebookCount: 0,
            },
          });
          setManualGroupKey(result.id);
          router.refresh();
        }
      });
      return;
    }

    if (!editingGroupId) {
      return;
    }

    const targetGroupId = editingGroupId;
    const notebookIdsInGroup = items
      .filter((notebook) => notebook.groupId === targetGroupId)
      .map((notebook) => notebook.id);

    setEditingGroupId(null);
    setDraftGroupName("");

    startTransition(async () => {
      updateGroups({ type: "rename", groupId: targetGroupId, name: nextName });
      updateNotebooks({
        type: "move-many",
        notebookIds: notebookIdsInGroup,
        groupId: targetGroupId,
        groupName: nextName,
      });
      await renameNotebookGroupInlineAction(targetGroupId, nextName);
      router.refresh();
    });
  }

  function archiveNotebooks(notebookIds: string[]) {
    const fallbackNotebookId =
      items.find((item) => !notebookIds.includes(item.id))?.id ?? null;
    const shouldRedirect = activeNotebookId ? notebookIds.includes(activeNotebookId) : false;

    startTransition(async () => {
      updateNotebooks({ type: "remove-many", notebookIds });
      setSelectedNotebookIds([]);

      await Promise.all(
        notebookIds.map((notebookId) => archiveNotebookInlineAction(notebookId)),
      );

      if (shouldRedirect) {
        router.push(fallbackNotebookId ? `/notebooks/${fallbackNotebookId}` : "/");
      }

      router.refresh();
    });
  }

  function moveNotebooksToGroup(notebookIds: string[], groupId: string | null) {
    const nextGroupName =
      groupItems.find((group) => group.id === groupId)?.name ?? null;

    setSelectedNotebookIds([]);
    setManualGroupKey(groupId ?? UNGROUPED_KEY);

    startTransition(async () => {
      updateNotebooks({
        type: "move-many",
        notebookIds,
        groupId,
        groupName: nextGroupName,
      });
      await assignNotebookGroupInlineAction(notebookIds, groupId);
      router.refresh();
    });
  }

  function deleteGroup(groupId: string) {
    const notebookIdsInGroup = items
      .filter((notebook) => notebook.groupId === groupId)
      .map((notebook) => notebook.id);

    setManualGroupKey(UNGROUPED_KEY);

    startTransition(async () => {
      updateGroups({ type: "delete", groupId });
      updateNotebooks({
        type: "move-many",
        notebookIds: notebookIdsInGroup,
        groupId: null,
        groupName: null,
      });
      await deleteNotebookGroupInlineAction(groupId);
      router.refresh();
    });
  }

  return (
    <div className="relative border-b border-[var(--border-soft)] bg-white/95 px-3 pb-2 pt-2 backdrop-blur">
      <div
        ref={measureRef}
        className="invisible absolute left-0 right-0 top-0 -z-10 flex flex-wrap items-end gap-1 px-3 pt-2"
      >
        {activeGroupNotebooks.map((notebook) => {
          const theme = getNotebookTheme(notebook.id);

          return (
            <div
              key={`measure-${notebook.id}`}
              data-measure-notebook-id={notebook.id}
              className="inline-flex h-6 items-center rounded-t-md px-4 text-xs"
              style={{
                backgroundColor: theme.tab,
                color: theme.tabText,
              }}
            >
              {notebook.name || "دفتر بدون عنوان"}
            </div>
          );
        })}
        <div className="flex h-6 w-9 items-center justify-center rounded-t-md border border-stone-300 bg-white text-stone-700">
          <Plus className="h-4 w-4" />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {groupTabs.map((group, index) => {
          const isActive = activeGroupKey === group.id;
          const isEditing = editingGroupId === group.id;
          const pillTheme = getGroupPillTheme(index);

          return (
            <div
              key={group.id}
              onContextMenu={(event) => {
                if (group.id === UNGROUPED_KEY || isEditing) {
                  return;
                }

                event.preventDefault();
                openMenu(event, {
                  title: group.name,
                  items: [
                    {
                      id: "open-group",
                      label: "باز کردن دسته",
                      onSelect: () => setManualGroupKey(group.id),
                    },
                    {
                      id: "rename-group",
                      label: "تغییر نام دسته",
                      onSelect: () => beginRenameGroup(group.id, group.name),
                    },
                    { id: "separator-1", separator: true },
                    {
                      id: "delete-group",
                      label: "حذف دسته",
                      danger: true,
                      onSelect: () => deleteGroup(group.id),
                    },
                  ],
                });
              }}
              className={cn(
                "inline-flex items-center rounded-full border px-3 text-xs font-medium transition duration-200 hover:-translate-y-px",
                isActive ? "h-9 text-[13px] font-semibold" : "h-8",
              )}
              style={{
                borderColor: pillTheme.border,
                backgroundColor: pillTheme.bg,
                color: pillTheme.text,
                boxShadow: isActive
                  ? `0 0 0 2px rgba(255,255,255,0.72), 0 0 0 4px ${pillTheme.border}18, 0 10px 24px ${pillTheme.border}52`
                  : `0 6px 18px ${pillTheme.border}33`,
                opacity: isActive ? 1 : 0.92,
              }}
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
                    color: pillTheme.text,
                    caretColor: pillTheme.text,
                  }}
                />
              ) : (
                <button
                  type="button"
                  onClick={() => setManualGroupKey(group.id)}
                  className={cn(
                    "inline-flex items-center gap-2",
                    isActive ? "gap-2.5" : "gap-2",
                  )}
                >
                  <span>{group.name}</span>
                  <span
                    className={cn(
                      "rounded-full px-1.5 py-0.5 text-[10px]",
                      isActive ? "min-w-5.5 text-[10px]" : "",
                    )}
                    style={{
                      backgroundColor: pillTheme.badgeBg,
                      color: pillTheme.badgeText,
                    }}
                  >
                    {group.notebookCount}
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
              placeholder="دسته جدید"
              className="w-24 border-none bg-transparent text-xs text-[#30416c] outline-none placeholder:text-[#30416c]/70"
              style={{ caretColor: "#30416c" }}
            />
          </div>
        ) : (
          <button
            type="button"
            onClick={beginCreateGroup}
            className="inline-flex h-8 items-center gap-2 rounded-full border border-dashed border-[#9DA6FF] bg-[linear-gradient(90deg,#9FA1FF_0%,#B5BAFF_35%,#AEE2FF_70%,#D9F9DF_100%)] px-3 text-xs font-medium text-[#30416c] shadow-[0_8px_22px_rgba(159,161,255,0.2)] transition hover:brightness-[1.03]"
          >
            <FolderPlus className="h-3.5 w-3.5" />
            دسته جدید
          </button>
        )}
      </div>

      <div
        className="mt-2 flex flex-wrap items-end gap-1"
        onContextMenu={(event) => {
          const target = event.target as HTMLElement;

          if (target.closest("[data-section-tab]")) {
            return;
          }

          event.preventDefault();
          openMenu(event, {
            title: "دفترها",
            items: [
              {
                id: "new-section",
                label: "دفتر جدید",
                onSelect: beginCreateNotebook,
              },
              {
                id: "new-category",
                label: "دسته جدید",
                onSelect: beginCreateGroup,
              },
              ...(selectedNotebookIds.length > 0
                ? [
                    { id: "separator-1", separator: true as const },
                    {
                      id: "clear-selection",
                      label: `پاک کردن انتخاب ${selectedNotebookIds.length} دفتر`,
                      onSelect: () => setSelectedNotebookIds([]),
                    },
                  ]
                : []),
            ],
          });
        }}
      >

        {visibleNotebooks.map((notebook) => {
          const theme = getNotebookTheme(notebook.id);
          const isActive = activeNotebookId === notebook.id;
          const isEditing = editingNotebookId === notebook.id;
          const isSelected = selectedNotebookIds.includes(notebook.id);
          const selectionIds =
            isSelected && selectedNotebookIds.length > 1
              ? selectedNotebookIds
              : [notebook.id];

          return (
            <div
              key={notebook.id}
              data-section-tab="true"
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
                      ? `${selectionIds.length} دفتر انتخاب شده`
                      : notebook.name || "دفتر بدون عنوان",
                  items: [
                    ...(selectionIds.length === 1
                      ? [
                          {
                            id: "open",
                            label: "باز کردن دفتر",
                            onSelect: () => router.push(`/notebooks/${notebook.id}`),
                          },
                          {
                            id: "rename",
                            label: "تغییر نام دفتر",
                            onSelect: () => beginRenameNotebook(notebook),
                          },
                          { id: "separator-open", separator: true as const },
                        ]
                      : []),
                    {
                      id: "move-ungrouped",
                      label: "انتقال به بدون دسته",
                      onSelect: () => moveNotebooksToGroup(selectionIds, null),
                    },
                    ...groupItems
                      .filter((group) => group.id !== notebook.groupId)
                      .map((group) => ({
                        id: `move-${group.id}`,
                        label: `انتقال به ${group.name}`,
                        onSelect: () => moveNotebooksToGroup(selectionIds, group.id),
                      })),
                    { id: "separator-delete", separator: true as const },
                    {
                      id: "delete",
                      label:
                        selectionIds.length > 1
                          ? "حذف دفترهای انتخاب‌شده"
                          : "حذف دفتر",
                      danger: true,
                      onSelect: () => archiveNotebooks(selectionIds),
                    },
                  ],
                });
              }}
              className={cn(
                "inline-flex h-6 items-center rounded-t-md px-4 text-xs transition",
                isActive ? "translate-y-[1px]" : "hover:-translate-y-px",
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
                  autoFocus
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
                  onClick={(event) => {
                    if (event.ctrlKey || event.metaKey) {
                      event.preventDefault();
                      toggleNotebookSelection(notebook.id);
                      return;
                    }

                    selectSingleNotebook(notebook.id);
                    setManualGroupKey(notebook.groupId ?? UNGROUPED_KEY);
                    setIsOverflowOpen(false);
                  }}
                >
                  {notebook.name || "دفتر بدون عنوان"}
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
                  دفترهای پنهان
                </div>
                <div className="grid gap-1">
                  {overflowNotebooks.map((notebook) => (
                    <Link
                      key={`overflow-${notebook.id}`}
                      href={`/notebooks/${notebook.id}`}
                      onClick={() => {
                        setSelectedNotebookIds([notebook.id]);
                        setManualGroupKey(notebook.groupId ?? UNGROUPED_KEY);
                        setIsOverflowOpen(false);
                      }}
                      className="rounded-xl px-3 py-2 text-xs text-[var(--text-strong)] transition hover:bg-[var(--bg-softer)]"
                    >
                      {notebook.name || "دفتر بدون عنوان"}
                    </Link>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        ) : null}

        <button
          type="button"
          onClick={beginCreateNotebook}
          disabled={isPending}
          className="flex h-6 w-9 items-center justify-center rounded-t-md border border-stone-300 bg-white text-stone-700 transition hover:bg-stone-100 disabled:cursor-wait disabled:opacity-60"
          title="دفتر جدید"
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
