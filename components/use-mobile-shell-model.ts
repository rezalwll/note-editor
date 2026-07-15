"use client";

import { useEffect, useMemo, useState } from "react";

import {
  getGroupRenamedEventName,
  getNotebookRenamedEventName,
  getPageTitleUpdatedEventName,
  type GroupRenamedDetail,
  type NotebookRenamedDetail,
  type PageTitleUpdatedDetail,
} from "@/lib/page-events";
import { getNotebookTheme } from "@/lib/notebook-theme";

export type MobileNotebook = {
  id: string;
  name: string;
  groupId: string | null;
  groupName: string | null;
  themeKey?: string | null;
  systemKey?: string | null;
  pages: Array<{
    id: string;
    title: string;
    updatedAt: Date;
    deletedAt: Date | null;
    originalNotebookId?: string | null;
  }>;
  deletedAt: Date | null;
};

export type MobileGroup = {
  id: string;
  name: string;
  notebookCount: number;
  themeKey?: string | null;
  sortOrder?: number;
  systemKey: string | null;
};

export type MobileGroupSection = MobileGroup & {
  notebooks: MobileNotebook[];
};

export type ActionSheetState =
  | { type: "group"; id: string }
  | { type: "notebook"; id: string }
  | { type: "page"; id: string }
  | null;

export const UNGROUPED_ID = "ungrouped";
export const TRASH_GROUP_KEY = "deleted-items";
const TRASH_PAGES_NOTEBOOK_KEY = "deleted-pages";

function getTrashItemCount(notebooks: MobileNotebook[]) {
  return notebooks.reduce(
    (count, notebook) =>
      count +
      (notebook.systemKey === TRASH_PAGES_NOTEBOOK_KEY
        ? notebook.pages.length
        : 1),
    0,
  );
}

type UseMobileShellModelOptions = {
  notebooks: MobileNotebook[];
  groups: MobileGroup[];
  createdGroups: MobileGroup[];
  pathname: string;
  selectedGroupId: string | null;
  selectedNotebookId: string | null;
  actionSheet: ActionSheetState;
};

