"use client";

import Link from "next/link";
import { Plus } from "lucide-react";
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { createNotebookInlineAction } from "@/app/actions";
import { cn } from "@/lib/utils";

type NotebookTab = {
  id: string;
  name: string;
};

type SectionTabsProps = {
  notebooks: NotebookTab[];
};

const sectionColors = [
  "bg-[#8fb3e2]",
  "bg-[#d6b48c]",
  "bg-[#d7df73]",
  "bg-[#9dcb64]",
  "bg-[#d3c0ea]",
  "bg-[#f0ba7f]",
] as const;

export function SectionTabs({ notebooks }: SectionTabsProps) {
  const router = useRouter();
  const [isCreating, setIsCreating] = useState(false);
  const [draftName, setDraftName] = useState("");
  const [isPending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (isCreating) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [isCreating]);

  function beginCreate() {
    setDraftName("");
    setIsCreating(true);
  }

  function cancelCreate() {
    setDraftName("");
    setIsCreating(false);
  }

  function submitCreate() {
    const nextName = draftName.trim();

    if (!nextName) {
      cancelCreate();
      return;
    }

    startTransition(async () => {
      const result = await createNotebookInlineAction(nextName);

      if ("id" in result && result.id) {
        setIsCreating(false);
        setDraftName("");
        router.push(`/notebooks/${result.id}`);
        router.refresh();
      }
    });
  }

  return (
    <div className="flex flex-wrap items-end gap-1 px-3 pt-2">
      {notebooks.map((notebook, index) => (
        <Link
          key={notebook.id}
          href={`/notebooks/${notebook.id}`}
          className={cn(
            sectionColors[index % sectionColors.length],
            "inline-flex h-6 items-center rounded-t-md px-4 text-xs text-[#333] shadow-[inset_0_-1px_0_rgba(0,0,0,0.08)]",
          )}
        >
          {notebook.name}
        </Link>
      ))}

      {isCreating ? (
        <div className="inline-flex h-6 items-center rounded-t-md border border-stone-300 bg-white px-2 shadow-[inset_0_-1px_0_rgba(0,0,0,0.08)]">
          <input
            ref={inputRef}
            value={draftName}
            onChange={(event) => setDraftName(event.target.value)}
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
            className="w-28 border-none bg-transparent text-xs text-[#333] outline-none"
            placeholder="New Section"
          />
        </div>
      ) : (
        <button
          type="button"
          onClick={beginCreate}
          className="flex h-6 w-9 items-center justify-center rounded-t-md border border-stone-300 bg-white text-stone-700 transition hover:bg-stone-100"
          title="New section"
        >
          <Plus className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}
