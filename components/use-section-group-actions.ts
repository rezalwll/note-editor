"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import {
  createNotebookGroupInlineAction,
  deleteNotebookGroupInlineAction,
  emptyTrashInlineAction,
  renameNotebookGroupInlineAction,
  reorderNotebookGroupsInlineAction,
  restoreNotebookGroupInlineAction,
  updateNotebookGroupThemeInlineAction,
} from "@/app/actions";
import {
  reorderIds,
  TRASH_GROUP_KEY,
  type GroupOptimisticAction,
  type NotebookGroupTab,
  type NotebookOptimisticAction,
  type NotebookTab,
} from "@/components/section-tabs-model";
import { useWorkspaceHistory } from "@/components/workspace-history-provider";
import { getRandomThemeKey, type ThemeKey } from "@/lib/notebook-theme";

type StartTransition = (scope: () => void | Promise<void>) => void;

type UseSectionGroupActionsOptions = {
  displayItems: NotebookTab[];
  groupItems: NotebookGroupTab[];
  groupTabs: NotebookGroupTab[];
  items: NotebookTab[];
  setManualGroupKey: (groupId: string | null) => void;
  setSelectedNotebookIds: (notebookIds: string[]) => void;
  startTransition: StartTransition;
  updateGroups: (action: GroupOptimisticAction) => void;
  updateNotebooks: (action: NotebookOptimisticAction) => void;
};

/** Group editing, lifecycle, theming, trash, and drag ordering operations. */
export function useSectionGroupActions({
  displayItems,
  groupItems,
  groupTabs,
  items,
  setManualGroupKey,
  setSelectedNotebookIds,
  startTransition,
  updateGroups,
  updateNotebooks,
}: UseSectionGroupActionsOptions) {
  const router = useRouter();
  const { clear, record } = useWorkspaceHistory();
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [draftGroupName, setDraftGroupName] = useState("");
  const [draggedGroupId, setDraggedGroupId] = useState<string | null>(null);
  const groupInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!editingGroupId) {
      return;
    }

    requestAnimationFrame(() => {
      const input = groupInputRef.current;
      if (!input) {
        return;
      }
      input.focus();
      const caretPosition = input.value.length;
      input.setSelectionRange(caretPosition, caretPosition);
    });
  }, [editingGroupId]);

  function updateGroupTheme(groupId: string, themeKey: ThemeKey) {
    const previousThemeKey = groupItems.find(
      (group) => group.id === groupId,
    )?.themeKey;
    if (!previousThemeKey || previousThemeKey === themeKey) return;

    startTransition(async () => {
      updateGroups({ type: "theme", groupId, themeKey });
      await updateNotebookGroupThemeInlineAction(groupId, themeKey);
      record({
        label: "تغییر رنگ مجموعه",
        undo: () =>
          updateNotebookGroupThemeInlineAction(groupId, previousThemeKey),
        redo: () => updateNotebookGroupThemeInlineAction(groupId, themeKey),
      });
      router.refresh();
    });
  }

  function beginCreateGroup() {
    setEditingGroupId("__new__");
    setDraftGroupName("");
  }

  function beginRenameGroup(groupId: string, groupName: string) {
    setEditingGroupId(groupId);
    setDraftGroupName(groupName);
  }

  function cancelGroupEdit() {
    setDraftGroupName("");
    setEditingGroupId(null);
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
          const groupSortOrder = groupItems.filter(
            (group) => group.systemKey !== TRASH_GROUP_KEY,
          ).length;
          updateGroups({
            type: "append",
            group: {
              id: result.id,
              name: nextName,
              notebookCount: 1,
              sortOrder: groupSortOrder,
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
              themeKey:
                "notebookThemeKey" in result
                  ? result.notebookThemeKey
                  : null,
              groupName: nextName,
              pageIds: [result.pageId],
            },
          });
          setManualGroupKey(result.id);
          setSelectedNotebookIds([result.notebookId]);
          record({
            label: "ایجاد مجموعه",
            undo: () => deleteNotebookGroupInlineAction(result.id),
            redo: () =>
              restoreNotebookGroupInlineAction({
                id: result.id,
                name: nextName,
                themeKey: "themeKey" in result ? result.themeKey : null,
                sortOrder: groupSortOrder,
                notebookIds: [result.notebookId],
              }),
          });
          router.push(`/pages/${result.pageId}`);
        }
      });
      return;
    }

    if (!editingGroupId) {
      return;
    }

    const targetGroupId = editingGroupId;
    const previousName = groupItems.find(
      (group) => group.id === targetGroupId,
    )?.name;
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
      if (previousName && previousName !== nextName) {
        record({
          label: "تغییر نام مجموعه",
          undo: () =>
            renameNotebookGroupInlineAction(targetGroupId, previousName),
          redo: () => renameNotebookGroupInlineAction(targetGroupId, nextName),
        });
      }
    });
  }

  function deleteGroup(groupId: string) {
    const group = groupItems.find((item) => item.id === groupId);
    if (!group) return;

    startTransition(async () => {
      const result = await deleteNotebookGroupInlineAction(groupId);
      if ("notebookIds" in result && result.notebookIds) {
        const snapshot = {
          id: group.id,
          name: group.name,
          themeKey: group.themeKey,
          sortOrder: group.sortOrder ?? 0,
          notebookIds: result.notebookIds,
          discardPlaceholder: result.wasEmpty,
        };
        record({
          label: "حذف مجموعه",
          undo: () => restoreNotebookGroupInlineAction(snapshot),
          redo: async () => {
            const deleted = await deleteNotebookGroupInlineAction(groupId);
            if ("notebookIds" in deleted && deleted.notebookIds) {
              snapshot.notebookIds = deleted.notebookIds;
              snapshot.discardPlaceholder = deleted.wasEmpty;
            }
          },
        });
      }
      router.refresh();
    });
  }

  function clearTrash() {
    const trashGroup = groupItems.find(
      (group) => group.systemKey === TRASH_GROUP_KEY,
    );
    if (!trashGroup) {
      return;
    }

    const trashNotebookIds = displayItems
      .filter((notebook) => notebook.groupId === trashGroup.id)
      .map((notebook) => notebook.id);
    setSelectedNotebookIds([]);

    startTransition(async () => {
      clear();
      updateNotebooks({ type: "remove-many", notebookIds: trashNotebookIds });
      await emptyTrashInlineAction();
      router.push("/trash");
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
    const nextGroupIds = reorderIds(
      movableGroupIds,
      draggedGroupId,
      targetGroupId,
    );
    if (nextGroupIds.join(",") === movableGroupIds.join(",")) {
      setDraggedGroupId(null);
      return;
    }

    setDraggedGroupId(null);
    startTransition(async () => {
      updateGroups({ type: "reorder", groupIds: nextGroupIds });
      await reorderNotebookGroupsInlineAction(nextGroupIds);
      record({
        label: "مرتب‌سازی مجموعه‌ها",
        undo: () => reorderNotebookGroupsInlineAction(movableGroupIds),
        redo: () => reorderNotebookGroupsInlineAction(nextGroupIds),
      });
      router.refresh();
    });
  }

  return {
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
  };
}
