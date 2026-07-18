"use client";

import { useLayoutEffect, useMemo, useRef, useState } from "react";

import type { NotebookTab } from "@/components/section-tabs-model";
import { getOverflowNotebookIds } from "@/lib/notebook-tabs";

type UseSectionTabsOverflowOptions = {
  activeGroupNotebooks: NotebookTab[];
  activeNotebookId: string | null;
  editingNotebookId: string | null;
};

/** Measures wrapped tabs and exposes the visible/overflow partition. */
export function useSectionTabsOverflow({
  activeGroupNotebooks,
  activeNotebookId,
  editingNotebookId,
}: UseSectionTabsOverflowOptions) {
  const measureRef = useRef<HTMLDivElement | null>(null);
  const [overflowNotebookIds, setOverflowNotebookIds] = useState<string[]>([]);
  const signature = useMemo(
    () =>
      activeGroupNotebooks
        .map(
          (notebook) =>
            `${notebook.id}:${notebook.name}:${notebook.groupId ?? ""}`,
        )
        .join("|"),
    [activeGroupNotebooks],
  );

  useLayoutEffect(() => {
    const container = measureRef.current;
    if (!container) {
      return;
    }

    const notebookElements = Array.from(
      container.querySelectorAll<HTMLElement>("[data-measure-notebook-id]"),
    );
    if (notebookElements.length === 0) {
      setOverflowNotebookIds((current) =>
        current.length === 0 ? current : [],
      );
      return;
    }

    const pinnedNotebookId = editingNotebookId ?? activeNotebookId;
    const overflowIds = getOverflowNotebookIds(
      notebookElements
        .map((element) => {
          const notebookId = element.dataset.measureNotebookId;
          return notebookId
            ? { id: notebookId, rowTop: element.offsetTop }
            : null;
        })
        .filter((row): row is { id: string; rowTop: number } => row !== null),
      pinnedNotebookId,
    );

    setOverflowNotebookIds((current) =>
      current.join(",") === overflowIds.join(",") ? current : overflowIds,
    );
  }, [activeNotebookId, editingNotebookId, signature]);

  const visibleNotebooks = useMemo(() => {
    const hiddenIds = new Set(overflowNotebookIds);
    return activeGroupNotebooks.filter((notebook) => !hiddenIds.has(notebook.id));
  }, [activeGroupNotebooks, overflowNotebookIds]);
  const overflowNotebooks = useMemo(() => {
    const hiddenIds = new Set(overflowNotebookIds);
    return activeGroupNotebooks.filter((notebook) => hiddenIds.has(notebook.id));
  }, [activeGroupNotebooks, overflowNotebookIds]);

  return { measureRef, overflowNotebooks, visibleNotebooks };
}
