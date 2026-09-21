"use client";

import {
  useEffect,
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
  createNotebookInlineAction,
  deleteNotebookPermanentlyInlineAction,
  reorderNotebooksInlineAction,
  renameNotebookInlineAction,
  updateNotebookThemeInlineAction,
} from "@/app/actions";
import { SectionTabsView } from "@/components/section-tabs-view";
import { useSectionGroupActions } from "@/components/use-section-group-actions";
import { useSectionTabsOverflow } from "@/components/use-section-tabs-overflow";
import { useWorkspaceHistory } from "@/components/workspace-history-provider";
import {
  getTrashItemCount,
  reduceGroups,
  reduceNotebooks,
  reorderIds,
  TRASH_GROUP_KEY,
  type NotebookGroupTab,
  type NotebookTab,
} from "@/components/section-tabs-model";
import {
  getRandomThemeKey,
  type ThemeKey,
} from "@/lib/notebook-theme";

type SectionTabsProps = {
  groups: NotebookGroupTab[];
  notebooks: NotebookTab[];
};

export function SectionTabs({ groups, notebooks }: SectionTabsProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { record, clear } = useWorkspaceHistory();
  const [selectedNotebookIds, setSelectedNotebookIds] = useState<string[]>([]);
  const [editingNotebookId, setEditingNotebookId] = useState<string | null>(null);
  const [draftNotebook, setDraftNotebook] = useState<NotebookTab | null>(null);
  const [draftName, setDraftName] = useState("");
  const [manualGroupKey, setManualGroupKey] = useState<string | null>(null);
  const [isOverflowOpen, setIsOverflowOpen] = useState(false);
  const [draggedNotebookId, setDraggedNotebookId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const notebookInputRef = useRef<HTMLInputElement | null>(null);
  const createNotebookInFlightRef = useRef(false);
  const [items, updateNotebooks] = useOptimistic(notebooks, reduceNotebooks);
  const displayItems = useMemo(
    () =>
      draftNotebook && !items.some((item) => item.id === draftNotebook.id)
        ? [...items, draftNotebook]
        : items,
    [draftNotebook, items],
  );
  const [groupItems, updateGroups] = useOptimistic(groups, reduceGroups);

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

  const activeGroupNotebooks = useMemo(
    () =>
      displayItems
        .filter((notebook) => notebook.groupId === activeGroupKey)
        .sort(
          (left, right) => (left.sortOrder ?? 0) - (right.sortOrder ?? 0),
        ),
    [activeGroupKey, displayItems],
  );
  const groupTabs = useMemo(
    () =>
      groupItems
        .map((group) => {
          const groupNotebooks = displayItems.filter((item) => item.groupId === group.id);

          return {
            id: group.id,
            name: group.name,
            notebookCount:
              group.systemKey === TRASH_GROUP_KEY
                ? getTrashItemCount(groupNotebooks)
                : groupNotebooks.length,
            sortOrder: group.sortOrder,
            themeKey: group.themeKey,
            systemKey: group.systemKey ?? null,
          };
        })
        .sort(
          (left, right) => (left.sortOrder ?? 0) - (right.sortOrder ?? 0),
        ),
    [displayItems, groupItems],
  );
  const {
    beginCreateGroup,
    beginRenameGroup,
    cancelGroupEdit,
    clearTrash,
    deleteGroup,
    draftGroupName,
    draggedGroupId,
    editingGroupId,
    groupInputRef,
    handleGroupDrop,
    setDraftGroupName,
    setDraggedGroupId,
    submitGroupRename,
    updateGroupTheme,
  } = useSectionGroupActions({
    displayItems,
    groupItems,
    groupTabs,
    items,
    setManualGroupKey,
    setSelectedNotebookIds,
    startTransition,
    updateGroups,
    updateNotebooks,
  });
  const { measureRef, overflowNotebooks, visibleNotebooks } =
    useSectionTabsOverflow({
      activeGroupNotebooks,
      activeNotebookId,
      editingNotebookId,
    });

  const hasWritableGroup = useMemo(
    () => groupItems.some((group) => group.systemKey !== TRASH_GROUP_KEY),
    [groupItems],
  );

  function isTrashGroup(groupId: string | null | undefined) {
    return groupItems.some(
      (group) => group.id === groupId && group.systemKey === TRASH_GROUP_KEY,
    );
  }

  function updateNotebookTheme(notebookId: string, themeKey: ThemeKey) {
    const previousThemeKey = items.find((item) => item.id === notebookId)?.themeKey;
    if (!previousThemeKey || previousThemeKey === themeKey) return;
    startTransition(async () => {
      updateNotebooks({ type: "theme", notebookId, themeKey });
      await updateNotebookThemeInlineAction(notebookId, themeKey);
      record({
        label: "تغییر رنگ زیرمجموعه",
        undo: () => updateNotebookThemeInlineAction(notebookId, previousThemeKey),
        redo: () => updateNotebookThemeInlineAction(notebookId, themeKey),
      });
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


  function beginRenameNotebook(notebook: NotebookTab) {
    setSelectedNotebookIds([notebook.id]);
    setEditingNotebookId(notebook.id);
    setDraftName(notebook.name);
  }

  function cancelNotebookEdit() {
    if (editingNotebookId && draftNotebook?.id === editingNotebookId) {
      setDraftNotebook(null);
      setSelectedNotebookIds([]);
    }

    setDraftName("");
    setEditingNotebookId(null);
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
    const previousName = items.find((item) => item.id === targetNotebookId)?.name;

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
          record({
            label: "ایجاد زیرمجموعه",
            undo: () => archiveNotebookInlineAction(result.id),
            redo: () => assignNotebookGroupInlineAction([result.id], notebookGroupId),
          });
          router.push(`/pages/${result.pageId}`);
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
      if (previousName && previousName !== nextName) {
        record({
          label: "تغییر نام زیرمجموعه",
          undo: () => renameNotebookInlineAction(targetNotebookId, previousName),
          redo: () => renameNotebookInlineAction(targetNotebookId, nextName),
        });
      }
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
        clear();
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
        const previousGroups = new Map<string, string[]>();
        for (const notebookId of notebookIds) {
          const previousGroupId = items.find((item) => item.id === notebookId)?.groupId;
          if (previousGroupId) {
            previousGroups.set(previousGroupId, [
              ...(previousGroups.get(previousGroupId) ?? []),
              notebookId,
            ]);
          }
        }
        record({
          label: notebookIds.length > 1 ? "حذف زیرمجموعه‌ها" : "حذف زیرمجموعه",
          undo: async () => {
            for (const [previousGroupId, ids] of previousGroups) {
              await assignNotebookGroupInlineAction(ids, previousGroupId);
            }
          },
          redo: async () => {
            await Promise.all(notebookIds.map((id) => archiveNotebookInlineAction(id)));
          },
        });
      }

      if (shouldRedirect) {
        router.push(fallbackNotebookId ? `/notebooks/${fallbackNotebookId}` : "/");
      } else {
        router.refresh();
      }
    });
  }

  function moveNotebooksToGroup(notebookIds: string[], groupId: string | null) {
    if (!groupId) {
      return;
    }

    const nextGroupName =
      groupItems.find((group) => group.id === groupId)?.name ?? null;
    const previousGroups = new Map<string, string[]>();
    for (const notebookId of notebookIds) {
      const previousGroupId = items.find((item) => item.id === notebookId)?.groupId;
      if (previousGroupId) {
        previousGroups.set(previousGroupId, [
          ...(previousGroups.get(previousGroupId) ?? []),
          notebookId,
        ]);
      }
    }

    setSelectedNotebookIds([]);
    setManualGroupKey(groupId);

    startTransition(async () => {
      updateNotebooks({
        type: "move-many",
        notebookIds,
        groupId,
        groupName: nextGroupName,
      });
      const result = await assignNotebookGroupInlineAction(notebookIds, groupId);
      if ("error" in result) {
        setManualGroupKey(null);
        router.refresh();
        return;
      }
      record({
        label: "انتقال زیرمجموعه",
        undo: async () => {
          for (const [previousGroupId, ids] of previousGroups) {
            await assignNotebookGroupInlineAction(ids, previousGroupId);
          }
        },
        redo: () => assignNotebookGroupInlineAction(notebookIds, groupId),
      });
      router.refresh();
    });
  }

  function handleNotebookDrop(targetNotebookId: string) {
    if (!activeGroupKey || !draggedNotebookId || draggedNotebookId === targetNotebookId) {
      setDraggedNotebookId(null);
      return;
    }

    const previousNotebookIds = activeGroupNotebooks.map((notebook) => notebook.id);
    const nextNotebookIds = reorderIds(
      previousNotebookIds,
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
      record({
        label: "مرتب‌سازی زیرمجموعه‌ها",
        undo: () => reorderNotebooksInlineAction(activeGroupKey, previousNotebookIds),
        redo: () => reorderNotebooksInlineAction(activeGroupKey, nextNotebookIds),
      });
      router.refresh();
    });
  }

  return (
    <SectionTabsView
      activeGroupKey={activeGroupKey}
      activeGroupNotebooks={activeGroupNotebooks}
      activeNotebookId={activeNotebookId}
      beginCreateGroup={beginCreateGroup}
      beginCreateNotebook={beginCreateNotebook}
      beginRenameGroup={beginRenameGroup}
      beginRenameNotebook={beginRenameNotebook}
      cancelGroupEdit={cancelGroupEdit}
      cancelNotebookEdit={cancelNotebookEdit}
      clearTrash={clearTrash}
      deleteGroup={deleteGroup}
      deleteNotebooks={deleteNotebooks}
      draftGroupName={draftGroupName}
      draftName={draftName}
      draftNotebook={draftNotebook}
      draggedGroupId={draggedGroupId}
      draggedNotebookId={draggedNotebookId}
      editingGroupId={editingGroupId}
      editingNotebookId={editingNotebookId}
      groupInputRef={groupInputRef}
      groupItems={groupItems}
      groupTabs={groupTabs}
      handleGroupDrop={handleGroupDrop}
      handleNotebookDrop={handleNotebookDrop}
      hasWritableGroup={hasWritableGroup}
      isOverflowOpen={isOverflowOpen}
      isPending={isPending}
      isTrashGroup={isTrashGroup}
      measureRef={measureRef}
      moveNotebooksToGroup={moveNotebooksToGroup}
      notebookInputRef={notebookInputRef}
      overflowNotebooks={overflowNotebooks}
      selectedNotebookIds={selectedNotebookIds}
      setDraftGroupName={setDraftGroupName}
      setDraftName={setDraftName}
      setDraggedGroupId={setDraggedGroupId}
      setDraggedNotebookId={setDraggedNotebookId}
      setIsOverflowOpen={setIsOverflowOpen}
      setManualGroupKey={setManualGroupKey}
      setSelectedNotebookIds={setSelectedNotebookIds}
      submitGroupRename={submitGroupRename}
      submitNotebookRename={submitNotebookRename}
      toggleNotebookSelection={toggleNotebookSelection}
      selectSingleNotebook={selectSingleNotebook}
      updateGroupTheme={updateGroupTheme}
      updateNotebookTheme={updateNotebookTheme}
      visibleNotebooks={visibleNotebooks}
    />
  );
}
