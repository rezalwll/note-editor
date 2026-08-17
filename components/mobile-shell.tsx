"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";

import {
  archiveNotebookInlineAction,
  assignNotebookGroupInlineAction,
  archivePageInlineAction,
  createNotebookInlineAction,
  createNotebookGroupInlineAction,
  createPageInlineAction,
  deleteNotebookGroupInlineAction,
  deleteNotebookPermanentlyInlineAction,
  deletePagePermanentlyInlineAction,
  renameNotebookGroupInlineAction,
  renameNotebookInlineAction,
  restoreNotebookGroupInlineAction,
  restorePageInlineAction,
} from "@/app/actions";
import { MobileShellView } from "@/components/mobile-shell-view";
import type {
  InstallPromptEvent,
  MobileCurrentUser,
} from "@/components/mobile-shell-types";
import {
  TRASH_GROUP_KEY,
  useMobileShellModel,
  type ActionSheetState,
  type MobileGroup,
  type MobileGroupSection,
  type MobileNotebook,
} from "@/components/use-mobile-shell-model";
import { useWorkspaceHistory } from "@/components/workspace-history-provider";
import {
  dispatchGroupRenamed,
  dispatchNotebookRenamed,
} from "@/lib/page-events";
import { getRandomThemeKey } from "@/lib/notebook-theme";
import { performSafeLogout } from "@/lib/safe-logout";

type MobileShellProps = {
  notebooks: MobileNotebook[];
  groups: MobileGroup[];
  currentUser: MobileCurrentUser;
};


