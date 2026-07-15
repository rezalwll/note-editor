"use client";

import { LoaderCircle } from "lucide-react";
import {
  useCallback,
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
} from "react";
import { flushSync } from "react-dom";

import { useContextMenu } from "@/components/context-menu";
import { NoteEditorBlock } from "@/components/editor/note-editor-block";
import { NoteEditorHeader } from "@/components/editor/note-editor-header";
import type { RichTextBlockHandle } from "@/components/editor/rich-text-block-editor";
import { useNoteEditorClipboard } from "@/components/editor/use-note-editor-clipboard";
import { useNoteEditorCommands } from "@/components/editor/use-note-editor-commands";
import { useNoteEditorHistory } from "@/components/editor/use-note-editor-history";
import { useNoteEditorLayout } from "@/components/editor/use-note-editor-layout";
import { useNoteEditorPersistence } from "@/components/editor/use-note-editor-persistence";
import {
  dispatchEditorCommand,
} from "@/lib/editor-events";
import {
  BLOCK_DEFAULT_WIDTH,
  BLOCK_MAX_WIDTH,
  BLOCK_MIN_WIDTH,
  BLOCK_RTL_CLICK_ANCHOR,
  IMAGE_MIN_WIDTH,
  PAGE_SIDE_PADDING_DESKTOP,
  PAGE_SIDE_PADDING_MOBILE,
  createBlockId,
  getBlockMaxWidth,
  getBlockRightGutter,
  getCanvasInset,
  getCurrentLineRange,
  getInitialBlocks,
  getRenderedBlockWidth,
  isEmptyTextBlock,
  isImageBlock,
  measureBlockWidth,
} from "@/lib/editor-document";
import { IncrementalBodyTextIndex } from "@/lib/incremental-body-text";
import { type FreeformBlock } from "@/lib/notes";
import { getNotebookTheme } from "@/lib/notebook-theme";
import { getPageDocumentTitle } from "@/lib/page-title";

type Attachment = {
  id: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
};

type NoteEditorProps = {
  userId: string;
  notebookId: string;
  notebookThemeKey?: string | null;
  pageId: string;
  initialTitle: string;
  initialHtml: string;
  initialUpdatedAt: string;
  attachments: Attachment[];
};

type CanvasCoordinates = {
  x: number;
  y: number;
  width: number;
};

