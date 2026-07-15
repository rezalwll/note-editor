import type { ThemeKey } from "@/lib/notebook-theme";

export type NotebookTab = {
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

export type NotebookGroupTab = {
  id: string;
  name: string;
  notebookCount: number;
  sortOrder?: number;
  themeKey?: string | null;
  systemKey?: string | null;
};

export type NotebookOptimisticAction =
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
    };

export type GroupOptimisticAction =
  | { type: "append"; group: NotebookGroupTab }
  | { type: "rename"; groupId: string; name: string }
  | { type: "theme"; groupId: string; themeKey: ThemeKey }
  | { type: "reorder"; groupIds: string[] }
  | { type: "delete"; groupId: string };

export const TRASH_GROUP_KEY = "deleted-items";
export const TRASH_PAGES_NOTEBOOK_KEY = "deleted-pages";

export function reorderIds(
  ids: string[],
  draggedId: string,
  targetId: string,
) {
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

export function getTrashItemCount(notebooks: NotebookTab[]) {
  return notebooks.reduce(
    (count, notebook) =>
      count +
      (notebook.systemKey === TRASH_PAGES_NOTEBOOK_KEY
        ? (notebook.pageIds?.length ?? 0)
        : 1),
    0,
  );
}

export function reduceNotebooks(
  current: NotebookTab[],
  action: NotebookOptimisticAction,
) {
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
    case "move-many": {
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
                targetBaseOrder + (selectedOrder.get(notebook.id) ?? 0),
            }
          : notebook,
      );
    }
  }
}

export function reduceGroups(
  current: NotebookGroupTab[],
  action: GroupOptimisticAction,
) {
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
      const positions = new Map(action.groupIds.map((id, index) => [id, index]));
      return current.map((group) =>
        positions.has(group.id)
          ? { ...group, sortOrder: positions.get(group.id) ?? group.sortOrder }
          : group,
      );
    }
    case "delete":
      return current.filter((group) => group.id !== action.groupId);
  }
}
