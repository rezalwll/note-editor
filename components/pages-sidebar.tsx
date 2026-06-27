"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { CirclePlus } from "lucide-react";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";

import {
  archivePageInlineAction,
  createPageInlineAction,
  deletePagePermanentlyInlineAction,
  reorderPagesInlineAction,
  restorePageInlineAction,
} from "@/app/actions";
import { useContextMenu } from "@/components/context-menu";
import {
  getNotebookRenamedEventName,
  getPageTitleUpdatedEventName,
  type NotebookRenamedDetail,
  type PageTitleUpdatedDetail,
} from "@/lib/page-events";
import { getNotebookTheme } from "@/lib/notebook-theme";
import { formatDate } from "@/lib/utils";

type NotebookSummary = {
  id: string;
  name: string;
  deletedAt?: Date | null;
  pages: Array<{
    id: string;
    title: string;
    updatedAt: Date;
    sortOrder?: number;
    deletedAt?: Date | null;
    originalNotebookId?: string | null;
  }>;
};

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

type PagesSidebarProps = {
  notebooks: NotebookSummary[];
};

export function PagesSidebar({ notebooks }: PagesSidebarProps) {
  const sidebarTopOffset = "166px";
  const sidebarHeight = "calc(100vh - 150px)";
  const sidebarListHeight = "calc(100vh - 198px)";
  const pathname = usePathname();
  const router = useRouter();
  const { openMenu } = useContextMenu();
  const [isCreating, setIsCreating] = useState(false);
  const [notebookNameOverrides, setNotebookNameOverrides] = useState<Record<string, string>>({});
  const [pageOrderOverrides, setPageOrderOverrides] = useState<Record<string, number>>({});
  const [pageTitleOverrides, setPageTitleOverrides] = useState<
    Record<string, { title: string; updatedAt: string }>
  >({});
  const [selectedPageIds, setSelectedPageIds] = useState<string[]>([]);
  const [draftTitle, setDraftTitle] = useState("");
  const [draggedPageId, setDraggedPageId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement | null>(null);

  const displayNotebooks = useMemo(
    () =>
      notebooks.map((notebook) => ({
        ...notebook,
        name: notebookNameOverrides[notebook.id] ?? notebook.name,
        pages: notebook.pages.map((page) => {
          const override = pageTitleOverrides[page.id];
          return override
            ? {
                ...page,
                title: override.title,
                updatedAt: new Date(override.updatedAt),
                sortOrder: pageOrderOverrides[page.id] ?? page.sortOrder,
              }
            : {
                ...page,
                sortOrder: pageOrderOverrides[page.id] ?? page.sortOrder,
              };
        }),
      })),
    [notebookNameOverrides, notebooks, pageOrderOverrides, pageTitleOverrides],
  );

  const activeNotebook = useMemo(() => {
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
  const activeTheme = activeNotebook
    ? getNotebookTheme(activeNotebook.id)
    : null;
  const activePages = useMemo(
    () =>
      activeNotebook
        ? [...activeNotebook.pages].sort(
            (left, right) => (left.sortOrder ?? 0) - (right.sortOrder ?? 0),
          )
        : [],
    [activeNotebook],
  );

  useEffect(() => {
    if (isCreating) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [isCreating]);

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

  function beginCreate() {
    if (activeNotebook?.deletedAt) {
      return;
    }

    setDraftTitle("");
    setIsCreating(true);
  }

  function cancelCreate() {
    setDraftTitle("");
    setIsCreating(false);
  }

  function submitCreate() {
    const nextTitle = draftTitle.trim() || "صفحه بدون عنوان";

    if (!activeNotebook) {
      cancelCreate();
      return;
    }

    startTransition(async () => {
      const result = await createPageInlineAction(activeNotebook.id, nextTitle);

      if ("id" in result && result.id) {
        setIsCreating(false);
        setDraftTitle("");
        router.push(`/pages/${result.id}`);
        router.refresh();
      }
    });
  }

  function archivePage(pageId: string) {
    if (!activeNotebook) {
      return;
    }

    const fallbackPage = activePages.find((page) => page.id !== pageId);
    const isActivePage = pathname === `/pages/${pageId}`;

    startTransition(async () => {
      const result = await archivePageInlineAction(pageId);

      if (isActivePage) {
        router.push(
          fallbackPage
            ? `/pages/${fallbackPage.id}`
            : `/notebooks/${result.notebookId}`,
        );
      }

      router.refresh();
    });
  }

  function archivePages(pageIds: string[]) {
    if (!activeNotebook) {
      return;
    }

    const fallbackPage = activePages.find(
      (page) => !pageIds.includes(page.id),
    );
    const activePageId = pathname.match(/^\/pages\/([^/]+)/)?.[1];
    const shouldRedirect = activePageId ? pageIds.includes(activePageId) : false;

    startTransition(async () => {
      setSelectedPageIds([]);
      await Promise.all(pageIds.map((pageId) => archivePageInlineAction(pageId)));

      if (shouldRedirect) {
        router.push(
          fallbackPage
            ? `/pages/${fallbackPage.id}`
            : `/notebooks/${activeNotebook.id}`,
        );
      }

      router.refresh();
    });
  }

  function restorePages(pageIds: string[]) {
    const activePageId = pathname.match(/^\/pages\/([^/]+)/)?.[1];

    startTransition(async () => {
      setSelectedPageIds([]);
      const results = await Promise.all(
        pageIds.map((pageId) => restorePageInlineAction(pageId)),
      );
      const restored = results.find(
        (result) => "notebookId" in result && Boolean(result.notebookId),
      );

      if (activePageId && pageIds.includes(activePageId) && restored) {
        router.push(`/pages/${activePageId}`);
      }

      router.refresh();
    });
  }

  function deletePagesPermanently(pageIds: string[]) {
    if (!activeNotebook) {
      return;
    }

    const fallbackPage = activePages.find(
      (page) => !pageIds.includes(page.id),
    );
    const activePageId = pathname.match(/^\/pages\/([^/]+)/)?.[1];
    const shouldRedirect = activePageId ? pageIds.includes(activePageId) : false;

    startTransition(async () => {
      setSelectedPageIds([]);
      await Promise.all(
        pageIds.map((pageId) => deletePagePermanentlyInlineAction(pageId)),
      );

      if (shouldRedirect) {
        router.push(
          fallbackPage
            ? `/pages/${fallbackPage.id}`
            : `/notebooks/${activeNotebook.id}`,
        );
      }

      router.refresh();
    });
  }

  function togglePageSelection(pageId: string) {
    setSelectedPageIds((current) =>
      current.includes(pageId)
        ? current.filter((id) => id !== pageId)
        : [...current, pageId],
    );
  }

  function selectSinglePage(pageId: string) {
    setSelectedPageIds([pageId]);
  }

  function handlePageDrop(targetPageId: string) {
    if (!activeNotebook || activeNotebook.deletedAt || !draggedPageId) {
      setDraggedPageId(null);
      return;
    }

    const currentPageIds = activePages.map((page) => page.id);
    const nextPageIds = reorderIds(currentPageIds, draggedPageId, targetPageId);

    if (nextPageIds.join(",") === currentPageIds.join(",")) {
      setDraggedPageId(null);
      return;
    }

    setDraggedPageId(null);
    setPageOrderOverrides((current) => ({
      ...current,
      ...Object.fromEntries(nextPageIds.map((id, index) => [id, index])),
    }));

    startTransition(async () => {
      await reorderPagesInlineAction(activeNotebook.id, nextPageIds);
      router.refresh();
    });
  }

  if (!activeNotebook) {
    return (
      <aside className="hidden xl:block">
        <div
          className="fixed right-0 w-[300px] border-l"
          style={{ top: sidebarTopOffset, height: sidebarHeight }}
        />
      </aside>
    );
  }

  return (
    <aside className="hidden xl:block">
      <div
        className="fixed right-0 w-[300px] border-l"
        style={{
          top: sidebarTopOffset,
          height: sidebarHeight,
          borderColor: activeTheme?.sidebarBorder,
          backgroundColor: activeTheme?.sidebarBg,
        }}
        onContextMenu={(event) => {
          const target = event.target as HTMLElement;

          if (target.closest("[data-page-item]")) {
            return;
          }

          event.preventDefault();
          openMenu(event, {
            title: activeNotebook.name,
            items:
              selectedPageIds.length > 0
                ? [
                    {
                      id: "new-page",
                      label: "صفحه جدید",
                      onSelect: beginCreate,
                    },
                    { id: "separator-1", separator: true },
                    {
                      id: "clear-selection",
                      label: `پاک کردن انتخاب ${selectedPageIds.length} صفحه`,
                      onSelect: () => setSelectedPageIds([]),
                    },
                  ]
                : [
                    {
                      id: "new-page",
                      label: "صفحه جدید",
                      onSelect: beginCreate,
                    },
                  ],
          });
        }}
      >
        <div
          className="flex items-center justify-between border-b px-3 py-2"
          style={{
            borderColor: activeTheme?.sidebarBorder,
            backgroundColor: activeTheme?.sidebarHeaderBg,
          }}
        >
          <button
            type="button"
            onClick={beginCreate}
            className="inline-flex items-center gap-2 rounded-xl border px-3 py-1.5 text-[13px] font-medium shadow-[0_8px_20px_rgba(15,23,42,0.08)] transition hover:brightness-[1.03]"
            style={{
              color: activeTheme?.sidebarText,
              borderColor: activeTheme?.sidebarBorder,
              backgroundColor: "rgba(255,255,255,0.82)",
            }}
            disabled={Boolean(activeNotebook.deletedAt)}
            title={
              activeNotebook.deletedAt
                ? "در زیر مجموعه‌های حذف‌شده نمی‌توان صفحه جدید ساخت."
                : "صفحه جدید"
            }
          >
            <CirclePlus className="h-4 w-4" />
            صفحه جدید
          </button>

          <button
            type="button"
            className="text-sm font-semibold"
            style={{ color: activeTheme?.sidebarText }}
          >
            {activeNotebook.name}
          </button>
        </div>

        {isCreating ? (
          <div
            className="border-b bg-white px-3 py-2 text-right"
            style={{ borderColor: activeTheme?.sidebarBorder }}
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

                if (event.key === "Escape") {
                  event.preventDefault();
                  cancelCreate();
                }
              }}
              disabled={isPending}
              placeholder="صفحه بدون عنوان"
              className="w-full border-none bg-transparent text-right text-sm text-[#313131] outline-none"
              dir="rtl"
            />
          </div>
        ) : null}

        <div className="overflow-y-auto text-right" style={{ height: sidebarListHeight }}>
          {activePages.map((page) => {
            const isActive = pathname === `/pages/${page.id}`;
            const isSelected = selectedPageIds.includes(page.id);

            return (
              <Link
                key={page.id}
                href={`/pages/${page.id}`}
                data-page-item="true"
                draggable={!activeNotebook.deletedAt}
                onDragStart={() => {
                  if (activeNotebook.deletedAt) {
                    return;
                  }

                  setDraggedPageId(page.id);
                }}
                onDragEnd={() => setDraggedPageId(null)}
                onDragOver={(event) => {
                  if (draggedPageId && !activeNotebook.deletedAt) {
                    event.preventDefault();
                  }
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  handlePageDrop(page.id);
                }}
                onClick={(event) => {
                  if (event.ctrlKey || event.metaKey) {
                    event.preventDefault();
                    togglePageSelection(page.id);
                    return;
                  }

                  selectSinglePage(page.id);
                }}
                onContextMenu={(event) => {
                  event.preventDefault();
                  const selectedIds =
                    isSelected && selectedPageIds.length > 1
                      ? selectedPageIds
                      : [page.id];

                  if (!isSelected) {
                    setSelectedPageIds([page.id]);
                  }

                  const selectedPages = activePages.filter((item) =>
                    selectedIds.includes(item.id),
                  );
                  const canRestore = selectedPages.every(
                    (item) => Boolean(item.originalNotebookId),
                  );
                  const isTrashNotebook = Boolean(activeNotebook.deletedAt);

                  openMenu(event, {
                  title:
                    selectedIds.length > 1
                      ? `${selectedIds.length} صفحه انتخاب شده`
                      : page.title,
                    items: isTrashNotebook
                      ? [
                          ...(canRestore
                            ? [
                                {
                                  id: "restore-pages",
                                  label:
                                    selectedIds.length > 1
                                      ? "بازیابی صفحه‌های انتخاب‌شده"
                                      : "بازیابی صفحه",
                                  onSelect: () => restorePages(selectedIds),
                                },
                                { id: "separator-restore", separator: true as const },
                              ]
                            : []),
                          {
                            id: "delete-pages-permanently",
                            label:
                              selectedIds.length > 1
                                ? "حذف دائمی صفحه‌های انتخاب‌شده"
                                : "حذف دائمی صفحه",
                            danger: true,
                            onSelect: () => deletePagesPermanently(selectedIds),
                          },
                        ]
                      : selectedIds.length > 1
                        ? [
                            {
                              id: "delete-pages",
                              label: "حذف صفحه‌های انتخاب‌شده",
                              danger: true,
                              onSelect: () => archivePages(selectedIds),
                            },
                            {
                              id: "clear-selection",
                              label: "پاک کردن انتخاب",
                              onSelect: () => setSelectedPageIds([]),
                            },
                          ]
                        : [
                            {
                              id: "open-page",
                              label: "باز کردن صفحه",
                              onSelect: () => router.push(`/pages/${page.id}`),
                            },
                            { id: "separator-1", separator: true },
                            {
                              id: "delete-page",
                              label: "حذف صفحه",
                              danger: true,
                              onSelect: () => archivePage(page.id),
                            },
                          ],
                  });
                }}
                className="block border-b px-3 py-3 transition"
                style={{
                  borderColor: activeTheme?.sidebarBorder,
                  backgroundColor: isActive
                    ? activeTheme?.sidebarActive
                    : isSelected
                      ? activeTheme?.sidebarHover
                      : "transparent",
                  cursor: activeNotebook.deletedAt
                    ? "default"
                    : draggedPageId === page.id
                      ? "grabbing"
                      : "grab",
                  opacity: draggedPageId === page.id ? 0.72 : 1,
                }}
                dir="rtl"
              >
                <div className="truncate text-sm" style={{ color: activeTheme?.sidebarText }}>
                  {page.title}
                </div>
                <div className="mt-1 text-[11px]" style={{ color: activeTheme?.sidebarMuted }}>
                  {formatDate(new Date(page.updatedAt))}
                </div>
              </Link>
            );
          })}
          {activePages.length === 0 ? (
            <div className="px-3 py-5 text-right">
              <div className="text-xs" style={{ color: activeTheme?.sidebarMuted }}>
                هنوز صفحه‌ای وجود ندارد.
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </aside>
  );
}