export function useMobileShellModel({
  notebooks,
  groups,
  createdGroups,
  pathname,
  selectedGroupId,
  selectedNotebookId,
  actionSheet,
}: UseMobileShellModelOptions) {
  const [groupNameOverrides, setGroupNameOverrides] = useState<
    Record<string, string>
  >({});
  const [notebookNameOverrides, setNotebookNameOverrides] = useState<
    Record<string, string>
  >({});
  const [pageTitleOverrides, setPageTitleOverrides] = useState<
    Record<string, { title: string; updatedAt: string }>
  >({});

  useEffect(() => {
    const listener = (event: Event) => {
      const detail = (event as CustomEvent<PageTitleUpdatedDetail>).detail;
      if (!detail?.pageId) {
        return;
      }
      setPageTitleOverrides((current) => ({
        ...current,
        [detail.pageId]: { title: detail.title, updatedAt: detail.updatedAt },
      }));
    };

    window.addEventListener(getPageTitleUpdatedEventName(), listener);
    return () => window.removeEventListener(getPageTitleUpdatedEventName(), listener);
  }, []);

  useEffect(() => {
    const listener = (event: Event) => {
      const detail = (event as CustomEvent<NotebookRenamedDetail>).detail;
      if (!detail?.notebookId) {
        return;
      }
      setNotebookNameOverrides((current) => ({
        ...current,
        [detail.notebookId]: detail.name,
      }));
    };

    window.addEventListener(getNotebookRenamedEventName(), listener);
    return () => window.removeEventListener(getNotebookRenamedEventName(), listener);
  }, []);

  useEffect(() => {
    const listener = (event: Event) => {
      const detail = (event as CustomEvent<GroupRenamedDetail>).detail;
      if (!detail?.groupId) {
        return;
      }
      setGroupNameOverrides((current) => ({
        ...current,
        [detail.groupId]: detail.name,
      }));
    };

    window.addEventListener(getGroupRenamedEventName(), listener);
    return () => window.removeEventListener(getGroupRenamedEventName(), listener);
  }, []);

  const displayNotebooks = useMemo(
    () =>
      notebooks.map((notebook) => ({
        ...notebook,
        name: notebookNameOverrides[notebook.id] ?? notebook.name,
        groupName:
          notebook.groupId && groupNameOverrides[notebook.groupId]
            ? groupNameOverrides[notebook.groupId]
            : notebook.groupName,
        pages: notebook.pages.map((page) => {
          const override = pageTitleOverrides[page.id];
          return override
            ? {
                ...page,
                title: override.title,
                updatedAt: new Date(override.updatedAt),
              }
            : page;
        }),
      })),
    [groupNameOverrides, notebookNameOverrides, notebooks, pageTitleOverrides],
  );

  const routeNotebook = useMemo(() => {
    const notebookId = pathname.match(/^\/notebooks\/([^/]+)/)?.[1];
    if (notebookId) {
      return (
        displayNotebooks.find((notebook) => notebook.id === notebookId) ??
        displayNotebooks[0]
      );
    }

    const pageId = pathname.match(/^\/pages\/([^/]+)/)?.[1];
    if (pageId) {
      return (
        displayNotebooks.find((notebook) =>
          notebook.pages.some((page) => page.id === pageId),
        ) ?? displayNotebooks[0]
      );
    }

    return displayNotebooks[0];
  }, [displayNotebooks, pathname]);

  const mergedGroups = useMemo(
    () => [
      ...groups,
      ...createdGroups.filter(
        (createdGroup) => !groups.some((group) => group.id === createdGroup.id),
      ),
    ],
    [createdGroups, groups],
  );

  const groupedNotebooks = useMemo<MobileGroupSection[]>(
    () => [
      ...mergedGroups.map((group) => {
        const groupNotebooks = displayNotebooks.filter(
          (notebook) => notebook.groupId === group.id,
        );
        return {
          ...group,
          name: groupNameOverrides[group.id] ?? group.name,
          notebookCount:
            group.systemKey === TRASH_GROUP_KEY
              ? getTrashItemCount(groupNotebooks)
              : group.notebookCount,
          notebooks: groupNotebooks,
        };
      }),
      {
        id: UNGROUPED_ID,
        name: "بدون مجموعه",
        notebookCount: displayNotebooks.filter(
          (notebook) => notebook.groupId === null,
        ).length,
        systemKey: null,
        themeKey: null,
        sortOrder: 0,
        notebooks: displayNotebooks.filter(
          (notebook) => notebook.groupId === null,
        ),
      },
    ],
    [displayNotebooks, groupNameOverrides, mergedGroups],
  );

  const activeGroupId =
    selectedGroupId ??
    routeNotebook?.groupId ??
    groupedNotebooks.find(
      (group) =>
        group.id !== UNGROUPED_ID && group.systemKey !== TRASH_GROUP_KEY,
    )?.id ??
    groupedNotebooks.find((group) => group.id !== UNGROUPED_ID)?.id ??
    null;
  const activeGroup =
    groupedNotebooks.find((group) => group.id === activeGroupId) ?? null;
  const activeGroupNotebooks = activeGroup?.notebooks ?? [];
  const explicitNotebook =
    displayNotebooks.find((notebook) => notebook.id === selectedNotebookId) ??
    null;
  const activeNotebook =
    explicitNotebook?.groupId === activeGroupId
      ? explicitNotebook
      : routeNotebook?.groupId === activeGroupId
        ? routeNotebook
        : activeGroupNotebooks[0] ?? null;
  const activeTheme = activeNotebook
    ? getNotebookTheme(activeNotebook.id, activeNotebook.themeKey)
    : getNotebookTheme(
        activeGroupNotebooks[0]?.id ?? "default",
        activeGroupNotebooks[0]?.themeKey,
      );

  return {
    actionGroup:
      actionSheet?.type === "group"
        ? groupedNotebooks.find((group) => group.id === actionSheet.id) ?? null
        : null,
    actionNotebook:
      actionSheet?.type === "notebook"
        ? displayNotebooks.find((notebook) => notebook.id === actionSheet.id) ??
          null
        : null,
    actionPage:
      actionSheet?.type === "page"
        ? displayNotebooks
            .flatMap((notebook) => notebook.pages)
            .find((page) => page.id === actionSheet.id) ?? null
        : null,
    activeGroup,
    activeGroupId,
    activeGroupNotebooks,
    activeNotebook,
    activeTheme,
    displayNotebooks,
    groupedNotebooks,
    mergedGroups,
    routeNotebook,
  };
}
