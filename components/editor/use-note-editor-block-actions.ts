"use client";

import {
  type Dispatch,
  type KeyboardEvent,
  type RefObject,
  type SetStateAction,
} from "react";
import { flushSync } from "react-dom";

import type { RichTextBlockHandle } from "@/components/editor/rich-text-block-editor";
import { getCanvasBoundedX } from "@/components/editor/use-note-editor-canvas-interactions";
import {
  BLOCK_DEFAULT_WIDTH,
  createBlockId,
  getCurrentLineRange,
  getRenderedBlockWidth,
  measureBlockWidth,
} from "@/lib/editor-document";
import type { IncrementalBodyTextIndex } from "@/lib/incremental-body-text";
import type { FreeformBlock } from "@/lib/notes";

const BULLET_PREFIX = "\u25CF ";
const TODO_PREFIX = "\u2610 ";
const TODO_DONE_PREFIX = "\u2611 ";

type UseNoteEditorBlockActionsOptions = {
  blocks: FreeformBlock[];
  canvasWidth: number;
  canvasRef: RefObject<HTMLDivElement | null>;
  titleInputRef: RefObject<HTMLInputElement | null>;
  blockRefs: RefObject<Record<string, HTMLTextAreaElement | null>>;
  richTextBlockRefs: RefObject<Record<string, RichTextBlockHandle | null>>;
  selectionRestoreRef: RefObject<{
    id: string;
    start: number;
    end: number;
  } | null>;
  bodyTextIndex: IncrementalBodyTextIndex;
  markEditorInteraction: () => void;
  recordDocumentHistory: (coalesceKey?: string) => void;
  setBlocks: Dispatch<SetStateAction<FreeformBlock[]>>;
  setEditedBlocks: Dispatch<SetStateAction<FreeformBlock[]>>;
  setActiveBlockId: Dispatch<SetStateAction<string | null>>;
  setSelectedBlockIds: Dispatch<SetStateAction<string[]>>;
  getTextBlockElement: (blockId: string) => HTMLElement | null;
  queueSelectionRestore: (blockId: string, start: number, end: number) => void;
  setBlockElement: (
    blockId: string,
    element: HTMLTextAreaElement | null,
  ) => void;
  setRichTextBlockHandle: (
    blockId: string,
    handle: RichTextBlockHandle | null,
  ) => void;
  upsertLayoutBlock: (block: FreeformBlock) => void;
  removeLayoutBlocks: (blockIds: readonly string[]) => void;
};

/**
 * Owns mutations that affect the editor's freeform blocks and keeps the
 * document, body-text index, and spatial layout index in sync.
 */
