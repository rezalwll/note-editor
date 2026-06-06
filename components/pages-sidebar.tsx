"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { CirclePlus } from "lucide-react";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";

import { createPageInlineAction } from "@/app/actions";
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
  const pathname = usePathname();
  const router = useRouter();
  const [isCreating, setIsCreating] = useState(false);
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

  if (!activeNotebook) {
    return (
      <aside className="hidden w-[300px] shrink-0 border-l border-[#b8d794] bg-[#eef6df] xl:block" />
    );
  }

  return (
    <aside className="hidden w-[300px] shrink-0 border-l border-[#b8d794] bg-[#eef6df] xl:block">
      <div className="border-b border-[#b8d794] bg-[#b9dc8f] px-3 py-2 text-right">
        <button
          type="button"
          onClick={beginCreate}
          className="inline-flex items-center gap-2 text-[13px] text-[#4b5d33]"
        >
          <CirclePlus className="h-4 w-4" />
          Add Page
        </button>
      </div>

      {isCreating ? (
        <div className="border-b border-[#d8e8c8] bg-white px-3 py-2 text-right">
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

      <div className="overflow-y-auto text-right">
        {activeNotebook.pages.map((page) => {
          const isActive = pathname === `/pages/${page.id}`;

          return (
            <Link
              key={page.id}
              href={`/pages/${page.id}`}
              className={`block border-b border-[#d8e8c8] px-3 py-3 transition ${
                isActive ? "bg-white" : "hover:bg-[#e4f0d2]"
              }`}
              dir="rtl"
            >
              <div className="truncate text-sm text-[#313131]">{page.title}</div>
              <div className="mt-1 text-[11px] text-[#6c7c57]">
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
    </aside>
  );
}
