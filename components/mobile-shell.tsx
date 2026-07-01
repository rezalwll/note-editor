"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  ChevronDown,
  CirclePlus,
  Download,
  EllipsisVertical,
  FileText,
  FolderPlus,
  Menu,
  NotebookTabs,
  Trash2,
  UserRound,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";

import {
  archiveNotebookInlineAction,
  archivePageInlineAction,
  createNotebookGroupInlineAction,
  createPageInlineAction,
  deleteNotebookGroupInlineAction,
  deleteNotebookPermanentlyInlineAction,
  deletePagePermanentlyInlineAction,
  renameNotebookGroupInlineAction,
  renameNotebookInlineAction,
  restorePageInlineAction,
} from "@/app/actions";
import { BrandLogo } from "@/components/brand-logo";
import { EditorToolbar } from "@/components/editor-toolbar";
import { SearchTrigger } from "@/components/search-trigger";
import { SyncStatusIndicator } from "@/components/sync-status-indicator";
import {
  dispatchGroupRenamed,
  dispatchNotebookRenamed,
  getGroupRenamedEventName,
  getNotebookRenamedEventName,
  getPageTitleUpdatedEventName,
  type GroupRenamedDetail,
  type NotebookRenamedDetail,
  type PageTitleUpdatedDetail,
} from "@/lib/page-events";
import { getNotebookTheme, getRandomThemeKey } from "@/lib/notebook-theme";
import { formatDate } from "@/lib/utils";

type MobileNotebook = {
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

type MobileGroup = {
  id: string;
  name: string;
  notebookCount: number;
  themeKey?: string | null;
  systemKey: string | null;
};

type MobileShellProps = {
  notebooks: MobileNotebook[];
  groups: MobileGroup[];
  currentUser: {
    username: string;
    displayName: string;
  };
};

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
};

type MobileGroupSection = {
  id: string;
  name: string;
  notebookCount: number;
  systemKey: string | null;
  notebooks: MobileNotebook[];
};

type ActionSheetState =
  | { type: "group"; id: string }
  | { type: "notebook"; id: string }
  | { type: "page"; id: string }
  | null;

const UNGROUPED_ID = "ungrouped";
const TRASH_GROUP_KEY = "deleted-items";
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