export function useNoteEditorBlockActions({
  blocks,
  canvasWidth,
  canvasRef,
  titleInputRef,
  blockRefs,
  richTextBlockRefs,
  selectionRestoreRef,
  bodyTextIndex,
  markEditorInteraction,
  recordDocumentHistory,
  setBlocks,
  setEditedBlocks,
  setActiveBlockId,
  setSelectedBlockIds,
  getTextBlockElement,
  queueSelectionRestore,
  setBlockElement,
  setRichTextBlockHandle,
  upsertLayoutBlock,
  removeLayoutBlocks,
}: UseNoteEditorBlockActionsOptions) {
  function focusTitleAt(caretPosition: number) {
    titleInputRef.current?.focus();
    titleInputRef.current?.setSelectionRange(caretPosition, caretPosition);
  }

  function restoreTextSelection(blockId: string, start: number, end: number) {
    queueSelectionRestore(blockId, start, end);
  }

  function setBlockRef(blockId: string, element: HTMLTextAreaElement | null) {
    setBlockElement(blockId, element);
  }

  function setRichTextBlockRef(
    blockId: string,
    handle: RichTextBlockHandle | null,
  ) {
    setRichTextBlockHandle(blockId, handle);
  }

  function focusBlockElement(blockId: string, caretPosition = 0) {
    const richTextHandle = richTextBlockRefs.current[blockId];
    if (richTextHandle) {
      richTextHandle.focus();
      return true;
    }

    const element = blockRefs.current[blockId];
    if (!element) {
      return false;
    }

    const boundedCaretPosition = Math.min(caretPosition, element.value.length);
    element.focus({ preventScroll: true });
    element.setSelectionRange(boundedCaretPosition, boundedCaretPosition);
    return document.activeElement === element;
  }

  function focusBlockWhenReady(blockId: string, caretPosition = 0) {
    if (focusBlockElement(blockId, caretPosition)) {
      return;
    }

    requestAnimationFrame(() => {
      focusBlockElement(blockId, caretPosition);
    });
  }

  function addBlockAt(
    x: number,
    y: number,
    shouldFocus = true,
    width = BLOCK_DEFAULT_WIDTH,
    initialText = "",
    initialRichText?: string,
  ) {
    const block: FreeformBlock = {
      id: createBlockId(),
      x,
      y,
      width,
      text: initialText,
      ...(initialRichText ? { richText: initialRichText } : {}),
      align: "right",
      direction: "rtl",
      textColor: "#222222",
      fontSize: 15,
    };

    const addBlock = () => {
      markEditorInteraction();
      recordDocumentHistory();
      if (block.type === "image" || block.text.trim()) {
        bodyTextIndex.upsert(block);
        upsertLayoutBlock(block);
        setEditedBlocks((current) => [...current, block]);
      } else {
        upsertLayoutBlock(block);
        setBlocks((current) => [...current, block]);
      }
      setActiveBlockId(block.id);
      setSelectedBlockIds([block.id]);
    };

    if (shouldFocus) {
      flushSync(addBlock);
      focusBlockWhenReady(block.id, initialText.length);
      return;
    }

    addBlock();
  }

  function updateBlock(
    id: string,
    updater: (block: FreeformBlock) => FreeformBlock,
    trackHistory = true,
  ) {
    markEditorInteraction();
    if (trackHistory) {
      recordDocumentHistory();
    }
    setEditedBlocks((current) =>
      current.map((block) => {
        if (block.id !== id) {
          return block;
        }
        const nextBlock = updater(block);
        bodyTextIndex.upsert(nextBlock);
        upsertLayoutBlock(nextBlock);
        return nextBlock;
      }),
    );
  }

  function updateBlocksByIds(
    ids: string[],
    updater: (block: FreeformBlock) => FreeformBlock,
    trackHistory = true,
  ) {
    markEditorInteraction();
    if (trackHistory) {
      recordDocumentHistory();
    }
    const targetIds = new Set(ids);
    setEditedBlocks((current) =>
      current.map((block) => {
        if (!targetIds.has(block.id)) {
          return block;
        }
        const nextBlock = updater(block);
        bodyTextIndex.upsert(nextBlock);
        upsertLayoutBlock(nextBlock);
        return nextBlock;
      }),
    );
  }

  function updateBlockText(id: string, text: string, richText?: string) {
    recordDocumentHistory(`text:${id}`);
    updateBlock(
      id,
      (block) => {
        const activeCanvasWidth =
          canvasRef.current?.getBoundingClientRect().width ?? canvasWidth;
        const textElement = getTextBlockElement(id);
        const textStyle = textElement
          ? window.getComputedStyle(textElement)
          : null;
        const isLegacyColumnBlock = typeof block.width !== "number";
        const previousWidth = getRenderedBlockWidth(block, activeCanvasWidth);
        const nextWidth = isLegacyColumnBlock
          ? previousWidth
          : measureBlockWidth(text, activeCanvasWidth, textStyle);
        const widthDelta = nextWidth - previousWidth;
        const nextX = getCanvasBoundedX(
          activeCanvasWidth,
          widthDelta === 0 ? block.x : block.x - widthDelta,
          nextWidth,
        );

        return {
          ...block,
          text,
          ...(richText === undefined ? {} : { richText }),
          x: nextX,
          width: isLegacyColumnBlock ? block.width : nextWidth,
        };
      },
      false,
    );
  }

  function removeBlockIfEmpty(id: string) {
    markEditorInteraction();
    const target = blocks.find((block) => block.id === id);
    if (!target || target.text.trim()) {
      return;
    }

    bodyTextIndex.remove([id]);
    removeLayoutBlocks([id]);
    setBlocks((current) => current.filter((block) => block.id !== id));
    setActiveBlockId((current) => (current === id ? null : current));
    setSelectedBlockIds((current) => current.filter((blockId) => blockId !== id));
  }

  function deleteBlock(id: string) {
    markEditorInteraction();
    recordDocumentHistory();
    bodyTextIndex.remove([id]);
    removeLayoutBlocks([id]);
    setEditedBlocks((current) => current.filter((block) => block.id !== id));
    setActiveBlockId((current) => (current === id ? null : current));
    setSelectedBlockIds((current) => current.filter((blockId) => blockId !== id));
  }

  function deleteBlocks(ids: string[]) {
    markEditorInteraction();
    recordDocumentHistory();
    bodyTextIndex.remove(ids);
    removeLayoutBlocks(ids);
    setEditedBlocks((current) =>
      current.filter((block) => !ids.includes(block.id)),
    );
    setActiveBlockId((current) =>
      current && ids.includes(current) ? null : current,
    );
    setSelectedBlockIds([]);
  }

  function toggleBlockSelection(blockId: string) {
    setSelectedBlockIds((current) =>
      current.includes(blockId)
        ? current.filter((id) => id !== blockId)
        : [...current, blockId],
    );
    setActiveBlockId(blockId);
  }

  function selectSingleBlock(blockId: string) {
    setSelectedBlockIds([blockId]);
    setActiveBlockId(blockId);
  }

  function handleBlockKeyDown(
    event: KeyboardEvent<HTMLTextAreaElement>,
    block: FreeformBlock,
  ) {
    if (event.key !== "Enter" || event.shiftKey) {
      return;
    }

    const element = event.currentTarget;
    const selectionStart = element.selectionStart ?? 0;
    const selectionEnd = element.selectionEnd ?? selectionStart;
    if (selectionStart !== selectionEnd) {
      return;
    }

    const { lineText } = getCurrentLineRange(block.text, selectionStart);
    const bulletMatch = lineText.match(/^([ \t]*)\u25CF\s/);
    const todoMatch = lineText.match(/^([ \t]*)(\u2610|\u2611)\s/);
    if (!bulletMatch && !todoMatch) {
      return;
    }

    event.preventDefault();
    const prefix = bulletMatch
      ? `${bulletMatch[1]}${BULLET_PREFIX}`
      : `${todoMatch?.[1] ?? ""}${TODO_PREFIX}`;
    const beforeCursor = block.text.slice(0, selectionStart);
    const afterCursor = block.text.slice(selectionStart);
    const nextText = `${beforeCursor}\n${prefix}${afterCursor}`;
    const nextCursorPosition = selectionStart + 1 + prefix.length;

    selectionRestoreRef.current = {
      id: block.id,
      start: nextCursorPosition,
      end: nextCursorPosition,
    };
    updateBlockText(block.id, nextText);
  }

  function toggleSelectedLines(
    blockId: string,
    prefix: string,
    alternatePrefixes: string[] = [],
  ) {
    const element = blockRefs.current[blockId];
    if (!element) {
      return;
    }

    const currentText = element.value;
    const selectionStart = element.selectionStart ?? 0;
    const selectionEnd = element.selectionEnd ?? selectionStart;
    const lineStart = currentText.lastIndexOf("\n", selectionStart - 1) + 1;
    const lineEndIndex = currentText.indexOf("\n", selectionEnd);
    const lineEnd = lineEndIndex === -1 ? currentText.length : lineEndIndex;
    const segment = currentText.slice(lineStart, lineEnd);
    const lines = segment.split("\n");
    const removablePrefixes = [prefix, ...alternatePrefixes];
    const shouldRemove = lines.every((line) =>
      removablePrefixes.some((candidate) => line.startsWith(candidate)),
    );
    const transformedLines = lines.map((line) => {
      if (shouldRemove) {
        const removable = removablePrefixes.find((candidate) =>
          line.startsWith(candidate),
        );
        return removable ? line.slice(removable.length) : line;
      }
      return `${prefix}${line}`;
    });

    const nextSegment = transformedLines.join("\n");
    const nextText =
      currentText.slice(0, lineStart) + nextSegment + currentText.slice(lineEnd);
    selectionRestoreRef.current = {
      id: blockId,
      start: selectionStart,
      end: selectionEnd + nextSegment.length - segment.length,
    };
    updateBlockText(blockId, nextText);
  }

  function cycleTodoLines(blockId: string) {
    const element = blockRefs.current[blockId];
    if (!element) {
      return;
    }

    const currentText = element.value;
    const selectionStart = element.selectionStart ?? 0;
    const selectionEnd = element.selectionEnd ?? selectionStart;
    const lineStart = currentText.lastIndexOf("\n", selectionStart - 1) + 1;
    const lineEndIndex = currentText.indexOf("\n", selectionEnd);
    const lineEnd = lineEndIndex === -1 ? currentText.length : lineEndIndex;
    const segment = currentText.slice(lineStart, lineEnd);
    const transformedLines = segment.split("\n").map((line) => {
      if (line.startsWith(TODO_PREFIX)) {
        return `${TODO_DONE_PREFIX}${line.slice(TODO_PREFIX.length)}`;
      }
      if (line.startsWith(TODO_DONE_PREFIX)) {
        return line.slice(TODO_DONE_PREFIX.length);
      }
      return `${TODO_PREFIX}${line}`;
    });

    const nextSegment = transformedLines.join("\n");
    const nextText =
      currentText.slice(0, lineStart) + nextSegment + currentText.slice(lineEnd);
    selectionRestoreRef.current = {
      id: blockId,
      start: selectionStart,
      end: selectionEnd + nextSegment.length - segment.length,
    };
    updateBlockText(blockId, nextText);
  }

  return {
    addBlockAt,
    cycleTodoLines,
    deleteBlock,
    deleteBlocks,
    focusTitleAt,
    handleBlockKeyDown,
    removeBlockIfEmpty,
    restoreTextSelection,
    selectSingleBlock,
    setBlockRef,
    setRichTextBlockRef,
    toggleBlockSelection,
    toggleSelectedLines,
    updateBlock,
    updateBlocksByIds,
    updateBlockText,
  };
}
