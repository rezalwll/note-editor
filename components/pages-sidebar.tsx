"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { CirclePlus } from "lucide-react";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";

import { archivePageInlineAction, createPageInlineAction } from "@/app/actions";
import { useContextMenu } from "@/components/context-menu";
import { getNotebookTheme } from "@/lib/notebook-theme";
import { formatDate } from "@/lib/utils";

type NotebookSummary = {
  id: string;
  name: string;
  pages: Array<{
    id: string;
    title: string;
    updatedAt: Date;
  }>;
};

type PagesSidebarProps = {
  notebooks: NotebookSummary[];
};

export function PagesSidebar({ notebooks }: PagesSidebarProps) {
  const sidebarTopOffset = "111px";
  const sidebarHeight = "calc(100vh - 111px)";
  const sidebarListHeight = "calc(100vh - 154px)";
  const pathname = usePathname();
  const router = useRouter();
  const { openMenu } = useContextMenu();
  const [isCreating, setIsCreating] = useState(false);
  const [selectedPageIds, setSelectedPageIds] = useState<string[]>([]);
  const [draftTitle, setDraftTitle] = useState("");
  const [isPending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement | null>(null);

  const activeNotebook = useMemo(() => {
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
  const activeTheme = activeNotebook
    ? getNotebookTheme(activeNotebook.id)
    : null;

  useEffect(() => {
    if (isCreating) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [isCreating]);

  function beginCreate() {
    setDraftTitle("");
    setIsCreating(true);
  }

  function cancelCreate() {
    setDraftTitle("");
    setIsCreating(false);
  }

  function submitCreate() {
    const nextTitle = draftTitle.trim();

    if (!nextTitle || !activeNotebook) {
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

    const fallbackPage = activeNotebook.pages.find((page) => page.id !== pageId);
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

    const fallbackPage = activeNotebook.pages.find(
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

  if (!activeNotebook) {
    return (
      <aside className="hidden w-[300px] shrink-0 xl:block">
        <div
          className="fixed right-0 w-[300px] border-l"
          style={{ top: sidebarTopOffset, height: sidebarHeight }}
        />
      </aside>
    );
  }

  return (
    <aside className="hidden w-[300px] shrink-0 xl:block">
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
                      label: "New page",
                      onSelect: beginCreate,
                    },
                    { id: "separator-1", separator: true },
                    {
                      id: "clear-selection",
                      label: `Clear ${selectedPageIds.length} selected page(s)`,
                      onSelect: () => setSelectedPageIds([]),
                    },
                  ]
                : [
                    {
                      id: "new-page",
                      label: "New page",
                      onSelect: beginCreate,
                    },
                  ],
          });
        }}
      >
        <div
          className="border-b px-3 py-2 text-right"
          style={{
            borderColor: activeTheme?.sidebarBorder,
            backgroundColor: activeTheme?.sidebarHeaderBg,
          }}
        >
          <button
            type="button"
            onClick={beginCreate}
            className="inline-flex items-center gap-2 text-[13px]"
            style={{ color: activeTheme?.sidebarText }}
          >
            <CirclePlus className="h-4 w-4" />
            Add Page
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
              placeholder="Untitled Page"
              className="w-full border-none bg-transparent text-right text-sm text-[#313131] outline-none"
              dir="rtl"
            />
          </div>
        ) : null}

        <div className="overflow-y-auto text-right" style={{ height: sidebarListHeight }}>
          {activeNotebook.pages.map((page) => {
            const isActive = pathname === `/pages/${page.id}`;
            const isSelected = selectedPageIds.includes(page.id);

            return (
              <Link
                key={page.id}
                href={`/pages/${page.id}`}
                data-page-item="true"
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

                  openMenu(event, {
                    title:
                      selectedIds.length > 1
                        ? `${selectedIds.length} pages selected`
                        : page.title,
                    items:
                      selectedIds.length > 1
                        ? [
                            {
                              id: "delete-pages",
                              label: "Delete selected pages",
                              danger: true,
                              onSelect: () => archivePages(selectedIds),
                            },
                            {
                              id: "clear-selection",
                              label: "Clear selection",
                              onSelect: () => setSelectedPageIds([]),
                            },
                          ]
                        : [
                            {
                              id: "open-page",
                              label: "Open page",
                              onSelect: () => router.push(`/pages/${page.id}`),
                            },
                            { id: "separator-1", separator: true },
                            {
                              id: "delete-page",
                              label: "Delete page",
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
          {activeNotebook.pages.length === 0 ? (
            <div className="px-3 py-4 text-right text-xs text-stone-500">
              No pages yet.
            </div>
          ) : null}
        </div>
      </div>
    </aside>
  );
}
