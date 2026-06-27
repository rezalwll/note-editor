"use client";

import Link from "next/link";
import { ChevronDown, FolderPlus, Plus, Trash2 } from "lucide-react";
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
  emptyTrashInlineAction,
  createNotebookInlineAction,
  deleteNotebookPermanentlyInlineAction,
  deleteNotebookGroupInlineAction,
  reorderNotebookGroupsInlineAction,
  reorderNotebooksInlineAction,
  renameNotebookGroupInlineAction,
  renameNotebookInlineAction,
  updateNotebookGroupThemeInlineAction,
  updateNotebookThemeInlineAction,
} from "@/app/actions";
import { useContextMenu } from "@/components/context-menu";
import { getOverflowNotebookIds } from "@/lib/notebook-tabs";
import {
  NOTEBOOK_THEMES,
  getGroupThemeByKey,
  getNotebookTheme,
  getRandomThemeKey,
  type ThemeKey,
} from "@/lib/notebook-theme";
import { cn } from "@/lib/utils";

type NotebookTab = {
  id: string;
  name: string;
  groupId: string | null;
  sortOrder?: number;
  themeKey?: string | null;
  groupName?: string | null;
  systemKey?: string | null;
  deletedAt?: Date | null;
  pageIds?: string[];
};

type NotebookGroupTab = {
  id: string;
  name: string;
  notebookCount: number;
  sortOrder?: number;
  themeKey?: string | null;
  systemKey?: string | null;
};

type SectionTabsProps = {
  groups: NotebookGroupTab[];
  notebooks: NotebookTab[];
};

const TRASH_GROUP_KEY = "deleted-items";
function reorderIds(ids: string[], draggedId: string, targetId: string) {
  if (draggedId === targetId) {
    return ids;
  }

  const nextIds = ids.filter((id) => id !== draggedId);
  const targetIndex = nextIds.indexOf(targetId);

  if (targetIndex === -1) {
    return ids;
  }

  nextIds.splice(targetIndex, 0, draggedId);
  return nextIds;
}

