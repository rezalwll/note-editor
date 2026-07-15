"use client";

import {
  useCallback,
  useEffect,
  useEffectEvent,
  useRef,
  type Dispatch,
  type RefObject,
  type SetStateAction,
} from "react";

import {
  cloneDocumentSnapshot,
  type EditorDocumentSnapshot,
} from "@/lib/editor-document";
import type { FreeformBlock } from "@/lib/notes";

type DocumentState = {
  title: string;
  blocks: FreeformBlock[];
  activeBlockId: string | null;
  selectedBlockIds: string[];
};

type UseNoteEditorHistoryOptions = DocumentState & {
  pageRef: RefObject<HTMLDivElement | null>;
  canRecord: () => boolean;
  markInteraction: () => void;
  setTitle: Dispatch<SetStateAction<string>>;
  setBlocks: Dispatch<SetStateAction<FreeformBlock[]>>;
  setActiveBlockId: Dispatch<SetStateAction<string | null>>;
  setSelectedBlockIds: Dispatch<SetStateAction<string[]>>;
  clearRichTextState: () => void;
  onDocumentApplied: (blocks: FreeformBlock[]) => void;
};

export function useNoteEditorHistory({
  title,
  blocks,
  activeBlockId,
  selectedBlockIds,
  pageRef,
  canRecord,
  markInteraction,
  setTitle,
  setBlocks,
  setActiveBlockId,
  setSelectedBlockIds,
  clearRichTextState,
  onDocumentApplied,
}: UseNoteEditorHistoryOptions) {
  const historyRef = useRef<{
    past: EditorDocumentSnapshot[];
    future: EditorDocumentSnapshot[];
  }>({ past: [], future: [] });
  const lastHistoryActionRef = useRef<string | null>(null);
  const currentDocumentStateRef = useRef<DocumentState>({
    title,
    blocks,
    activeBlockId,
    selectedBlockIds,
  });

  useEffect(() => {
    currentDocumentStateRef.current = {
      title,
      blocks,
      activeBlockId,
      selectedBlockIds,
    };
  }, [activeBlockId, blocks, selectedBlockIds, title]);

  const resetDocumentHistory = useCallback(() => {
    historyRef.current = { past: [], future: [] };
    lastHistoryActionRef.current = null;
  }, []);

  function recordDocumentHistory(coalesceKey?: string) {
    if (!canRecord()) {
      return;
    }

    const shouldCoalesce = Boolean(
      coalesceKey && lastHistoryActionRef.current === coalesceKey,
    );
    if (!shouldCoalesce) {
      const current = currentDocumentStateRef.current;
      historyRef.current.past.push(
        cloneDocumentSnapshot(
          current.title,
          current.blocks,
          current.activeBlockId,
          current.selectedBlockIds,
        ),
      );
      if (historyRef.current.past.length > 100) {
        historyRef.current.past.shift();
      }
    }

    historyRef.current.future = [];
    lastHistoryActionRef.current = coalesceKey ?? null;
  }

  function finishHistoryGroup() {
    lastHistoryActionRef.current = null;
  }

  function applyDocumentSnapshot(nextSnapshot: EditorDocumentSnapshot) {
    const existingBlockIds = new Set(
      nextSnapshot.blocks.map((block) => block.id),
    );
    const nextActiveBlockId =
      nextSnapshot.activeBlockId &&
      existingBlockIds.has(nextSnapshot.activeBlockId)
        ? nextSnapshot.activeBlockId
        : null;
    const nextSelectedBlockIds = nextSnapshot.selectedBlockIds.filter((id) =>
      existingBlockIds.has(id),
    );

    currentDocumentStateRef.current = {
      title: nextSnapshot.title,
      blocks: nextSnapshot.blocks,
      activeBlockId: nextActiveBlockId,
      selectedBlockIds: nextSelectedBlockIds,
    };
    setTitle(nextSnapshot.title);
    setBlocks(nextSnapshot.blocks.map((block) => ({ ...block })));
    setActiveBlockId(nextActiveBlockId);
    setSelectedBlockIds(nextSelectedBlockIds);
    onDocumentApplied(nextSnapshot.blocks);
    clearRichTextState();
  }

  function undoDocument() {
    const previous = historyRef.current.past.pop();
    if (!previous) {
      return;
    }

    markInteraction();
    const current = currentDocumentStateRef.current;
    historyRef.current.future.push(
      cloneDocumentSnapshot(
        current.title,
        current.blocks,
        current.activeBlockId,
        current.selectedBlockIds,
      ),
    );
    lastHistoryActionRef.current = null;
    applyDocumentSnapshot(previous);
  }

  function redoDocument() {
    const next = historyRef.current.future.pop();
    if (!next) {
      return;
    }

    markInteraction();
    const current = currentDocumentStateRef.current;
    historyRef.current.past.push(
      cloneDocumentSnapshot(
        current.title,
        current.blocks,
        current.activeBlockId,
        current.selectedBlockIds,
      ),
    );
    lastHistoryActionRef.current = null;
    applyDocumentSnapshot(next);
  }

  const handleHistoryShortcut = useEffectEvent((event: KeyboardEvent) => {
    if (!(event.ctrlKey || event.metaKey) || event.altKey) {
      return;
    }

    const key = event.key.toLowerCase();
    const isUndo = key === "z" && !event.shiftKey;
    const isRedo = key === "y" || (key === "z" && event.shiftKey);
    if (!isUndo && !isRedo) {
      return;
    }

    const target = event.target;
    if (!(target instanceof Node) || !pageRef.current?.contains(target)) {
      return;
    }

    const canApply = isRedo
      ? historyRef.current.future.length > 0
      : historyRef.current.past.length > 0;
    if (!canApply) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    if (isRedo) {
      redoDocument();
    } else {
      undoDocument();
    }
  });

  useEffect(() => {
    const listener = (event: KeyboardEvent) => handleHistoryShortcut(event);
    window.addEventListener("keydown", listener, true);
    return () => window.removeEventListener("keydown", listener, true);
  }, []);

  return {
    currentDocumentStateRef,
    finishHistoryGroup,
    historyRef,
    recordDocumentHistory,
    redoDocument,
    resetDocumentHistory,
    undoDocument,
  };
}
