"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  ChevronDown,
  CirclePlus,
  Download,
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
  createNotebookGroupInlineAction,
  createPageInlineAction,
} from "@/app/actions";
import { BrandLogo } from "@/components/brand-logo";
import { EditorToolbar } from "@/components/editor-toolbar";
import { getNotebookTheme } from "@/lib/notebook-theme";
import { formatDate } from "@/lib/utils";

type MobileNotebook = {
  id: string;
  name: string;
  groupId: string | null;
  groupName: string | null;
  pages: Array<{
    id: string;
    title: string;
    updatedAt: Date;
    deletedAt: Date | null;
  }>;
  deletedAt: Date | null;
};

type MobileGroup = {
  id: string;
  name: string;
  notebookCount: number;
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

const UNGROUPED_ID = "ungrouped";

export function MobileShell({ notebooks, groups, currentUser }: MobileShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [sectionsOpen, setSectionsOpen] = useState(false);
  const [pagesOpen, setPagesOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [draftTitle, setDraftTitle] = useState("");
  const [isCreatingGroup, setIsCreatingGroup] = useState(false);
  const [draftGroupName, setDraftGroupName] = useState("");
  const [createdGroups, setCreatedGroups] = useState<MobileGroup[]>([]);
  const [expandedGroupIds, setExpandedGroupIds] = useState<string[]>(() => [
    ...groups.map((group) => group.id),
    UNGROUPED_ID,
  ]);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [selectedNotebookId, setSelectedNotebookId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [installEvent, setInstallEvent] = useState<InstallPromptEvent | null>(null);
  const [profilePanelPosition, setProfilePanelPosition] = useState({ top: 0, left: 0 });
  const inputRef = useRef<HTMLInputElement | null>(null);
  const groupInputRef = useRef<HTMLInputElement | null>(null);
  const profileMenuRef = useRef<HTMLDivElement | null>(null);
  const profileTriggerRef = useRef<HTMLButtonElement | null>(null);

  const routeNotebook = useMemo(() => {
    const notebookMatch = pathname.match(/^\/notebooks\/([^/]+)/);
    if (notebookMatch) {
      return notebooks.find((notebook) => notebook.id === notebookMatch[1]) ?? notebooks[0];
    }

    const pageMatch = pathname.match(/^\/pages\/([^/]+)/);
    if (pageMatch) {
      return (
        notebooks.find((notebook) =>
          notebook.pages.some((page) => page.id === pageMatch[1]),
        ) ?? notebooks[0]
      );
    }

    return notebooks[0];
  }, [notebooks, pathname]);

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
      ...mergedGroups.map((group) => ({
        id: group.id,
        name: group.name,
        notebookCount: group.notebookCount,
        systemKey: group.systemKey,
        notebooks: notebooks.filter((notebook) => notebook.groupId === group.id),
      })),
      {
        id: UNGROUPED_ID,
        name: "بدون دسته",
        notebookCount: notebooks.filter((notebook) => notebook.groupId === null).length,
        systemKey: null,
        notebooks: notebooks.filter((notebook) => notebook.groupId === null),
      },
    ],
    [mergedGroups, notebooks],
  );

  const activeGroupId = selectedGroupId ?? (routeNotebook?.groupId ?? UNGROUPED_ID);
  const activeGroup =
    groupedNotebooks.find((group) => group.id === activeGroupId) ?? null;
  const activeGroupNotebooks = activeGroup?.notebooks ?? [];
  const explicitNotebook =
    notebooks.find((notebook) => notebook.id === selectedNotebookId) ?? null;
  const activeNotebook =
    explicitNotebook &&
    (explicitNotebook.groupId ?? UNGROUPED_ID) === activeGroupId
      ? explicitNotebook
      : routeNotebook && (routeNotebook.groupId ?? UNGROUPED_ID) === activeGroupId
        ? routeNotebook
        : activeGroupNotebooks[0] ?? null;

  const activeTheme = activeNotebook
    ? getNotebookTheme(activeNotebook.id)
    : getNotebookTheme(activeGroupNotebooks[0]?.id ?? "default");

  function closeAll() {
    setSectionsOpen(false);
    setPagesOpen(false);
    setProfileOpen(false);
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

  function toggleGroupSelection(groupId: string) {
    const targetGroup = groupedNotebooks.find((group) => group.id === groupId);
    const nextNotebook =
      activeNotebook &&
      (activeNotebook.groupId ?? UNGROUPED_ID) === groupId
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
    const notebook = notebooks.find((item) => item.id === notebookId);

    if (!notebook) {
      return;
    }

    setSelectedGroupId(notebook.groupId ?? UNGROUPED_ID);
    setSelectedNotebookId(notebook.id);
    closeAll();
    router.push(`/notebooks/${notebook.id}`);
    router.refresh();
  }

  function submitCreateGroup() {
    const nextName = draftGroupName.trim() || "دسته جدید";

    startTransition(async () => {
      const result = await createNotebookGroupInlineAction(nextName);

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
            aria-label="باز کردن دسته‌ها"
          >
            <Menu className="h-5 w-5" />
          </button>

          <BrandLogo frameClassName="h-7 w-[100px]" showWordmark={false} />

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
            دسته‌ها
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
                  setDraftGroupName("");
                  setIsCreatingGroup((current) => !current);
                }}
                className="inline-flex items-center gap-2 rounded-full border border-[var(--border-soft)] px-3 py-1.5 text-xs font-semibold text-[#33406d]"
              >
                <FolderPlus className="h-3.5 w-3.5" />
                دسته جدید
              </button>
              <div className="flex items-center gap-3">
                <div className="text-sm font-semibold text-[var(--text-strong)]">دسته‌ها</div>
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
                      placeholder="نام دسته جدید"
                      className="w-full border-none bg-transparent text-right text-sm outline-none placeholder:text-[#708090]"
                      dir="rtl"
                    />
                  </div>
                ) : null}

                {groupedNotebooks.map((group) => (
                  <div key={group.id}>
                    <button
                      type="button"
                      onClick={() => toggleGroupSelection(group.id)}
                      className="flex w-full items-center justify-between rounded-2xl border border-[var(--border-soft)] bg-[#fbfbff] px-4 py-3 text-right shadow-[0_2px_8px_rgba(15,23,42,0.05)]"
                    >
                      <div className="flex items-center gap-3">
                        <ChevronDown
                          className={[
                            "h-4 w-4 text-[#708090] transition",
                            expandedGroupIds.includes(group.id) ? "rotate-180" : "",
                          ].join(" ")}
                        />
                        <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-semibold text-[#50607a]">
                          {group.notebooks.length}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-sm font-semibold text-[#23324d]">
                        {group.systemKey === "deleted-items" ? (
                          <Trash2 className="h-3.5 w-3.5" />
                        ) : null}
                        <span>{group.name}</span>
                      </div>
                    </button>

                    {expandedGroupIds.includes(group.id) ? (
                      <div className="mt-2 grid gap-2 pr-3">
                        {group.notebooks.length > 0 ? (
                          group.notebooks.map((notebook) => {
                            const theme = getNotebookTheme(notebook.id);
                            const isActiveNotebook = activeNotebook?.id === notebook.id;

                            return (
                              <button
                                key={notebook.id}
                                type="button"
                                onClick={() => selectNotebook(notebook.id)}
                                className="rounded-2xl border px-4 py-3 text-right text-sm shadow-[0_2px_8px_rgba(15,23,42,0.05)] transition"
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
                                {notebook.name}
                              </button>
                            );
                          })
                        ) : (
                          <div className="rounded-2xl border border-dashed border-[var(--border-soft)] bg-white px-4 py-3 text-right text-xs text-[#708090]">
                            هنوز دفتری در این دسته نیست
                          </div>
                        )}
                      </div>
                    ) : null}
                  </div>
                ))}
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
                {activeGroup ? `دفترهای ${activeGroup.name}` : "دفترهای دسته"}
              </div>
              <div className="flex gap-2 overflow-x-auto pb-1">
                {activeGroupNotebooks.map((notebook) => {
                  const isActiveNotebook = notebook.id === activeNotebook?.id;
                  const notebookTheme = getNotebookTheme(notebook.id);

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
                  هنوز دفتری برای این دسته انتخاب نشده است.
                </div>
              ) : activeNotebook ? (
                activeNotebook.pages.length > 0 ? (
                  activeNotebook.pages.map((page) => {
                    const isActive = pathname === `/pages/${page.id}`;

                    return (
                      <Link
                        key={page.id}
                        href={`/pages/${page.id}`}
                        onClick={closeAll}
                        className="block border-b px-4 py-3 text-right"
                        style={{
                          borderColor: activeTheme.sidebarBorder,
                          backgroundColor: isActive ? activeTheme.sidebarActive : "transparent",
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
                    );
                  })
                ) : (
                  <div
                    className="px-4 py-6 text-right text-sm"
                    style={{ color: activeTheme.sidebarMuted }}
                  >
                    این دفتر هنوز صفحه‌ای ندارد.
                  </div>
                )
              ) : (
                <div className="px-4 py-6 text-right text-sm text-[#708090]">
                  یک دفتر را از منوی دسته‌ها انتخاب کنید.
                </div>
              )}
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