export function MobileShell({ notebooks, groups, currentUser }: MobileShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { record, clear } = useWorkspaceHistory();
  const [sectionsOpen, setSectionsOpen] = useState(false);
  const [pagesOpen, setPagesOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [draftTitle, setDraftTitle] = useState("");
  const [isCreatingGroup, setIsCreatingGroup] = useState(false);
  const [creatingNotebookGroupId, setCreatingNotebookGroupId] = useState<
    string | null
  >(null);
  const [draftGroupName, setDraftGroupName] = useState("");
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [editingNotebookId, setEditingNotebookId] = useState<string | null>(null);
  const [draftNotebookName, setDraftNotebookName] = useState("");
  const [createdGroups, setCreatedGroups] = useState<MobileGroup[]>([]);
  const [expandedGroupIds, setExpandedGroupIds] = useState<string[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [selectedNotebookId, setSelectedNotebookId] = useState<string | null>(null);
  const [actionSheet, setActionSheet] = useState<ActionSheetState>(null);
  const [isPending, startTransition] = useTransition();
  const [installEvent, setInstallEvent] = useState<InstallPromptEvent | null>(null);
  const [profilePanelPosition, setProfilePanelPosition] = useState({ top: 0, left: 0 });
  const inputRef = useRef<HTMLInputElement | null>(null);
  const groupInputRef = useRef<HTMLInputElement | null>(null);
  const notebookInputRef = useRef<HTMLInputElement | null>(null);
  const profileMenuRef = useRef<HTMLDivElement | null>(null);
  const profileTriggerRef = useRef<HTMLButtonElement | null>(null);

  async function logoutAndClearClientData() {
    await performSafeLogout(currentUser.id);
  }

  const activePageId = pathname.match(/^\/pages\/([^/]+)/)?.[1] ?? null;
  const {
    actionGroup,
    actionNotebook,
    actionPage,
    activeGroup,
    activeGroupId,
    activeGroupNotebooks,
    activeNotebook,
    activeTheme,
    displayNotebooks,
    groupedNotebooks,
    mergedGroups,
    routeNotebook,
  } = useMobileShellModel({
    notebooks,
    groups,
    createdGroups,
    pathname,
    selectedGroupId,
    selectedNotebookId,
    actionSheet,
  });

  useEffect(() => {
    if (isCreating) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [isCreating]);

  useEffect(() => {
    if (isCreatingGroup) {
      groupInputRef.current?.focus();
      groupInputRef.current?.select();
    }
  }, [isCreatingGroup]);

  useEffect(() => {
    if (editingGroupId) {
      groupInputRef.current?.focus();
      groupInputRef.current?.select();
    }
  }, [editingGroupId]);

  useEffect(() => {
    if (editingNotebookId || creatingNotebookGroupId) {
      notebookInputRef.current?.focus();
      notebookInputRef.current?.select();
    }
  }, [creatingNotebookGroupId, editingNotebookId]);


  useEffect(() => {
    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallEvent(event as InstallPromptEvent);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    return () =>
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
  }, []);

  useEffect(() => {
    if (!profileOpen) {
      return;
    }

    const updatePanelPosition = () => {
      const rect = profileTriggerRef.current!.getBoundingClientRect();
      const panelWidth = 176;

      setProfilePanelPosition({
        top: rect.bottom + 10,
        left: Math.min(
          Math.max(12, rect.right - panelWidth),
          window.innerWidth - panelWidth - 12,
        ),
      });
    };

    updatePanelPosition();

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;

      if (profileMenuRef.current?.contains(target)) {
        return;
      }

      setProfileOpen(false);
    };

    window.addEventListener("resize", updatePanelPosition);
    window.addEventListener("scroll", updatePanelPosition, true);
    window.addEventListener("pointerdown", handlePointerDown);
    return () => {
      window.removeEventListener("resize", updatePanelPosition);
      window.removeEventListener("scroll", updatePanelPosition, true);
      window.removeEventListener("pointerdown", handlePointerDown);
    };
  }, [profileOpen]);

  function closeAll() {
    setSectionsOpen(false);
    setPagesOpen(false);
    setProfileOpen(false);
    setActionSheet(null);
  }

  function closeActionSheet() {
    setActionSheet(null);
  }

  function submitCreate() {
    const nextTitle = draftTitle.trim() || "صفحه بدون عنوان";

    startTransition(async () => {
      const result = await createPageInlineAction(activeNotebook!.id, nextTitle);

      if ("id" in result && result.id) {
        const pageId = result.id;
        record({
          label: "ایجاد صفحه",
          undo: () => archivePageInlineAction(pageId),
          redo: () => restorePageInlineAction(pageId),
        });
        setDraftTitle("");
        setIsCreating(false);
        setPagesOpen(false);
        router.push(`/pages/${result.id}`);
      }
    });
  }

  function beginRenameGroup(group: MobileGroupSection) {
    setDraftGroupName(group.name);
    setEditingGroupId(group.id);
    closeActionSheet();
  }

  function submitRenameGroup() {
    const nextName = draftGroupName.trim() || "مجموعه بدون عنوان";
    const targetGroupId = editingGroupId!;
    const previousName = groupedNotebooks.find((group) => group.id === targetGroupId)?.name;

    setEditingGroupId(null);
    setDraftGroupName("");

    startTransition(async () => {
      await renameNotebookGroupInlineAction(targetGroupId, nextName);
      if (previousName && previousName !== nextName) {
        record({
          label: "تغییر نام مجموعه",
          undo: () => renameNotebookGroupInlineAction(targetGroupId, previousName),
          redo: () => renameNotebookGroupInlineAction(targetGroupId, nextName),
        });
      }
      dispatchGroupRenamed({ groupId: targetGroupId, name: nextName });
      router.refresh();
    });
  }

  function beginRenameNotebook(notebook: MobileNotebook) {
    setCreatingNotebookGroupId(null);
    setDraftNotebookName(notebook.name);
    setEditingNotebookId(notebook.id);
    closeActionSheet();
  }

  function beginCreateNotebook(groupId: string) {
    setEditingNotebookId(null);
    setDraftNotebookName("");
    setCreatingNotebookGroupId(groupId);
    setExpandedGroupIds((current) =>
      current.includes(groupId) ? current : [...current, groupId],
    );
  }

  function cancelCreateNotebook() {
    setCreatingNotebookGroupId(null);
    setDraftNotebookName("");
  }

  function submitCreateNotebook() {
    if (!creatingNotebookGroupId) {
      return;
    }

    const targetGroupId = creatingNotebookGroupId;
    const nextName = draftNotebookName.trim() || "زیر مجموعه جدید";

    setCreatingNotebookGroupId(null);
    setDraftNotebookName("");

    startTransition(async () => {
      const result = await createNotebookInlineAction(
        nextName,
        targetGroupId,
        getRandomThemeKey(`notebook-${targetGroupId}-${nextName}`),
      );

      if (
        !("id" in result) ||
        !result.id ||
        !("pageId" in result) ||
        !result.pageId
      ) {
        return;
      }

      const notebookId = result.id;
      record({
        label: "ایجاد زیر مجموعه",
        undo: () => archiveNotebookInlineAction(notebookId),
        redo: () =>
          assignNotebookGroupInlineAction([notebookId], targetGroupId),
      });
      setSelectedGroupId(targetGroupId);
      setSelectedNotebookId(notebookId);
      closeAll();
      router.push(`/pages/${result.pageId}`);
    });
  }

  function submitRenameNotebook() {
    const nextName = draftNotebookName.trim() || "زیر مجموعه بدون عنوان";
    const targetNotebookId = editingNotebookId!;
    const previousName = displayNotebooks.find(
      (notebook) => notebook.id === targetNotebookId,
    )?.name;

    setEditingNotebookId(null);
    setDraftNotebookName("");

    startTransition(async () => {
      await renameNotebookInlineAction(targetNotebookId, nextName);
      if (previousName && previousName !== nextName) {
        record({
          label: "تغییر نام زیرمجموعه",
          undo: () => renameNotebookInlineAction(targetNotebookId, previousName),
          redo: () => renameNotebookInlineAction(targetNotebookId, nextName),
        });
      }
      dispatchNotebookRenamed({ notebookId: targetNotebookId, name: nextName });
      router.refresh();
    });
  }

  function toggleGroupSelection(groupId: string) {
    const targetGroup = groupedNotebooks.find((group) => group.id === groupId);
    const nextNotebook =
      activeNotebook &&
      activeNotebook.groupId === groupId
        ? activeNotebook
        : targetGroup?.notebooks[0] ?? null;
    const shouldExpand = !expandedGroupIds.includes(groupId);

    setSelectedGroupId(groupId);
    setSelectedNotebookId(shouldExpand ? nextNotebook?.id ?? null : selectedNotebookId);
    setExpandedGroupIds((current) =>
      current.includes(groupId)
        ? current.filter((id) => id !== groupId)
        : [...current, groupId],
    );
  }

  function selectNotebook(notebook: MobileNotebook) {
    setSelectedGroupId(notebook.groupId);
    setSelectedNotebookId(notebook.id);
    closeAll();
    router.push(`/notebooks/${notebook.id}`);
  }

  function submitCreateGroup() {
    const nextName = draftGroupName.trim() || "مجموعه جدید";

    startTransition(async () => {
      const result = await createNotebookGroupInlineAction(
        nextName,
        getRandomThemeKey(`group-${nextName}`),
        getRandomThemeKey(`notebook-${nextName}`),
      );

      if (
        !("id" in result) ||
        !result.id ||
        !("notebookId" in result) ||
        !result.notebookId ||
        !("pageId" in result) ||
        !result.pageId
      ) {
        return;
      }

      setCreatedGroups((current) => [
        ...current,
        {
          id: result.id,
          name: nextName,
          notebookCount: 1,
          themeKey: "themeKey" in result ? result.themeKey : null,
          systemKey: null,
        },
      ]);
      setExpandedGroupIds((current) => [...current, result.id]);
      setSelectedGroupId(result.id);
      setSelectedNotebookId(result.notebookId);
      setDraftGroupName("");
      setIsCreatingGroup(false);
      record({
        label: "ایجاد مجموعه",
        undo: () => deleteNotebookGroupInlineAction(result.id),
        redo: () =>
          restoreNotebookGroupInlineAction({
            id: result.id,
            name: nextName,
            themeKey: "themeKey" in result ? result.themeKey : null,
            sortOrder: mergedGroups.filter((group) => group.systemKey !== TRASH_GROUP_KEY).length,
            notebookIds: [result.notebookId],
          }),
      });
      closeAll();
      router.push(`/pages/${result.pageId}`);
    });
  }

  function deleteGroup(group: MobileGroupSection) {
    const groupId = group.id;
    closeActionSheet();

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
      if (activeGroupId === groupId) {
        setSelectedNotebookId(null);
      }
      router.refresh();
    });
  }

  function deleteNotebook(notebook: MobileNotebook) {
    closeActionSheet();

    startTransition(async () => {
      if (notebook.deletedAt) {
        clear();
        await deleteNotebookPermanentlyInlineAction(notebook.id);
      } else {
        await archiveNotebookInlineAction(notebook.id);
        if (notebook.groupId) {
          record({
            label: "حذف زیرمجموعه",
            undo: () => assignNotebookGroupInlineAction([notebook.id], notebook.groupId!),
            redo: () => archiveNotebookInlineAction(notebook.id),
          });
        }
      }

      if (routeNotebook?.id === notebook.id || activePageId) {
        router.push("/workspace");
      } else {
        router.refresh();
      }

      if (selectedNotebookId === notebook.id) {
        setSelectedNotebookId(null);
      }
    });
  }

  function archivePage(pageId: string) {
    closeActionSheet();

    startTransition(async () => {
      const result = await archivePageInlineAction(pageId);
      record({
        label: "حذف صفحه",
        undo: () => restorePageInlineAction(pageId),
        redo: () => archivePageInlineAction(pageId),
      });
      if ("notebookId" in result && result.notebookId && activePageId === pageId) {
        router.push(`/notebooks/${result.notebookId}`);
      } else {
        router.refresh();
      }
    });
  }

  function restorePage(pageId: string) {
    closeActionSheet();

    startTransition(async () => {
      await restorePageInlineAction(pageId);
      record({
        label: "بازیابی صفحه",
        undo: () => archivePageInlineAction(pageId),
        redo: () => restorePageInlineAction(pageId),
      });
      if (activePageId === pageId) {
        router.push(`/pages/${pageId}`);
      } else {
        router.refresh();
      }
    });
  }

  function deletePagePermanently(pageId: string) {
    closeActionSheet();

    startTransition(async () => {
      clear();
      await deletePagePermanentlyInlineAction(pageId);
      if (activePageId === pageId) {
        router.push(`/notebooks/${activeNotebook!.id}`);
      } else {
        router.refresh();
      }
    });
  }

  async function handleInstall(event: InstallPromptEvent) {
    await event.prompt();
    setInstallEvent(null);
  }

  return (
    <MobileShellView
      actionGroup={actionGroup}
      actionNotebook={actionNotebook}
      actionPage={actionPage}
      actionSheet={actionSheet}
      activeGroup={activeGroup}
      activeGroupId={activeGroupId}
      activeGroupNotebooks={activeGroupNotebooks}
      activeNotebook={activeNotebook}
      activeTheme={activeTheme}
      archivePage={archivePage}
      beginRenameGroup={beginRenameGroup}
      beginRenameNotebook={beginRenameNotebook}
      beginCreateNotebook={beginCreateNotebook}
      cancelCreateNotebook={cancelCreateNotebook}
      closeActionSheet={closeActionSheet}
      closeAll={closeAll}
      currentUser={currentUser}
      deleteGroup={deleteGroup}
      deleteNotebook={deleteNotebook}
      deletePagePermanently={deletePagePermanently}
      draftGroupName={draftGroupName}
      draftNotebookName={draftNotebookName}
      draftTitle={draftTitle}
      editingGroupId={editingGroupId}
      editingNotebookId={editingNotebookId}
      creatingNotebookGroupId={creatingNotebookGroupId}
      expandedGroupIds={expandedGroupIds}
      groupedNotebooks={groupedNotebooks}
      groupInputRef={groupInputRef}
      handleInstall={handleInstall}
      inputRef={inputRef}
      installEvent={installEvent}
      isCreating={isCreating}
      isCreatingGroup={isCreatingGroup}
      isPending={isPending}
      logoutAndClearClientData={logoutAndClearClientData}
      notebookInputRef={notebookInputRef}
      pagesOpen={pagesOpen}
      pathname={pathname}
      profileMenuRef={profileMenuRef}
      profileOpen={profileOpen}
      profilePanelPosition={profilePanelPosition}
      profileTriggerRef={profileTriggerRef}
      restorePage={restorePage}
      sectionsOpen={sectionsOpen}
      selectNotebook={selectNotebook}
      setActionSheet={setActionSheet}
      setDraftGroupName={setDraftGroupName}
      setDraftNotebookName={setDraftNotebookName}
      setDraftTitle={setDraftTitle}
      setEditingGroupId={setEditingGroupId}
      setEditingNotebookId={setEditingNotebookId}
      setIsCreating={setIsCreating}
      setIsCreatingGroup={setIsCreatingGroup}
      setPagesOpen={setPagesOpen}
      setProfileOpen={setProfileOpen}
      setSectionsOpen={setSectionsOpen}
      setSelectedNotebookId={setSelectedNotebookId}
      submitCreate={submitCreate}
      submitCreateGroup={submitCreateGroup}
      submitCreateNotebook={submitCreateNotebook}
      submitRenameGroup={submitRenameGroup}
      submitRenameNotebook={submitRenameNotebook}
      toggleGroupSelection={toggleGroupSelection}
    />
  );
}