export function MobileShell({ notebooks, groups, currentUser }: MobileShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [groupNameOverrides, setGroupNameOverrides] = useState<Record<string, string>>({});
  const [notebookNameOverrides, setNotebookNameOverrides] = useState<Record<string, string>>({});
  const [pageTitleOverrides, setPageTitleOverrides] = useState<
    Record<string, { title: string; updatedAt: string }>
  >({});
  const [sectionsOpen, setSectionsOpen] = useState(false);
  const [pagesOpen, setPagesOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [draftTitle, setDraftTitle] = useState("");
  const [isCreatingGroup, setIsCreatingGroup] = useState(false);
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
    const notebookMatch = pathname.match(/^\/notebooks\/([^/]+)/);
    if (notebookMatch) {
      return displayNotebooks.find((notebook) => notebook.id === notebookMatch[1]) ?? displayNotebooks[0];
    }

    const pageMatch = pathname.match(/^\/pages\/([^/]+)/);
    if (pageMatch) {
      return (
        displayNotebooks.find((notebook) =>
          notebook.pages.some((page) => page.id === pageMatch[1]),
        ) ?? displayNotebooks[0]
      );
    }

    return displayNotebooks[0];
  }, [displayNotebooks, pathname]);

  const activePageId = pathname.match(/^\/pages\/([^/]+)/)?.[1] ?? null;

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
    if (editingNotebookId) {
      notebookInputRef.current?.focus();
      notebookInputRef.current?.select();
    }
  }, [editingNotebookId]);

  useEffect(() => {
    const listener = (event: Event) => {
      const customEvent = event as CustomEvent<PageTitleUpdatedDetail>;
      const detail = customEvent.detail;

      if (!detail?.pageId) {
        return;
      }

      setPageTitleOverrides((current) => ({
        ...current,
        [detail.pageId]: {
          title: detail.title,
          updatedAt: detail.updatedAt,
        },
      }));
    };

    window.addEventListener(getPageTitleUpdatedEventName(), listener);
    return () => window.removeEventListener(getPageTitleUpdatedEventName(), listener);
  }, []);

  useEffect(() => {
    const listener = (event: Event) => {
      const customEvent = event as CustomEvent<NotebookRenamedDetail>;
      const detail = customEvent.detail;

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
      const customEvent = event as CustomEvent<GroupRenamedDetail>;
      const detail = customEvent.detail;

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
      const rect = profileTriggerRef.current?.getBoundingClientRect();
      const panelWidth = 176;

      if (!rect) {
        return;
      }

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
          id: group.id,
          name: groupNameOverrides[group.id] ?? group.name,
          notebookCount:
            group.systemKey === TRASH_GROUP_KEY
              ? getTrashItemCount(groupNotebooks)
              : group.notebookCount,
          systemKey: group.systemKey,
          notebooks: groupNotebooks,
        };
      }),
      {
        id: UNGROUPED_ID,
        name: "بدون مجموعه",
        notebookCount: displayNotebooks.filter((notebook) => notebook.groupId === null).length,
        systemKey: null,
        notebooks: displayNotebooks.filter((notebook) => notebook.groupId === null),
      },
    ],
    [displayNotebooks, groupNameOverrides, mergedGroups],
  );

  const activeGroupId =
    selectedGroupId ??
    routeNotebook?.groupId ??
    groupedNotebooks.find(
      (group) => group.id !== UNGROUPED_ID && group.systemKey !== TRASH_GROUP_KEY,
    )?.id ??
    groupedNotebooks.find((group) => group.id !== UNGROUPED_ID)?.id ??
    null;
  const activeGroup =
    groupedNotebooks.find((group) => group.id === activeGroupId) ?? null;
  const activeGroupNotebooks = activeGroup?.notebooks ?? [];
  const explicitNotebook =
    displayNotebooks.find((notebook) => notebook.id === selectedNotebookId) ?? null;
  const activeNotebook =
    explicitNotebook &&
    explicitNotebook.groupId === activeGroupId
      ? explicitNotebook
      : routeNotebook && routeNotebook.groupId === activeGroupId
        ? routeNotebook
        : activeGroupNotebooks[0] ?? null;

  const activeTheme = activeNotebook
    ? getNotebookTheme(activeNotebook.id, activeNotebook.themeKey)
    : getNotebookTheme(
        activeGroupNotebooks[0]?.id ?? "default",
        activeGroupNotebooks[0]?.themeKey,
      );

  const actionGroup =
    actionSheet?.type === "group"
      ? groupedNotebooks.find((group) => group.id === actionSheet.id) ?? null
      : null;
  const actionNotebook =
    actionSheet?.type === "notebook"
      ? displayNotebooks.find((notebook) => notebook.id === actionSheet.id) ?? null
      : null;
  const actionPage =
    actionSheet?.type === "page"
      ? displayNotebooks.flatMap((notebook) => notebook.pages).find((page) => page.id === actionSheet.id) ??
        null
      : null;

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

    if (!activeNotebook || activeNotebook.deletedAt) {
      setDraftTitle("");
      setIsCreating(false);
      return;
    }

    startTransition(async () => {
      const result = await createPageInlineAction(activeNotebook.id, nextTitle);

      if ("id" in result && result.id) {
        setDraftTitle("");
        setIsCreating(false);
        setPagesOpen(false);
        router.push(`/pages/${result.id}`);
        router.refresh();
      }
    });
  }

  function beginRenameGroup(group: MobileGroupSection) {
    setDraftGroupName(group.name);
    setEditingGroupId(group.id);
    closeActionSheet();
  }

  function submitRenameGroup() {
    if (!editingGroupId) {
      return;
    }

    const nextName = draftGroupName.trim() || "مجموعه بدون عنوان";
    const targetGroupId = editingGroupId;

    setEditingGroupId(null);
    setDraftGroupName("");

    startTransition(async () => {
      await renameNotebookGroupInlineAction(targetGroupId, nextName);
      dispatchGroupRenamed({ groupId: targetGroupId, name: nextName });
      router.refresh();
    });
  }

  function beginRenameNotebook(notebook: MobileNotebook) {
    setDraftNotebookName(notebook.name);
    setEditingNotebookId(notebook.id);
    closeActionSheet();
  }

  function submitRenameNotebook() {
    if (!editingNotebookId) {
      return;
    }

    const nextName = draftNotebookName.trim() || "زیر مجموعه بدون عنوان";
    const targetNotebookId = editingNotebookId;

    setEditingNotebookId(null);
    setDraftNotebookName("");

    startTransition(async () => {
      await renameNotebookInlineAction(targetNotebookId, nextName);
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

  function selectNotebook(notebookId: string) {
    const notebook = displayNotebooks.find((item) => item.id === notebookId);

    if (!notebook) {
      return;
    }

    setSelectedGroupId(notebook.groupId);
    setSelectedNotebookId(notebook.id);
    closeAll();
    router.push(`/notebooks/${notebook.id}`);
    router.refresh();
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
      closeAll();
      router.push(`/pages/${result.pageId}`);
      router.refresh();
    });
  }

  function deleteGroup(groupId: string) {
    closeActionSheet();

    startTransition(async () => {
      await deleteNotebookGroupInlineAction(groupId);
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
        await deleteNotebookPermanentlyInlineAction(notebook.id);
      } else {
        await archiveNotebookInlineAction(notebook.id);
      }

      if (routeNotebook?.id === notebook.id || activePageId) {
        router.push("/");
      }

      if (selectedNotebookId === notebook.id) {
        setSelectedNotebookId(null);
      }

      router.refresh();
    });
  }

  function archivePage(pageId: string) {
    closeActionSheet();

    startTransition(async () => {
      const result = await archivePageInlineAction(pageId);
      if ("notebookId" in result && result.notebookId && activePageId === pageId) {
        router.push(`/notebooks/${result.notebookId}`);
      }
      router.refresh();
    });
  }

  function restorePage(pageId: string) {
    closeActionSheet();

    startTransition(async () => {
      await restorePageInlineAction(pageId);
      if (activePageId === pageId) {
        router.push(`/pages/${pageId}`);
      }
      router.refresh();
    });
  }

  function deletePagePermanently(pageId: string) {
    closeActionSheet();

    startTransition(async () => {
      await deletePagePermanentlyInlineAction(pageId);
      if (activePageId === pageId) {
        router.push(activeNotebook ? `/notebooks/${activeNotebook.id}` : "/");
      }
      router.refresh();
    });
  }

  async function handleInstall() {
    if (!installEvent) {
      return;
    }

    await installEvent.prompt();
    setInstallEvent(null);
  }

  return (
    <div className="xl:hidden">
      <div className="sticky top-0 z-40 border-b border-[#b5baff] bg-[linear-gradient(90deg,rgba(159,161,255,0.95)_0%,rgba(181,186,255,0.95)_36%,rgba(174,226,255,0.92)_74%,rgba(217,249,223,0.9)_100%)] backdrop-blur">
        <div className="flex items-center justify-between gap-3 px-3 py-2">
          <button
            type="button"
            onClick={() => {
              setSectionsOpen((current) => !current);
              setPagesOpen(false);
              setProfileOpen(false);
            }}
            className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-white/60 bg-white/78 text-[#33406d] shadow-[0_10px_26px_rgba(116,125,255,0.18)]"
            aria-label="باز کردن مجموعه‌ها"
          >
            <Menu className="h-5 w-5" />
          </button>

          <BrandLogo frameClassName="h-7 w-[100px]" showWordmark={false} />

          <div className="flex items-center gap-2">
            <SyncStatusIndicator />
            <SearchTrigger
              className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-white/60 bg-white/78 text-[#33406d] shadow-[0_10px_26px_rgba(116,125,255,0.18)]"
            />
            <button
              ref={profileTriggerRef}
              type="button"
              onClick={() => {
                setProfileOpen((current) => !current);
                setSectionsOpen(false);
                setPagesOpen(false);
              }}
              className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-white/60 bg-white/78 text-[#33406d] shadow-[0_10px_26px_rgba(116,125,255,0.18)]"
              aria-label="باز کردن پروفایل"
            >
              <UserRound className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div className="overflow-x-auto px-3 pb-2">
          <div className="min-w-max">
            <EditorToolbar />
          </div>
        </div>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-[#b5baff] bg-[linear-gradient(90deg,rgba(159,161,255,0.94)_0%,rgba(181,186,255,0.94)_30%,rgba(174,226,255,0.92)_68%,rgba(217,249,223,0.9)_100%)] backdrop-blur">
        <div className="grid grid-cols-3 gap-2 px-3 py-2">
          <button
            type="button"
            onClick={() => {
              setSectionsOpen((current) => !current);
              setPagesOpen(false);
              setProfileOpen(false);
            }}
            className="inline-flex flex-col items-center justify-center gap-1 rounded-xl py-2 text-xs font-medium text-[#33406d]"
          >
            <NotebookTabs className="h-5 w-5" />
            مجموعه‌ها
          </button>
          <button
            type="button"
            onClick={() => {
              setPagesOpen((current) => !current);
              setSectionsOpen(false);
              setProfileOpen(false);
            }}
            className="inline-flex flex-col items-center justify-center gap-1 rounded-xl py-2 text-xs font-medium text-[#33406d]"
          >
            <FileText className="h-5 w-5" />
            صفحه‌ها
          </button>
          <button
            type="button"
            onClick={() => {
              setProfileOpen((current) => !current);
              setSectionsOpen(false);
              setPagesOpen(false);
            }}
            className="inline-flex flex-col items-center justify-center gap-1 rounded-xl py-2 text-xs font-medium text-[#33406d]"
          >
            <UserRound className="h-5 w-5" />
            پروفایل
          </button>
        </div>
      </div>

      {sectionsOpen ? (
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
                                    onClick={() => selectNotebook(notebook.id)}
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
      ) : null}

      {pagesOpen ? (
        <div className="fixed inset-0 z-50 cursor-pointer bg-black/20" onClick={closeAll}>
          <div
            className="absolute inset-x-0 bottom-0 max-h-[78vh] overflow-hidden rounded-t-[28px] shadow-[0_-24px_80px_rgba(15,23,42,0.22)]"
            style={{ backgroundColor: activeTheme.sidebarBg }}
            onClick={(event) => event.stopPropagation()}
          >
            <div
              className="sticky top-0 z-10 flex items-center justify-between border-b px-4 py-3"
              style={{
                borderColor: activeTheme.sidebarBorder,
                backgroundColor: activeTheme.sidebarHeaderBg,
              }}
            >
              <button
                type="button"
                onClick={() => {
                  setDraftTitle("");
                  setIsCreating(true);
                }}
                className="inline-flex items-center gap-2 text-sm"
                style={{ color: activeTheme.sidebarText }}
                disabled={Boolean(activeNotebook?.deletedAt) || !activeNotebook}
              >
                <CirclePlus className="h-4 w-4" />
                صفحه جدید
              </button>
              <button type="button" onClick={closeAll} className="text-[var(--text-muted)]">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div
              className="sticky top-[57px] z-[9] border-b px-4 py-3 backdrop-blur"
              style={{
                borderColor: activeTheme.sidebarBorder,
                backgroundColor: `${activeTheme.sidebarBg}f0`,
              }}
            >
              <div className="mb-2 text-right text-[11px] font-semibold text-[var(--text-muted)]">
                {activeGroup
                  ? `زیر مجموعه‌های ${activeGroup.name}`
                  : "زیر مجموعه‌های مجموعه"}
              </div>
              <div className="flex gap-2 overflow-x-auto pb-1">
                {activeGroupNotebooks.map((notebook) => {
                  const isActiveNotebook = notebook.id === activeNotebook?.id;
                  const notebookTheme = getNotebookTheme(notebook.id, notebook.themeKey);

                  return (
                    <Link
                      key={notebook.id}
                      href={`/notebooks/${notebook.id}`}
                      onClick={() => {
                        setDraftTitle("");
                        setIsCreating(false);
                        setSelectedNotebookId(notebook.id);
                      }}
                      className="shrink-0 rounded-full border px-3 py-2 text-sm font-medium transition"
                      style={{
                        backgroundColor: isActiveNotebook
                          ? notebookTheme.sidebarActive
                          : notebookTheme.accentSoft,
                        borderColor: isActiveNotebook
                          ? notebookTheme.accent
                          : notebookTheme.editorBorder,
                        color: notebookTheme.sidebarText,
                      }}
                    >
                      {notebook.name}
                    </Link>
                  );
                })}
              </div>
            </div>

            {isCreating ? (
              <div
                className="border-b bg-white px-4 py-3"
                style={{ borderColor: activeTheme.sidebarBorder }}
              >
                <input
                  ref={inputRef}
                  value={draftTitle}
                  onChange={(event) => setDraftTitle(event.target.value)}
                  onBlur={submitCreate}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      submitCreate();
                    }
                  }}
                  disabled={isPending}
                  placeholder="صفحه بدون عنوان"
                  className="w-full border-none bg-transparent text-right text-sm outline-none"
                  dir="rtl"
                />
              </div>
            ) : null}

            <div className="max-h-[calc(78vh-138px)] overflow-y-auto">
              {activeGroupNotebooks.length === 0 ? (
                <div className="px-4 py-6 text-right text-sm text-[#708090]">
                  هنوز زیر مجموعه‌ای برای این مجموعه انتخاب نشده است.
                </div>
              ) : activeNotebook ? (
                activeNotebook.pages.length > 0 ? (
                  activeNotebook.pages.map((page) => {
                    const isActive = pathname === `/pages/${page.id}`;

                    return (
                      <div key={page.id} className="flex items-center gap-2 border-b px-4 py-3" style={{ borderColor: activeTheme.sidebarBorder }}>
                        <button
                          type="button"
                          onClick={() => setActionSheet({ type: "page", id: page.id })}
                          className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-white/70 bg-white/80 text-[#50607a]"
                          aria-label={`عملیات ${page.title}`}
                        >
                          <EllipsisVertical className="h-4 w-4" />
                        </button>
                        <Link
                          href={`/pages/${page.id}`}
                          onClick={closeAll}
                          className="block w-full rounded-xl px-3 py-2 text-right transition"
                          style={{
                            backgroundColor: isActive ? activeTheme.sidebarHover : "transparent",
                          }}
                          dir="rtl"
                        >
                          <div className="text-sm" style={{ color: activeTheme.sidebarText }}>
                            {page.title}
                          </div>
                          <div className="mt-1 text-[11px]" style={{ color: activeTheme.sidebarMuted }}>
                            {formatDate(new Date(page.updatedAt))}
                          </div>
                        </Link>
                      </div>
                    );
                  })
                ) : (
                  <div
                    className="px-4 py-6 text-right text-sm"
                    style={{ color: activeTheme.sidebarMuted }}
                  >
                    این زیر مجموعه هنوز صفحه‌ای ندارد.
                  </div>
                )
              ) : (
                <div className="px-4 py-6 text-right text-sm text-[#708090]">
                  یک زیر مجموعه را از منوی مجموعه‌ها انتخاب کنید.
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {actionSheet ? (
        <div className="fixed inset-0 z-[140] bg-black/30" onClick={closeActionSheet}>
          <div
            className="absolute inset-x-0 bottom-0 rounded-t-[28px] bg-white p-4 shadow-[0_-24px_80px_rgba(15,23,42,0.22)]"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-3 text-center text-sm font-semibold text-[#1f2a37]">
              {actionGroup?.name ?? actionNotebook?.name ?? actionPage?.title}
            </div>
            <div className="grid gap-2">
              {actionGroup ? (
                <>
                  <button
                    type="button"
                    onClick={() => beginRenameGroup(actionGroup)}
                    className="rounded-2xl border border-[var(--border-soft)] px-4 py-3 text-right text-sm text-[#1f2a37]"
                  >
                    تغییر نام مجموعه
                  </button>
                  <button
                    type="button"
                    onClick={() => deleteGroup(actionGroup.id)}
                    className="rounded-2xl border border-[#fecaca] px-4 py-3 text-right text-sm text-[#b42318]"
                  >
                    حذف مجموعه
                  </button>
                </>
              ) : null}

              {actionNotebook ? (
                <>
                  {!actionNotebook.deletedAt ? (
                    <button
                      type="button"
                      onClick={() => beginRenameNotebook(actionNotebook)}
                      className="rounded-2xl border border-[var(--border-soft)] px-4 py-3 text-right text-sm text-[#1f2a37]"
                    >
                      تغییر نام زیر مجموعه
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => deleteNotebook(actionNotebook)}
                    className="rounded-2xl border border-[#fecaca] px-4 py-3 text-right text-sm text-[#b42318]"
                  >
                    {actionNotebook.deletedAt
                      ? "حذف دائمی زیر مجموعه"
                      : "انتقال زیر مجموعه به حذف‌شده‌ها"}
                  </button>
                </>
              ) : null}

              {actionPage ? (
                <>
                  {activeNotebook?.deletedAt && actionPage.originalNotebookId ? (
                    <button
                      type="button"
                      onClick={() => restorePage(actionPage.id)}
                      className="rounded-2xl border border-[var(--border-soft)] px-4 py-3 text-right text-sm text-[#1f2a37]"
                    >
                      بازیابی صفحه
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={() =>
                      activeNotebook?.deletedAt
                        ? deletePagePermanently(actionPage.id)
                        : archivePage(actionPage.id)
                    }
                    className="rounded-2xl border border-[#fecaca] px-4 py-3 text-right text-sm text-[#b42318]"
                  >
                    {activeNotebook?.deletedAt ? "حذف دائمی صفحه" : "حذف صفحه"}
                  </button>
                </>
              ) : null}

              <button
                type="button"
                onClick={closeActionSheet}
                className="rounded-2xl border border-[var(--border-soft)] px-4 py-3 text-center text-sm text-[#50607a]"
              >
                بستن
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {profileOpen ? (
        <>
          <div className="fixed inset-0 z-[120] bg-black/10" />
          <div
            ref={profileMenuRef}
            className="fixed z-[130] flex w-[176px] flex-col rounded-[18px] border border-[var(--border-soft)] bg-white p-1.5 shadow-[0_22px_54px_rgba(15,23,42,0.16)]"
            style={{
              top: `${profilePanelPosition.top}px`,
              left: `${profilePanelPosition.left}px`,
            }}
          >
            <div className="border-b border-[var(--border-soft)] px-2.5 py-2 text-center">
              <div className="truncate text-sm font-semibold text-[#1f2a37]">
                {currentUser.displayName}
              </div>
              <div className="truncate text-[11px] text-[#708090]" dir="ltr">
                @{currentUser.username}
              </div>
            </div>

            {installEvent ? (
              <button
                type="button"
                onClick={handleInstall}
                className="mt-1 rounded-xl px-2.5 py-2 text-center text-sm text-[var(--text-main)] transition hover:bg-[var(--bg-softer)]"
              >
                نصب برنامه
              </button>
            ) : null}

            <Link
              href="/settings"
              onClick={closeAll}
              className="mt-1 rounded-xl px-2.5 py-2 text-center text-sm text-[var(--text-main)] transition hover:bg-[var(--bg-softer)]"
            >
              تنظیمات
            </Link>

            <form action="/api/auth/logout" method="post">
              <button
                type="submit"
                className="w-full rounded-xl px-2.5 py-2 text-center text-sm text-[#b42318] transition hover:bg-[#fff3f2]"
              >
                خروج از حساب
              </button>
            </form>
          </div>
        </>
      ) : null}
    </div>
  );
}