export function SectionTabs({ groups, notebooks }: SectionTabsProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { openMenu } = useContextMenu();
  const [selectedNotebookIds, setSelectedNotebookIds] = useState<string[]>([]);
  const [editingNotebookId, setEditingNotebookId] = useState<string | null>(null);
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [draftNotebook, setDraftNotebook] = useState<NotebookTab | null>(null);
  const [draftName, setDraftName] = useState("");
  const [draftGroupName, setDraftGroupName] = useState("");
  const [manualGroupKey, setManualGroupKey] = useState<string | null>(null);
  const [overflowNotebookIds, setOverflowNotebookIds] = useState<string[]>([]);
  const [isOverflowOpen, setIsOverflowOpen] = useState(false);
  const [draggedGroupId, setDraggedGroupId] = useState<string | null>(null);
  const [draggedNotebookId, setDraggedNotebookId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const notebookInputRef = useRef<HTMLInputElement | null>(null);
  const groupInputRef = useRef<HTMLInputElement | null>(null);
  const measureRef = useRef<HTMLDivElement | null>(null);
  const createNotebookInFlightRef = useRef(false);
  const [items, updateNotebooks] = useOptimistic(
    notebooks,
    (
      current,
      action:
        | { type: "append"; notebook: NotebookTab }
        | { type: "rename"; notebookId: string; name: string }
        | { type: "theme"; notebookId: string; themeKey: ThemeKey }
        | { type: "remove-many"; notebookIds: string[] }
        | { type: "reorder"; groupId: string; notebookIds: string[] }
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
        case "theme":
          return current.map((notebook) =>
            notebook.id === action.notebookId
              ? { ...notebook, themeKey: action.themeKey }
              : notebook,
          );
        case "remove-many":
          return current.filter(
            (notebook) => !action.notebookIds.includes(notebook.id),
          );
        case "reorder": {
          const positions = new Map(
            action.notebookIds.map((id, index) => [id, index]),
          );

          return current.map((notebook) =>
            notebook.groupId === action.groupId && positions.has(notebook.id)
              ? {
                  ...notebook,
                  sortOrder: positions.get(notebook.id) ?? notebook.sortOrder,
                }
              : notebook,
          );
        }
        case "move-many":
          {
            const selectedOrder = new Map(
              action.notebookIds.map((id, index) => [id, index]),
            );
            const targetBaseOrder = current.filter(
              (item) =>
                item.groupId === action.groupId &&
                !action.notebookIds.includes(item.id),
            ).length;

            return current.map((notebook) =>
              action.notebookIds.includes(notebook.id)
                ? {
                    ...notebook,
                    groupId: action.groupId,
                    groupName: action.groupName,
                    sortOrder:
                      targetBaseOrder +
                      (selectedOrder.get(notebook.id) ?? 0),
                  }
                : notebook,
            );
          }
      }
    },
  );
  const displayItems = useMemo(
    () =>
      draftNotebook && !items.some((item) => item.id === draftNotebook.id)
        ? [...items, draftNotebook]
        : items,
    [draftNotebook, items],
  );
  const [groupItems, updateGroups] = useOptimistic(
    groups,
    (
      current,
      action:
        | { type: "append"; group: NotebookGroupTab }
        | { type: "rename"; groupId: string; name: string }
        | { type: "theme"; groupId: string; themeKey: ThemeKey }
        | { type: "reorder"; groupIds: string[] }
        | { type: "delete"; groupId: string },
    ) => {
      switch (action.type) {
        case "append":
          return [...current, action.group];
        case "rename":
          return current.map((group) =>
            group.id === action.groupId ? { ...group, name: action.name } : group,
          );
        case "theme":
          return current.map((group) =>
            group.id === action.groupId
              ? { ...group, themeKey: action.themeKey }
              : group,
          );
        case "reorder": {
          const positions = new Map(
            action.groupIds.map((id, index) => [id, index]),
          );

          return current.map((group) =>
            positions.has(group.id)
              ? { ...group, sortOrder: positions.get(group.id) ?? group.sortOrder }
              : group,
          );
        }
        case "delete":
          return current.filter((group) => group.id !== action.groupId);
      }
    },
  );

  const activeNotebookId = useMemo(() => {
    const notebookMatch = pathname.match(/^\/notebooks\/([^/]+)/)?.[1];

    if (notebookMatch) {
      return notebookMatch;
    }

    const pageMatch = pathname.match(/^\/pages\/([^/]+)/)?.[1];

    if (!pageMatch) {
      return null;
    }

    return (
      displayItems.find((notebook) => notebook.pageIds?.includes(pageMatch))?.id ??
      null
    );
  }, [displayItems, pathname]);
  const trashGroupId =
    groupItems.find((group) => group.systemKey === TRASH_GROUP_KEY)?.id ?? null;
  const firstUsableGroupId =
    groupItems.find((group) => group.systemKey !== TRASH_GROUP_KEY)?.id ?? null;
  const routeGroupKey =
    pathname === "/trash"
      ? trashGroupId
      : (displayItems.find((notebook) => notebook.id === activeNotebookId)?.groupId ??
          firstUsableGroupId ??
          trashGroupId);
  const activeGroupKey = manualGroupKey ?? routeGroupKey;

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
      displayItems
        .filter((notebook) => notebook.groupId === activeGroupKey)
        .sort(
          (left, right) => (left.sortOrder ?? 0) - (right.sortOrder ?? 0),
        ),
    [activeGroupKey, displayItems],
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

    const pinnedNotebookId = editingNotebookId ?? activeNotebookId;
    const overflowIds = getOverflowNotebookIds(
      notebookElements
        .map((element) => {
          const notebookId = element.dataset.measureNotebookId;

          if (!notebookId) {
            return null;
          }

          return {
            id: notebookId,
            rowTop: element.offsetTop,
          };
        })
        .filter((row): row is { id: string; rowTop: number } => row !== null),
      pinnedNotebookId,
    );

    setOverflowNotebookIds((current) =>
      current.join(",") === overflowIds.join(",") ? current : overflowIds,
    );
  }, [activeGroupNotebookSignature, activeNotebookId, editingNotebookId]);

  const visibleNotebooks = useMemo(() => {
    const hiddenIds = new Set(overflowNotebookIds);
    return activeGroupNotebooks.filter((notebook) => !hiddenIds.has(notebook.id));
  }, [activeGroupNotebooks, overflowNotebookIds]);

  const overflowNotebooks = useMemo(() => {
    const hiddenIds = new Set(overflowNotebookIds);
    return activeGroupNotebooks.filter((notebook) => hiddenIds.has(notebook.id));
  }, [activeGroupNotebooks, overflowNotebookIds]);

  const groupTabs = useMemo(
    () =>
      groupItems
        .map((group) => ({
          id: group.id,
          name: group.name,
          notebookCount: displayItems.filter((item) => item.groupId === group.id).length,
          sortOrder: group.sortOrder,
          themeKey: group.themeKey,
          systemKey: group.systemKey ?? null,
        }))
        .sort(
          (left, right) => (left.sortOrder ?? 0) - (right.sortOrder ?? 0),
        ),
    [displayItems, groupItems],
  );

  const hasWritableGroup = useMemo(
    () => groupItems.some((group) => group.systemKey !== TRASH_GROUP_KEY),
    [groupItems],
  );

  function getGroupPillTheme(themeKey?: string | null) {
    return getGroupThemeByKey(themeKey);
  }

  function isTrashGroup(groupId: string | null | undefined) {
    return groupItems.some(
      (group) => group.id === groupId && group.systemKey === TRASH_GROUP_KEY,
    );
  }

  function updateGroupTheme(groupId: string, themeKey: ThemeKey) {
    startTransition(async () => {
      updateGroups({ type: "theme", groupId, themeKey });
      await updateNotebookGroupThemeInlineAction(groupId, themeKey);
      router.refresh();
    });
  }

  function updateNotebookTheme(notebookId: string, themeKey: ThemeKey) {
    startTransition(async () => {
      updateNotebooks({ type: "theme", notebookId, themeKey });
      await updateNotebookThemeInlineAction(notebookId, themeKey);
      router.refresh();
    });
  }

  function beginCreateNotebook() {
    if (isPending || draftNotebook || !activeGroupKey || isTrashGroup(activeGroupKey)) {
      return;
    }

    const tempNotebookId = `draft-notebook-${Date.now()}`;
    const nextGroupId = activeGroupKey;
    const nextGroupName =
      groupItems.find((group) => group.id === activeGroupKey)?.name ?? null;

    setDraftNotebook({
      id: tempNotebookId,
      name: "",
      groupId: nextGroupId,
      sortOrder: activeGroupNotebooks.length,
      themeKey: getRandomThemeKey(tempNotebookId),
      groupName: nextGroupName,
      pageIds: [],
    });
    setEditingNotebookId(tempNotebookId);
    setDraftName("");
    setManualGroupKey(nextGroupId);
    setIsOverflowOpen(false);
    setSelectedNotebookIds([tempNotebookId]);
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
    if (editingNotebookId && draftNotebook?.id === editingNotebookId) {
      setDraftNotebook(null);
      setSelectedNotebookIds([]);
    }

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
    const nextName = draftName.trim() || "زیر مجموعه بدون عنوان";

    if (draftNotebook?.id === targetNotebookId) {
      if (createNotebookInFlightRef.current) {
        return;
      }

      const notebookGroupId = draftNotebook.groupId;
      const notebookGroupName = draftNotebook.groupName ?? null;
      createNotebookInFlightRef.current = true;

      startTransition(async () => {
        try {
          if (!notebookGroupId) {
            return;
          }

          const result = await createNotebookInlineAction(
            nextName,
            notebookGroupId,
            draftNotebook.themeKey ?? undefined,
          );

          if (!("id" in result) || !result.id || !("pageId" in result) || !result.pageId) {
            return;
          }

          updateNotebooks({
            type: "append",
            notebook: {
              id: result.id,
              name: nextName,
              groupId: notebookGroupId,
              sortOrder: activeGroupNotebooks.length,
              themeKey: "themeKey" in result ? result.themeKey : draftNotebook.themeKey,
              groupName: notebookGroupName,
              pageIds: [result.pageId],
            },
          });
          setDraftNotebook(null);
          setEditingNotebookId(null);
          setDraftName("");
          setSelectedNotebookIds([result.id]);
          router.push(`/pages/${result.pageId}`);
          router.refresh();
        } finally {
          createNotebookInFlightRef.current = false;
        }
      });
      return;
    }

    setEditingNotebookId(null);
    setDraftName("");

    startTransition(async () => {
      updateNotebooks({
        type: "rename",
        notebookId: targetNotebookId,
        name: nextName,
      });
      await renameNotebookInlineAction(targetNotebookId, nextName);
    });
  }

  function submitGroupRename() {
    const nextName = draftGroupName.trim() || "مجموعه بدون عنوان";

    if (editingGroupId === "__new__") {
      setEditingGroupId(null);
      setDraftGroupName("");

      startTransition(async () => {
        const result = await createNotebookGroupInlineAction(
          nextName,
          getRandomThemeKey(`group-${nextName}`),
          getRandomThemeKey(`notebook-${nextName}`),
        );

        if (
          "id" in result &&
          result.id &&
          "notebookId" in result &&
          result.notebookId &&
          "pageId" in result &&
          result.pageId
        ) {
          updateGroups({
            type: "append",
            group: {
              id: result.id,
              name: nextName,
              notebookCount: 1,
              sortOrder: groupItems.filter((group) => group.systemKey !== TRASH_GROUP_KEY).length,
              themeKey: "themeKey" in result ? result.themeKey : null,
            },
          });
          updateNotebooks({
            type: "append",
            notebook: {
              id: result.notebookId,
              name: "زیر مجموعه بدون عنوان",
              groupId: result.id,
              sortOrder: 0,
              themeKey: "notebookThemeKey" in result ? result.notebookThemeKey : null,
              groupName: nextName,
              pageIds: [result.pageId],
            },
          });
          setManualGroupKey(result.id);
          setSelectedNotebookIds([result.notebookId]);
          router.push(`/pages/${result.pageId}`);
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
    });
  }

  function deleteNotebooks(notebookIds: string[], permanently = false) {
    const fallbackNotebookId =
      displayItems.find((item) => !notebookIds.includes(item.id))?.id ?? null;
    const shouldRedirect = activeNotebookId ? notebookIds.includes(activeNotebookId) : false;

    startTransition(async () => {
      updateNotebooks({ type: "remove-many", notebookIds });
      setSelectedNotebookIds([]);

      if (permanently) {
        await Promise.all(
          notebookIds.map((notebookId) =>
            deleteNotebookPermanentlyInlineAction(notebookId),
          ),
        );
      } else {
        await Promise.all(
          notebookIds.map((notebookId) =>
            archiveNotebookInlineAction(notebookId),
          ),
        );
      }

      if (shouldRedirect) {
        router.push(fallbackNotebookId ? `/notebooks/${fallbackNotebookId}` : "/");
      }
      router.refresh();
    });
  }

  function moveNotebooksToGroup(notebookIds: string[], groupId: string | null) {
    if (!groupId) {
      return;
    }

    const nextGroupName =
      groupItems.find((group) => group.id === groupId)?.name ?? null;

    setSelectedNotebookIds([]);
    setManualGroupKey(groupId);

    startTransition(async () => {
      updateNotebooks({
        type: "move-many",
        notebookIds,
        groupId,
        groupName: nextGroupName,
      });
      await assignNotebookGroupInlineAction(notebookIds, groupId);
    });
  }

  function deleteGroup(groupId: string) {
    startTransition(async () => {
      await deleteNotebookGroupInlineAction(groupId);
      router.refresh();
    });
  }

  function clearTrash() {
    const trashGroup = groupItems.find((group) => group.systemKey === TRASH_GROUP_KEY);

    if (!trashGroup) {
      return;
    }

    const trashNotebookIds = displayItems
      .filter((notebook) => notebook.groupId === trashGroup.id)
      .map((notebook) => notebook.id);

    setSelectedNotebookIds([]);

    startTransition(async () => {
      updateNotebooks({ type: "remove-many", notebookIds: trashNotebookIds });
      await emptyTrashInlineAction();
      router.push("/trash");
      router.refresh();
    });
  }

  function handleGroupDrop(targetGroupId: string) {
    if (!draggedGroupId || draggedGroupId === targetGroupId) {
      setDraggedGroupId(null);
      return;
    }

    const movableGroupIds = groupTabs
      .filter((group) => group.systemKey !== TRASH_GROUP_KEY)
      .map((group) => group.id);
    const nextGroupIds = reorderIds(movableGroupIds, draggedGroupId, targetGroupId);

    if (nextGroupIds.join(",") === movableGroupIds.join(",")) {
      setDraggedGroupId(null);
      return;
    }

    setDraggedGroupId(null);

    startTransition(async () => {
      updateGroups({ type: "reorder", groupIds: nextGroupIds });
      await reorderNotebookGroupsInlineAction(nextGroupIds);
      router.refresh();
    });
  }

  function handleNotebookDrop(targetNotebookId: string) {
    if (!activeGroupKey || !draggedNotebookId || draggedNotebookId === targetNotebookId) {
      setDraggedNotebookId(null);
      return;
    }

    const nextNotebookIds = reorderIds(
      activeGroupNotebooks.map((notebook) => notebook.id),
      draggedNotebookId,
      targetNotebookId,
    );

    if (
      nextNotebookIds.join(",") ===
      activeGroupNotebooks.map((notebook) => notebook.id).join(",")
    ) {
      setDraggedNotebookId(null);
      return;
    }

    setDraggedNotebookId(null);

    startTransition(async () => {
      updateNotebooks({
        type: "reorder",
        groupId: activeGroupKey,
        notebookIds: nextNotebookIds,
      });
      await reorderNotebooksInlineAction(activeGroupKey, nextNotebookIds);
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
          const theme = getNotebookTheme(notebook.id, notebook.themeKey);

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
              {notebook.name || "زیر مجموعه بدون عنوان"}
            </div>
          );
        })}
        {!isTrashGroup(activeGroupKey) && hasWritableGroup ? (
          <div className="flex h-6 w-9 items-center justify-center rounded-t-md border border-stone-300 bg-white text-stone-700">
            <Plus className="h-4 w-4" />
          </div>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {groupTabs.map((group) => {
          const isActive = activeGroupKey === group.id;
          const isEditing = editingGroupId === group.id;
          const pillTheme = getGroupPillTheme(group.themeKey);
          const isTrash = group.systemKey === TRASH_GROUP_KEY;

          return (
            <div
              key={group.id}
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
                          ...NOTEBOOK_THEMES.map((theme) => ({
                            id: `theme-group-${theme.key}`,
                            label: `رنگ مجموعه: ${theme.label}`,
                            onSelect: () => updateGroupTheme(group.id, theme.key),
                          })),
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
                draggedGroupId === group.id ? "cursor-grabbing opacity-70" : !isTrash ? "cursor-grab" : null,
              )}
              style={{
                borderColor: pillTheme.border,
                backgroundColor: isTrash ? "#ffe5ea" : pillTheme.bg,
                color: isTrash ? "#1f2937" : pillTheme.text,
                boxShadow: isActive
                  ? `0 0 0 1px rgba(255,255,255,0.96), 0 0 0 3px ${pillTheme.ring}, 0 8px 18px ${pillTheme.glow}`
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
                  onClick={() => setManualGroupKey(group.id)}
                  className={cn(
                    "inline-flex items-center gap-2",
                  )}
                >
                  {isTrash ? <Trash2 className="h-3.5 w-3.5" /> : null}
                  <span>{group.name}</span>
                  <span
                    className={cn(
                      "rounded-full px-1.5 py-0.5 text-[10px]",
                    )}
                    style={{
                      backgroundColor: isTrash
                        ? "rgba(255,255,255,0.72)"
                        : pillTheme.badgeBg,
                      color: isTrash ? "#1f2937" : pillTheme.badgeText,
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
              placeholder="مجموعه جدید"
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
            مجموعه جدید
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
                                ...NOTEBOOK_THEMES.map((theme) => ({
                                  id: `theme-notebook-${theme.key}`,
                                  label: `رنگ زیرمجموعه: ${theme.label}`,
                                  onSelect: () =>
                                    updateNotebookTheme(notebook.id, theme.key),
                                })),
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
                "inline-flex h-6 items-center rounded-t-md px-4 text-xs transition",
                isActive ? "translate-y-[1px]" : "hover:-translate-y-px",
                draggedNotebookId === notebook.id
                  ? "cursor-grabbing opacity-70"
                  : !isDeleted && !isSystemNotebook && !isTrashGroup(activeGroupKey)
                    ? "cursor-grab"
                    : null,
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
    </div>
  );
}
