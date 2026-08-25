"use client";

import {
  type Dispatch,
  type KeyboardEvent,
  type RefObject,
  type SetStateAction,
} from "react";
import { flushSync } from "react-dom";

import type { RichTextBlockHandle } from "@/components/editor/rich-text-block-editor";
import {
  BLOCK_DEFAULT_WIDTH,
  createBlockId,
  getBlockHorizontalAnchor,
  getAnchoredBlockX,
  getCanvasBoundedX,
  getCurrentLineRange,
  getRenderedBlockWidth,
  getResponsiveBlockX,
  measureBlockWidth,
  toggleTodoMarkerAtPosition,
} from "@/lib/editor-document";
import type { IncrementalBodyTextIndex } from "@/lib/incremental-body-text";
import type { FreeformBlock } from "@/lib/notes";

const BULLET_PREFIX = "\u25CF ";
const TODO_PREFIX = "\u2610 ";
const TODO_DONE_PREFIX = "\u2611 ";
const PERSIAN_DIGITS =
  "\u06F0\u06F1\u06F2\u06F3\u06F4\u06F5\u06F6\u06F7\u06F8\u06F9";
const ARABIC_INDIC_DIGITS =
  "\u0660\u0661\u0662\u0663\u0664\u0665\u0666\u0667\u0668\u0669";

function toAsciiDigits(value: string) {
  return Array.from(value, (digit) => {
    const persianIndex = PERSIAN_DIGITS.indexOf(digit);
    if (persianIndex >= 0) return String(persianIndex);
    const arabicIndicIndex = ARABIC_INDIC_DIGITS.indexOf(digit);
    return arabicIndicIndex >= 0 ? String(arabicIndicIndex) : digit;
  }).join("");
}

function toPersianDigits(value: string) {
  return Array.from(toAsciiDigits(value), (digit) => {
    return PERSIAN_DIGITS[Number(digit)];
  }).join("");
}

function incrementListNumber(value: string) {
  const asciiValue = toAsciiDigits(value);
  const nextAsciiValue = String(Number.parseInt(asciiValue, 10) + 1).padStart(
    asciiValue.length,
    "0",
  );

  return toPersianDigits(nextAsciiValue);
}

function renumberNumberedListFrom(
  text: string,
  start: number,
  indentation: string,
  firstNumber: number,
) {
  const lines = text.slice(start).split("\n");
  let expectedNumber = firstNumber;

  for (let index = 0; index < lines.length; index += 1) {
    const match = lines[index].match(
      /^([ \t]*)([0-9\u06F0-\u06F9\u0660-\u0669]+)(\s*-\s+)/,
    );
    if (!match || match[1] !== indentation) {
      break;
    }

    lines[index] = `${match[1]}${toPersianDigits(String(expectedNumber))}${lines[
      index
    ].slice(match[1].length + match[2].length)}`;
    expectedNumber += 1;
  }

  return text.slice(0, start) + lines.join("\n");
}

type LinePrefixChange = {
  start: number;
  removedLength: number;
  insertedLength: number;
};

function mapPositionThroughPrefixChanges(
  position: number,
  changes: readonly LinePrefixChange[],
) {
  let offset = 0;

  for (const change of changes) {
    if (position < change.start) {
      break;
    }

    if (position <= change.start + change.removedLength) {
      return change.start + offset + change.insertedLength;
    }

    offset += change.insertedLength - change.removedLength;
  }

  return position + offset;
}