const BULLET_PREFIX = "\u25CF ";
const TODO_PREFIX = "\u2610 ";
const TODO_DONE_PREFIX = "\u2611 ";
export function NoteEditor({
  userId,
  notebookId,
  notebookThemeKey,
  pageId,
  initialTitle,
  initialHtml,
  initialUpdatedAt,
  attachments: _initialAttachments,
}: NoteEditorProps) {
  const { openMenu } = useContextMenu();
  const notebookTheme = getNotebookTheme(notebookId, notebookThemeKey);
  const displayTimestamp = useMemo(
    () => new Date(initialUpdatedAt),
    [initialUpdatedAt],
  );
  const dateParts = new Intl.DateTimeFormat("fa-IR-u-ca-persian", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).formatToParts(displayTimestamp);
  const day = dateParts.find((part) => part.type === "day")?.value ?? "";
  const month = dateParts.find((part) => part.type === "month")?.value ?? "";
  const year = dateParts.find((part) => part.type === "year")?.value ?? "";
  const persianDateLabel = `${day} ${month} ${year}`;
  const persianTimeLabel = displayTimestamp.toLocaleTimeString("fa-IR", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  const [title, setTitle] = useState(initialTitle);
  const [blocks, setBlocks] = useState<FreeformBlock[]>(() =>
    getInitialBlocks(initialHtml),
  );
  const [bodyTextIndex] = useState(() => new IncrementalBodyTextIndex(blocks));
  const [documentRevision, setDocumentRevision] = useState(0);
  const replaceLayoutBlocksBridgeRef = useRef<
    (blocks: readonly FreeformBlock[]) => void
  >(() => undefined);
  const [activeBlockId, setActiveBlockId] = useState<string | null>(null);
  const [selectedBlockIds, setSelectedBlockIds] = useState<string[]>([]);
  const [richTextInitialSelections, setRichTextInitialSelections] = useState<
    Record<string, { start: number; end: number }>
  >({});
  const [activeRichTextStyle, setActiveRichTextStyle] = useState<{
    blockId: string;
    textColor: string;
    highlightColor: string;
    fontSize: number;
  } | null>(null);
  const pageRef = useRef<HTMLDivElement | null>(null);
  const titleInputRef = useRef<HTMLInputElement | null>(null);
  const imageFileInputRef = useRef<HTMLInputElement | null>(null);
  const textSelectionRef = useRef<
    Record<string, { start: number; end: number }>
  >({});
  const dragStateRef = useRef<{
    id: string;
    pointerOffsetX: number;
    pointerOffsetY: number;
  } | null>(null);
  const resizeStateRef = useRef<{
    id: string;
    edge: "left" | "right";
    startClientX: number;
    startX: number;
    startWidth: number;
  } | null>(null);
  const pagePointerStartRef = useRef<{
    pointerId: number;
    clientX: number;
    clientY: number;
  } | null>(null);

  const setEditedBlocks = useCallback<
    React.Dispatch<React.SetStateAction<FreeformBlock[]>>
  >((action) => {
    setDocumentRevision((current) => current + 1);
    setBlocks(action);
  }, []);
  const setEditedTitle = useCallback<
    React.Dispatch<React.SetStateAction<string>>
  >((action) => {
    setDocumentRevision((current) => current + 1);
    setTitle(action);
  }, []);
  const replaceDerivedDocumentState = useCallback(
    (nextBlocks: FreeformBlock[]) => {
      bodyTextIndex.replaceAll(nextBlocks);
      replaceLayoutBlocksBridgeRef.current(nextBlocks);
    },
    [bodyTextIndex],
  );
  const getIncrementalBodyText = useCallback(
    () => bodyTextIndex.getText(),
    [bodyTextIndex],
  );
  const {
    currentDocumentStateRef,
    finishHistoryGroup,
    historyRef,
    recordDocumentHistory,
    redoDocument,
    resetDocumentHistory,
    undoDocument,
  } = useNoteEditorHistory({
    title,
    blocks,
    activeBlockId,
    selectedBlockIds,
    pageRef,
    canRecord: () => isHydrated,
    markInteraction: () => markEditorInteraction(),
    setTitle: setEditedTitle,
    setBlocks: setEditedBlocks,
    setActiveBlockId,
    setSelectedBlockIds,
    clearRichTextState: () => {
      setActiveRichTextStyle(null);
      setRichTextInitialSelections({});
    },
    onDocumentApplied: replaceDerivedDocumentState,
  });
  const {
    flushPendingSave,
    isEditorMounted,
    isHydrated,
    markEditorInteraction,
  } = useNoteEditorPersistence({
    userId,
    notebookId,
    pageId,
    initialTitle,
    initialHtml,
    initialUpdatedAt,
    title,
    blocks,
    revision: documentRevision,
    getBodyText: getIncrementalBodyText,
    setTitle,
    setBlocks,
    getInitialBlocks,
    resetDocumentHistory,
    onDocumentLoaded: replaceDerivedDocumentState,
  });
  const {
    blockRefs,
    canvasRef,
    canvasWidth,
    desktopCanvasMinHeight,
    getCanvasRect,
    getTextBlockElement,
    isDesktopViewport,
    mobileCanvasMinHeight,
    queueSelectionRestore,
    renderedBlocks,
    removeLayoutBlocks,
    replaceLayoutBlocks,
    richTextBlockRefs,
    selectionRestoreRef,
    setBlockElement,
    setRichTextBlockHandle,
    shouldVirtualizeBlocks,
    upsertLayoutBlock,
  } = useNoteEditorLayout({ blocks, activeBlockId, isHydrated });
  useEffect(() => {
    replaceLayoutBlocksBridgeRef.current = replaceLayoutBlocks;
    return () => {
      replaceLayoutBlocksBridgeRef.current = () => undefined;
    };
  }, [replaceLayoutBlocks]);
  const {
    copyImageToClipboard,
    copyTextToClipboard,
    getSelectedBlocksText,
    handleEditorPaste,
    handleImageFileSelection,
    imageUploadError,
    pasteFromClipboard,
    pendingImageUploads,
  } = useNoteEditorClipboard({
    pageId,
    canvasWidth,
    blocks,
    activeBlockId,
    title,
    getCanvasRect,
    getTextBlockElement,
    getCanvasBoundedX,
    getCurrentBlocks: () => currentDocumentStateRef.current.blocks,
    getRichTextHandle: (blockId) => richTextBlockRefs.current[blockId] ?? null,
    focusTitleAt,
    restoreTextSelection,
    isEditorMounted,
    markEditorInteraction,
    recordDocumentHistory,
    setTitle: setEditedTitle,
    setBlocks: setEditedBlocks,
    setActiveBlockId,
    setSelectedBlockIds,
    updateBlockText,
    addBlockAt,
    onBlockInserted: (block) => {
      bodyTextIndex.upsert(block);
      upsertLayoutBlock(block);
    },
  });
  const activeBlock =
    blocks.find(
      (block) => block.id === activeBlockId && !isImageBlock(block),
    ) ?? null;

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

  function getCanvasBoundedX(
    targetCanvasWidth: number,
    desiredX: number,
    blockWidth: number,
  ) {
    const inset = getCanvasInset(targetCanvasWidth);
    const rightGutter = getBlockRightGutter(targetCanvasWidth);

    return Math.min(
      Math.max(inset, desiredX),
      Math.max(
        inset,
        targetCanvasWidth - blockWidth - rightGutter,
      ),
    );
  }

  useEffect(() => {
    document.title = getPageDocumentTitle(title);
  }, [title]);

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

  function getCanvasCoordinates(
    clientX: number,
    clientY: number,
    blockWidth = BLOCK_DEFAULT_WIDTH,
  ): CanvasCoordinates | null {
    if (!canvasRef.current || !pageRef.current) {
      return null;
    }

    const pageRect = pageRef.current.getBoundingClientRect();
    const canvasRect = canvasRef.current.getBoundingClientRect();
    const boundedBlockWidth = Math.min(blockWidth, getBlockMaxWidth(canvasRect.width));
    const x = getCanvasBoundedX(
      canvasRect.width,
      clientX - canvasRect.left - boundedBlockWidth + BLOCK_RTL_CLICK_ANCHOR,
      boundedBlockWidth,
    );
    const canvasOffsetTop = canvasRect.top - pageRect.top;
    const y = Math.max(24, clientY - pageRect.top - canvasOffsetTop);

    return { x, y, width: boundedBlockWidth };
  }

  function isEditorControlTarget(target: HTMLElement) {
    return Boolean(
      target.closest("[data-editor-block]") ||
      target.closest("[data-rich-text-editor]") ||
      target.closest('[contenteditable="true"]') ||
      target.closest("textarea") ||
      target.closest("button") ||
      target.closest("input"),
    );
  }

  function handlePagePointerDown(event: React.PointerEvent<HTMLDivElement>) {
    const target = event.target as HTMLElement;

    if (event.button !== 0 || isEditorControlTarget(target)) {
      pagePointerStartRef.current = null;
      return;
    }

    pagePointerStartRef.current = {
      pointerId: event.pointerId,
      clientX: event.clientX,
      clientY: event.clientY,
    };
  }

  function handlePagePointerUp(event: React.PointerEvent<HTMLDivElement>) {
    const target = event.target as HTMLElement;
    const pointerStart = pagePointerStartRef.current;
    pagePointerStartRef.current = null;

    if (!pointerStart || pointerStart.pointerId !== event.pointerId) {
      return;
    }

    const movedDistance = Math.hypot(
      event.clientX - pointerStart.clientX,
      event.clientY - pointerStart.clientY,
    );

    if (movedDistance > 8 || isEditorControlTarget(target)) {
      return;
    }

    event.preventDefault();

    const coordinates = getCanvasCoordinates(event.clientX, event.clientY);

    if (coordinates) {
      addBlockAt(coordinates.x, coordinates.y, true, coordinates.width);
    }
  }

  function handlePagePointerCancel() {
    pagePointerStartRef.current = null;
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
    updateBlock(id, (block) => {
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
    }, false);
  }

  function removeBlockIfEmpty(id: string) {
    markEditorInteraction();
    const target = blocks.find((block) => block.id === id);
    if (!target || target.text.trim()) {
      return;
    }

    bodyTextIndex.remove([id]);
    removeLayoutBlocks([id]);
    setBlocks((current) => {
      return current.filter((block) => block.id !== id);
    });
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
    event: React.KeyboardEvent<HTMLTextAreaElement>,
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
    const lengthDelta = nextSegment.length - segment.length;

    selectionRestoreRef.current = {
      id: blockId,
      start: selectionStart,
      end: selectionEnd + lengthDelta,
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
    const lines = segment.split("\n");

    const transformedLines = lines.map((line) => {
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
    const lengthDelta = nextSegment.length - segment.length;

    selectionRestoreRef.current = {
      id: blockId,
      start: selectionStart,
      end: selectionEnd + lengthDelta,
    };

    updateBlockText(blockId, nextText);
  }

  const handleBlockDrag = useEffectEvent((event: PointerEvent) => {
    if (!canvasRef.current || !dragStateRef.current) {
      return;
    }

    const rect = canvasRef.current.getBoundingClientRect();
    const currentBlock = blocks.find(
      (block) => block.id === dragStateRef.current?.id,
    );
    const blockWidth = currentBlock
      ? getRenderedBlockWidth(currentBlock, rect.width)
      : BLOCK_DEFAULT_WIDTH;
    const nextX = getCanvasBoundedX(
      rect.width,
      event.clientX - rect.left - dragStateRef.current.pointerOffsetX,
      blockWidth,
    );
    const nextY = Math.max(
      24,
      event.clientY - rect.top - dragStateRef.current.pointerOffsetY,
    );

    markEditorInteraction();
    setEditedBlocks((current) =>
      current.map((block) => {
        if (block.id !== dragStateRef.current?.id) {
          return block;
        }
        const nextBlock = { ...block, x: nextX, y: nextY, width: blockWidth };
        upsertLayoutBlock(nextBlock);
        return nextBlock;
      }),
    );
  });

  const handleBlockResize = useEffectEvent((event: PointerEvent) => {
    if (!canvasRef.current || !resizeStateRef.current) {
      return;
    }

    const rect = canvasRef.current.getBoundingClientRect();
    const currentBlock = blocks.find(
      (block) => block.id === resizeStateRef.current?.id,
    );

    if (!currentBlock) {
      return;
    }

    const resizeState = resizeStateRef.current;
    const minWidth = isImageBlock(currentBlock) ? IMAGE_MIN_WIDTH : BLOCK_MIN_WIDTH;
    const pointerDelta = event.clientX - resizeState.startClientX;
    const rightEdge = resizeState.startX + resizeState.startWidth;
    const maxWidth =
      resizeState.edge === "left"
        ? Math.max(minWidth, rightEdge - getCanvasInset(rect.width))
        : Math.max(
            minWidth,
            rect.width - resizeState.startX - getBlockRightGutter(rect.width),
          );
    const desiredWidth =
      resizeState.edge === "left"
        ? resizeState.startWidth - pointerDelta
        : resizeState.startWidth + pointerDelta;
    const nextWidth = Math.min(maxWidth, Math.max(minWidth, desiredWidth));
    const nextX =
      resizeState.edge === "left" ? rightEdge - nextWidth : resizeState.startX;

    markEditorInteraction();
    setEditedBlocks((current) =>
      current.map((block) => {
        if (block.id !== resizeStateRef.current?.id) {
          return block;
        }
        const nextBlock = { ...block, x: nextX, width: nextWidth };
        upsertLayoutBlock(nextBlock);
        return nextBlock;
      }),
    );
  });

  useEffect(() => {
    const handlePointerMove = (event: PointerEvent) => handleBlockDrag(event);
    const handleResizePointerMove = (event: PointerEvent) =>
      handleBlockResize(event);
    const handlePointerUp = () => {
      dragStateRef.current = null;
      resizeStateRef.current = null;
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointermove", handleResizePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointermove", handleResizePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, []);

  const { runEditorCommand } = useNoteEditorCommands({
    activeBlock,
    activeBlockId,
    activeRichTextStyle,
    blocks,
    selectedBlockIds,
    title,
    blockRefs,
    richTextBlockRefs,
    textSelectionRef,
    imageFileInputRef,
    historyRef,
    setRichTextInitialSelections,
    updateBlock,
    updateBlocksByIds,
    toggleSelectedLines,
    cycleTodoLines,
    deleteBlocks,
    undoDocument,
    redoDocument,
  });

  function startDraggingBlock(
    event: React.PointerEvent<HTMLButtonElement>,
    block: FreeformBlock,
  ) {
    if (!canvasRef.current) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    recordDocumentHistory();
    selectSingleBlock(block.id);

    const rect = canvasRef.current.getBoundingClientRect();
    const blockWidth = getRenderedBlockWidth(block, rect.width);
    const renderedX = getCanvasBoundedX(rect.width, block.x, blockWidth);
    dragStateRef.current = {
      id: block.id,
      pointerOffsetX: event.clientX - rect.left - renderedX,
      pointerOffsetY: event.clientY - rect.top - block.y,
    };
  }

  function startResizingBlock(
    event: React.PointerEvent<HTMLElement>,
    block: FreeformBlock,
    edge: "left" | "right" = "right",
  ) {
    if (!canvasRef.current) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    recordDocumentHistory();
    selectSingleBlock(block.id);
    resizeStateRef.current = {
      id: block.id,
      edge,
      startClientX: event.clientX,
      startX: block.x,
      startWidth: getRenderedBlockWidth(
        block,
        canvasRef.current.getBoundingClientRect().width,
      ),
    };
  }

  return (
    <div
      className="h-full bg-white"
      onPaste={handleEditorPaste}
    >
      <input
        ref={imageFileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        multiple
        className="hidden"
        onChange={handleImageFileSelection}
      />
      <div className="min-h-full w-full">
        <div
          ref={pageRef}
          onPointerDown={handlePagePointerDown}
          onPointerUp={handlePagePointerUp}
          onPointerCancel={handlePagePointerCancel}
          className="pt-0 flex min-h-full flex-col overflow-visible border-x-0 border-y bg-white pb-24 md:pt-4 md:min-h-[calc(100vh-136px)] md:rounded-[10px] md:border md:pb-[28vh]"
          style={{
            borderColor: notebookTheme.editorBorder,
            boxShadow: `0 1px 0 rgba(0,0,0,0.04), 0 14px 36px ${notebookTheme.editorGlow}`,
          }}
        >
          <NoteEditorHeader
            accentColor={notebookTheme.accent}
            dateLabel={persianDateLabel}
            timeLabel={persianTimeLabel}
            title={title}
            titleInputRef={titleInputRef}
            onTitleChange={(nextTitle) => {
              markEditorInteraction();
              recordDocumentHistory("title");
              setEditedTitle(nextTitle);
            }}
            onTitleBlur={() => {
              finishHistoryGroup();
              flushPendingSave("title-blur");
            }}
            onCopyTitle={copyTextToClipboard}
            onPasteTitle={(selectionStart, selectionEnd) =>
              pasteFromClipboard({
                targetTitle: true,
                selectionStart,
                selectionEnd,
              })
            }
          />

          <div
            ref={canvasRef}
            data-testid="note-canvas"
            data-layout-mode="freeform"
            data-virtualized={shouldVirtualizeBlocks ? "true" : "false"}
            data-rendered-block-count={renderedBlocks.length}
            data-total-block-count={blocks.length}
            className="freeform-canvas relative flex-1 bg-white"
            style={{
              minHeight: `${
                isDesktopViewport ? desktopCanvasMinHeight : mobileCanvasMinHeight
              }px`,
            }}
            onContextMenu={(event) => {
              const target = event.target as HTMLElement;

              if (isEditorControlTarget(target)) {
                return;
              }

              const coordinates = getCanvasCoordinates(
                event.clientX,
                event.clientY,
              );

              if (!coordinates) {
                return;
              }

              event.preventDefault();
              const selectedText = getSelectedBlocksText(selectedBlockIds);
              openMenu(event, {
                title:
                  selectedBlockIds.length > 1
                    ? `${selectedBlockIds.length} بلوک انتخاب شده`
                    : "ویرایشگر",
                items:
                  selectedBlockIds.length > 1
                    ? [
                        {
                          id: "copy-selected-blocks",
                          label: "کپی",
                          disabled: !selectedText,
                          onSelect: () =>
                            copyTextToClipboard(selectedText),
                        },
                        {
                          id: "paste-at-position",
                          label: "پیست",
                          onSelect: () =>
                            pasteFromClipboard({ placement: coordinates }),
                        },
                        { id: "separator-clipboard", separator: true },
                        {
                          id: "new-block",
                          label: "افزودن بلوک متن در اینجا",
                          onSelect: () =>
                            addBlockAt(coordinates.x, coordinates.y, true, coordinates.width),
                        },
                        { id: "separator-1", separator: true },
                        {
                          id: "delete-selected-blocks",
                          label: "حذف بلوک‌های انتخاب‌شده",
                          danger: true,
                          onSelect: () => deleteBlocks(selectedBlockIds),
                        },
                        {
                          id: "clear-selection",
                          label: "پاک کردن انتخاب",
                          onSelect: () => setSelectedBlockIds([]),
                        },
                      ]
                    : [
                        {
                          id: "copy-selected-block",
                          label: "کپی",
                          disabled: !selectedText,
                          onSelect: () =>
                            copyTextToClipboard(selectedText),
                        },
                        {
                          id: "paste-at-position",
                          label: "پیست",
                          onSelect: () =>
                            pasteFromClipboard({ placement: coordinates }),
                        },
                        { id: "separator-clipboard", separator: true },
                        {
                          id: "new-block",
                          label: "افزودن بلوک متن در اینجا",
                          onSelect: () =>
                            addBlockAt(coordinates.x, coordinates.y, true, coordinates.width),
                        },
                      ],
              });
            }}
          >
            <div
              className="pointer-events-none sticky top-3 z-30 flex justify-end px-4 md:px-8"
              aria-live="polite"
            >
              {pendingImageUploads > 0 ? (
                <span className="inline-flex items-center gap-2 rounded-full border border-[#b9d9c6] bg-white/95 px-3 py-1.5 text-xs font-medium text-[#35674a] shadow-sm">
                  <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
                  در حال بارگذاری تصویر
                </span>
              ) : imageUploadError ? (
                <span className="rounded-full border border-[#f0b8b8] bg-white/95 px-3 py-1.5 text-xs font-medium text-[#a43f3f] shadow-sm">
                  {imageUploadError}
                </span>
              ) : null}
            </div>

{renderedBlocks.map((block) => (
              <NoteEditorBlock
                key={block.id}
                block={block}
                canvasWidth={canvasWidth}
                selectedBlockIds={selectedBlockIds}
                notebookTheme={notebookTheme}
                richTextInitialSelections={richTextInitialSelections}
                setBlockRef={setBlockRef}
                setRichTextBlockRef={setRichTextBlockRef}
                textSelectionRef={textSelectionRef}
                getCanvasBoundedX={getCanvasBoundedX}
                selectSingleBlock={selectSingleBlock}
                startDraggingBlock={startDraggingBlock}
                startResizingBlock={startResizingBlock}
                copyImageToClipboard={copyImageToClipboard}
                pasteFromClipboard={pasteFromClipboard}
                deleteBlock={deleteBlock}
                updateBlock={updateBlock}
                finishHistoryGroup={finishHistoryGroup}
                removeBlockIfEmpty={removeBlockIfEmpty}
                flushPendingSave={flushPendingSave}
                updateBlockText={updateBlockText}
                setActiveRichTextStyle={setActiveRichTextStyle}
                openMenu={openMenu}
                copyTextToClipboard={copyTextToClipboard}
                handleBlockKeyDown={handleBlockKeyDown}
                toggleBlockSelection={toggleBlockSelection}
                getSelectedBlocksText={getSelectedBlocksText}
                runEditorCommand={runEditorCommand}
                setSelectedBlockIds={setSelectedBlockIds}
              />
            ))}

            {blocks.length === 0 ? (
              <div className="px-4 py-8 text-right text-sm text-[#8b8b8b] md:px-[48px]">
                روی هرجای صفحه کلیک کنید و نوشتن را شروع کنید.
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