function transformSelectedLines(
  text: string,
  selectionStart: number,
  selectionEnd: number,
  transform: (line: string) => {
    value: string;
    removedLength: number;
    insertedLength: number;
  },
) {
  const lineStart = text.lastIndexOf("\n", selectionStart - 1) + 1;
  const lineEndIndex = text.indexOf("\n", selectionEnd);
  const lineEnd = lineEndIndex === -1 ? text.length : lineEndIndex;
  const segment = text.slice(lineStart, lineEnd);
  const changes: LinePrefixChange[] = [];
  let originalLineStart = lineStart;
  const transformedLines = segment.split("\n").map((line) => {
    const transformed = transform(line);
    changes.push({
      start: originalLineStart,
      removedLength: transformed.removedLength,
      insertedLength: transformed.insertedLength,
    });
    originalLineStart += line.length + 1;
    return transformed.value;
  });
  const nextSegment = transformedLines.join("\n");

  return {
    text: text.slice(0, lineStart) + nextSegment + text.slice(lineEnd),
    selectionStart: mapPositionThroughPrefixChanges(selectionStart, changes),
    selectionEnd: mapPositionThroughPrefixChanges(selectionEnd, changes),
  };
}

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
    const activeCanvasWidth =
      canvasRef.current?.getBoundingClientRect().width ?? canvasWidth;
    const block: FreeformBlock = {
      id: createBlockId(),
      x,
      y,
      width,
      horizontalAnchor: getBlockHorizontalAnchor(
        activeCanvasWidth,
        x,
        width,
      ),
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
        const renderedX = getResponsiveBlockX(block, activeCanvasWidth);
        const isStoredWidthConstrained =
          typeof block.width === "number" && block.width > previousWidth + 0.5;
        const shouldPreserveLegacyGeometry =
          typeof block.horizontalAnchor !== "number" &&
          (activeCanvasWidth < 768 || Math.abs(renderedX - block.x) > 0.5);

        if (
          block.manualWidth ||
          isStoredWidthConstrained ||
          shouldPreserveLegacyGeometry
        ) {
          return {
            ...block,
            text,
            ...(richText === undefined ? {} : { richText }),
          };
        }

        const nextWidth = isLegacyColumnBlock
          ? previousWidth
          : measureBlockWidth(text, activeCanvasWidth, textStyle);
        const widthDelta = nextWidth - previousWidth;
        const nextX =
          typeof block.horizontalAnchor === "number"
            ? getAnchoredBlockX(
                activeCanvasWidth,
                block.horizontalAnchor,
                nextWidth,
              )
            : getCanvasBoundedX(
                activeCanvasWidth,
                widthDelta === 0 ? renderedX : renderedX - widthDelta,
                nextWidth,
              );

        return {
          ...block,
          text,
          ...(richText === undefined ? {} : { richText }),
          x: nextX,
          width: isLegacyColumnBlock ? block.width : nextWidth,
          ...(isLegacyColumnBlock || typeof block.horizontalAnchor === "number"
            ? {}
            : {
                horizontalAnchor: getBlockHorizontalAnchor(
                  activeCanvasWidth,
                  nextX,
                  nextWidth,
                ),
              }),
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
    if (
      event.key !== "Enter" ||
      event.shiftKey ||
      event.nativeEvent.isComposing
    ) {
      return;
    }

    const element = event.currentTarget;
    const selectionStart = element.selectionStart ?? 0;
    const selectionEnd = element.selectionEnd ?? selectionStart;
    if (selectionStart !== selectionEnd) {
      return;
    }

    const { lineStart, lineEnd, lineText } = getCurrentLineRange(
      block.text,
      selectionStart,
    );
    const bulletMatch = lineText.match(/^([ \t]*)(?:\u25CF|\u2022)\s/);
    const todoMatch = lineText.match(/^([ \t]*)(\u2610|\u2611|\u2612)\s/);
    const numberedMatch = lineText.match(
      /^([ \t]*)([0-9\u06F0-\u06F9\u0660-\u0669]+)(\s*-\s+)/,
    );
    if (!bulletMatch && !todoMatch && !numberedMatch) {
      return;
    }

    event.preventDefault();
    const matchedPrefix =
      bulletMatch?.[0] ?? todoMatch?.[0] ?? numberedMatch?.[0] ?? "";
    const indentation =
      bulletMatch?.[1] ?? todoMatch?.[1] ?? numberedMatch?.[1] ?? "";
    if (!lineText.slice(matchedPrefix.length).trim()) {
      const nextText =
        block.text.slice(0, lineStart) +
        indentation +
        block.text.slice(lineEnd);
      const nextCursorPosition = lineStart + indentation.length;
      selectionRestoreRef.current = {
        id: block.id,
        start: nextCursorPosition,
        end: nextCursorPosition,
      };
      updateBlockText(block.id, nextText);
      return;
    }

    const numberedPrefix = numberedMatch
      ? `${numberedMatch[1]}${incrementListNumber(numberedMatch[2])}${numberedMatch[3]}`
      : "";
    const prefix = bulletMatch
      ? `${bulletMatch[1]}${BULLET_PREFIX}`
      : todoMatch
        ? `${todoMatch[1]}${TODO_PREFIX}`
        : numberedPrefix;
    const beforeCursor = numberedMatch
      ? `${block.text.slice(0, lineStart + numberedMatch[1].length)}${toPersianDigits(numberedMatch[2])}${block.text.slice(
          lineStart + numberedMatch[1].length + numberedMatch[2].length,
          selectionStart,
        )}`
      : block.text.slice(0, selectionStart);
    const afterCursor = block.text.slice(selectionStart);
    const insertedLineStart = beforeCursor.length + 1;
    const textWithInsertedItem = `${beforeCursor}\n${prefix}${afterCursor}`;
    const nextText = numberedMatch
      ? renumberNumberedListFrom(
          textWithInsertedItem,
          insertedLineStart,
          numberedMatch[1],
          Number.parseInt(toAsciiDigits(numberedMatch[2]), 10) + 1,
        )
      : textWithInsertedItem;
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
    const removablePrefixes = [prefix, ...alternatePrefixes];
    const selectedLineStart =
      currentText.lastIndexOf("\n", selectionStart - 1) + 1;
    const selectedLineEndIndex = currentText.indexOf("\n", selectionEnd);
    const selectedLineEnd =
      selectedLineEndIndex === -1 ? currentText.length : selectedLineEndIndex;
    const lines = currentText
      .slice(selectedLineStart, selectedLineEnd)
      .split("\n");
    const shouldRemove = lines.every((line) =>
      removablePrefixes.some((candidate) => line.startsWith(candidate)),
    );
    const transformed = transformSelectedLines(
      currentText,
      selectionStart,
      selectionEnd,
      (line) => {
        const removable = shouldRemove
          ? removablePrefixes.find((candidate) => line.startsWith(candidate))
          : undefined;
        return removable
          ? {
              value: line.slice(removable.length),
              removedLength: removable.length,
              insertedLength: 0,
            }
          : {
              value: `${prefix}${line}`,
              removedLength: 0,
              insertedLength: prefix.length,
            };
      },
    );
    selectionRestoreRef.current = {
      id: blockId,
      start: transformed.selectionStart,
      end: transformed.selectionEnd,
    };
    updateBlockText(blockId, transformed.text);
  }

  function cycleTodoLines(blockId: string) {
    const element = blockRefs.current[blockId];
    if (!element) {
      return;
    }

    const currentText = element.value;
    const selectionStart = element.selectionStart ?? 0;
    const selectionEnd = element.selectionEnd ?? selectionStart;
    const transformed = transformSelectedLines(
      currentText,
      selectionStart,
      selectionEnd,
      (line) => {
        if (line.startsWith(TODO_PREFIX)) {
          return {
            value: `${TODO_DONE_PREFIX}${line.slice(TODO_PREFIX.length)}`,
            removedLength: TODO_PREFIX.length,
            insertedLength: TODO_DONE_PREFIX.length,
          };
        }
        if (line.startsWith(TODO_DONE_PREFIX)) {
          return {
            value: line.slice(TODO_DONE_PREFIX.length),
            removedLength: TODO_DONE_PREFIX.length,
            insertedLength: 0,
          };
        }
        return {
          value: `${TODO_PREFIX}${line}`,
          removedLength: 0,
          insertedLength: TODO_PREFIX.length,
        };
      },
    );
    selectionRestoreRef.current = {
      id: blockId,
      start: transformed.selectionStart,
      end: transformed.selectionEnd,
    };
    updateBlockText(blockId, transformed.text);
  }

  function toggleTodoAtPosition(blockId: string, position: number) {
    const block = blocks.find((candidate) => candidate.id === blockId);
    if (!block || block.richText) {
      return false;
    }

    const toggled = toggleTodoMarkerAtPosition(block.text, position);
    if (!toggled) {
      return false;
    }

    selectionRestoreRef.current = {
      id: blockId,
      start: toggled.selectionPosition,
      end: toggled.selectionPosition,
    };
    updateBlock(blockId, (current) => ({
      ...current,
      text: toggled.text,
    }));
    return true;
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
    toggleTodoAtPosition,
    toggleSelectedLines,
    updateBlock,
    updateBlocksByIds,
    updateBlockText,
  };
}
