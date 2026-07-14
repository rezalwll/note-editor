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
import type { RichTextBlockHandle } from "@/components/editor/rich-text-block-editor";
import { useNoteEditorClipboard } from "@/components/editor/use-note-editor-clipboard";
import { useNoteEditorPersistence } from "@/components/editor/use-note-editor-persistence";
import {
  dispatchEditorCommand,
  type EditorCommand,
} from "@/lib/editor-events";
import {
  BLOCK_DEFAULT_WIDTH,
  BLOCK_MAX_WIDTH,
  BLOCK_MIN_WIDTH,
  BLOCK_RTL_CLICK_ANCHOR,
  DEFAULT_CANVAS_WIDTH,
  DEFAULT_VIEWPORT_HEIGHT,
  type EditorDocumentSnapshot,
  IMAGE_MIN_WIDTH,
  PAGE_SIDE_PADDING_DESKTOP,
  PAGE_SIDE_PADDING_MOBILE,
  cloneDocumentSnapshot,
  createBlockId,
  createRichTextSelectionHtml,
  estimateBlockHeight,
  getBlockMaxWidth,
  getBlockRightGutter,
  getCanvasInset,
  getCurrentLineRange,
  getImageBlockHeight,
  getInitialBlocks,
  getPersistableBlocks,
  getRenderedBlockWidth,
  isEmptyTextBlock,
  isImageBlock,
  measureBlockWidth,
} from "@/lib/editor-document";
import {
  type FreeformBlock,
  extractFreeformPlainText,
  parseFreeformDocument,
  serializeFreeformDocument,
} from "@/lib/notes";
import { getNotebookTheme } from "@/lib/notebook-theme";
import { getPageDocumentTitle } from "@/lib/page-title";
import { getVisibleSpatialItems } from "@/lib/virtualization";

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
const BLOCK_VIRTUALIZATION_THRESHOLD = 120;
const BLOCK_VIRTUALIZATION_OVERSCAN = 800;
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
  const [isDesktopViewport, setIsDesktopViewport] = useState(true);
  const [canvasWidth, setCanvasWidth] = useState(DEFAULT_CANVAS_WIDTH);
  const [viewportHeight, setViewportHeight] = useState(DEFAULT_VIEWPORT_HEIGHT);
  const [lowestBlockBottom, setLowestBlockBottom] = useState(0);
  const [blockViewport, setBlockViewport] = useState({
    top: 0,
    bottom: DEFAULT_VIEWPORT_HEIGHT,
  });
  const pageRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const titleInputRef = useRef<HTMLInputElement | null>(null);
  const imageFileInputRef = useRef<HTMLInputElement | null>(null);
  const blockRefs = useRef<Record<string, HTMLTextAreaElement | null>>({});
  const richTextBlockRefs = useRef<Record<string, RichTextBlockHandle | null>>({});
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
  const historyRef = useRef<{
    past: EditorDocumentSnapshot[];
    future: EditorDocumentSnapshot[];
  }>({ past: [], future: [] });
  const lastHistoryActionRef = useRef<string | null>(null);
  const currentDocumentStateRef = useRef({
    title,
    blocks,
    activeBlockId,
    selectedBlockIds,
  });
  const selectionRestoreRef = useRef<{
    id: string;
    start: number;
    end: number;
  } | null>(null);

  const pagePointerStartRef = useRef<{
    pointerId: number;
    clientX: number;
    clientY: number;
  } | null>(null);

  const serializedDocument = useMemo(
    () =>
      serializeFreeformDocument({
        type: "freeform-v1",
        blocks: getPersistableBlocks(blocks),
      }),
    [blocks],
  );

  const bodyText = useMemo(() => {
    const freeformDocument = parseFreeformDocument(serializedDocument);
    return freeformDocument
      ? extractFreeformPlainText(freeformDocument)
      : "";
  }, [serializedDocument]);
  const mobileCanvasMinHeight = Math.max(viewportHeight - 256, lowestBlockBottom + 280);
  const desktopCanvasMinHeight = Math.max(viewportHeight - 240, lowestBlockBottom + 360);

  const snapshot = `${title}::${serializedDocument}`;
  const resetDocumentHistory = useCallback(() => {
    historyRef.current = { past: [], future: [] };
    lastHistoryActionRef.current = null;
  }, []);
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
    bodyText,
    serializedDocument,
    snapshot,
    setTitle,
    setBlocks,
    getInitialBlocks,
    resetDocumentHistory,
  });
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
    setTitle,
    setBlocks,
    setActiveBlockId,
    setSelectedBlockIds,
    updateBlockText,
    addBlockAt,
  });
  const activeBlock =
    blocks.find(
      (block) => block.id === activeBlockId && !isImageBlock(block),
    ) ?? null;
  const shouldVirtualizeBlocks =
    blocks.length >= BLOCK_VIRTUALIZATION_THRESHOLD;
  const renderedBlocks = useMemo(
    () =>
      shouldVirtualizeBlocks
        ? getVisibleSpatialItems(
            blocks,
            {
              ...blockViewport,
              overscan: BLOCK_VIRTUALIZATION_OVERSCAN,
            },
            (block) => ({
              top: block.y,
              height: estimateBlockHeight(block, canvasWidth),
            }),
            (block) => block.id === activeBlockId,
          )
        : blocks,
    [
      activeBlockId,
      blockViewport,
      blocks,
      canvasWidth,
      shouldVirtualizeBlocks,
    ],
  );

  function getTextBlockElement(blockId: string) {
    return (
      blockRefs.current[blockId] ??
      richTextBlockRefs.current[blockId]?.getElement() ??
      null
    );
  }

  function getCanvasRect() {
    return canvasRef.current?.getBoundingClientRect() ?? null;
  }

  const updateBlockViewport = useCallback(() => {
    const canvas = canvasRef.current;

    if (!canvas) {
      return;
    }

    const rect = canvas.getBoundingClientRect();
    const nextTop = Math.max(0, -rect.top);
    const nextBottom = Math.max(
      nextTop,
      Math.min(rect.height || Number.POSITIVE_INFINITY, window.innerHeight - rect.top),
    );

    setBlockViewport((current) =>
      Math.abs(current.top - nextTop) < 1 &&
      Math.abs(current.bottom - nextBottom) < 1
        ? current
        : { top: nextTop, bottom: nextBottom },
    );
  }, []);

  useEffect(() => {
    if (!shouldVirtualizeBlocks) {
      return;
    }

    let frameId: number | null = null;
    const scheduleUpdate = () => {
      if (frameId !== null) {
        return;
      }

      frameId = window.requestAnimationFrame(() => {
        frameId = null;
        updateBlockViewport();
      });
    };

    scheduleUpdate();
    window.addEventListener("scroll", scheduleUpdate, true);
    window.addEventListener("resize", scheduleUpdate);

    return () => {
      if (frameId !== null) {
        window.cancelAnimationFrame(frameId);
      }
      window.removeEventListener("scroll", scheduleUpdate, true);
      window.removeEventListener("resize", scheduleUpdate);
    };
  }, [shouldVirtualizeBlocks, updateBlockViewport]);

  function focusTitleAt(caretPosition: number) {
    titleInputRef.current?.focus();
    titleInputRef.current?.setSelectionRange(caretPosition, caretPosition);
  }

  function restoreTextSelection(blockId: string, start: number, end: number) {
    selectionRestoreRef.current = { id: blockId, start, end };
  }

  function setBlockRef(blockId: string, element: HTMLTextAreaElement | null) {
    blockRefs.current[blockId] = element;
  }

  function setRichTextBlockRef(
    blockId: string,
    handle: RichTextBlockHandle | null,
  ) {
    richTextBlockRefs.current[blockId] = handle;
  }

  useEffect(() => {
    currentDocumentStateRef.current = {
      title,
      blocks,
      activeBlockId,
      selectedBlockIds,
    };
  }, [activeBlockId, blocks, selectedBlockIds, title]);

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

  function recordDocumentHistory(coalesceKey?: string) {
    if (!isHydrated) {
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

  useEffect(() => {
    document.title = getPageDocumentTitle(title);
  }, [title]);

  useEffect(() => {
    if (!isHydrated || !activeBlockId) {
      return;
    }

    const richTextHandle = richTextBlockRefs.current[activeBlockId];
    if (richTextHandle) {
      const richTextElement = richTextHandle.getElement();
      if (!richTextElement?.contains(document.activeElement)) {
        richTextHandle.focus();
      }
      return;
    }

    const element = blockRefs.current[activeBlockId];
    if (!element || document.activeElement === element) {
      return;
    }

    element.focus();
  }, [activeBlockId, isHydrated]);

  useEffect(() => {
    Object.values(blockRefs.current).forEach((element) => {
      if (!element) {
        return;
      }

      element.style.height = "0px";
      element.style.height = `${Math.max(element.scrollHeight, 28)}px`;
    });

    if (!selectionRestoreRef.current) {
      const nextLowestBlockBottom = blocks.reduce((max, block) => {
        const element = getTextBlockElement(block.id);
        const blockWidth = getRenderedBlockWidth(block, canvasWidth);
        const blockHeight = isImageBlock(block)
          ? getImageBlockHeight(block, blockWidth)
          : Math.max(
              element?.scrollHeight ?? 28,
              element?.offsetHeight ?? 28,
              estimateBlockHeight(block, canvasWidth),
              28,
            );
        return Math.max(max, block.y + blockHeight);
      }, 0);

      setLowestBlockBottom(nextLowestBlockBottom);
      return;
    }

    const restore = selectionRestoreRef.current;
    const element = blockRefs.current[restore.id];
    selectionRestoreRef.current = null;

    if (!element) {
      return;
    }

    element.focus();
    element.setSelectionRange(restore.start, restore.end);

    const nextLowestBlockBottom = blocks.reduce((max, block) => {
      const blockElement = getTextBlockElement(block.id);
      const blockWidth = getRenderedBlockWidth(block, canvasWidth);
      const blockHeight = isImageBlock(block)
        ? getImageBlockHeight(block, blockWidth)
        : Math.max(
            blockElement?.scrollHeight ?? 28,
            blockElement?.offsetHeight ?? 28,
            estimateBlockHeight(block, canvasWidth),
            28,
          );
      return Math.max(max, block.y + blockHeight);
    }, 0);

    setLowestBlockBottom(nextLowestBlockBottom);
  }, [blocks, canvasWidth]);

  useEffect(() => {
    const normalizeBlockLayout = () => {
      const canvasWidth = canvasRef.current?.getBoundingClientRect().width;

      if (!canvasWidth) {
        return;
      }

      setCanvasWidth(canvasWidth);
      setViewportHeight(window.visualViewport?.height ?? window.innerHeight);
      setIsDesktopViewport(canvasWidth >= 768);
    };
    let animationFrameId: number | null = null;
    const scheduleNormalizeBlockLayout = () => {
      if (animationFrameId !== null) {
        cancelAnimationFrame(animationFrameId);
      }

      animationFrameId = requestAnimationFrame(() => {
        animationFrameId = null;
        normalizeBlockLayout();
      });
    };

    normalizeBlockLayout();
    const resizeObserver =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(scheduleNormalizeBlockLayout);
    const visualViewport = window.visualViewport;

    if (canvasRef.current) {
      resizeObserver?.observe(canvasRef.current);
    }

    window.addEventListener("resize", scheduleNormalizeBlockLayout);
    visualViewport?.addEventListener("resize", scheduleNormalizeBlockLayout);
    return () => {
      if (animationFrameId !== null) {
        cancelAnimationFrame(animationFrameId);
      }

      resizeObserver?.disconnect();
      window.removeEventListener("resize", scheduleNormalizeBlockLayout);
      visualViewport?.removeEventListener("resize", scheduleNormalizeBlockLayout);
    };
  }, []);

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
      setBlocks((current) => [...current, block]);
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
    setBlocks((current) =>
      current.map((block) => (block.id === id ? updater(block) : block)),
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
    setBlocks((current) =>
      current.map((block) => (ids.includes(block.id) ? updater(block) : block)),
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

    setBlocks((current) => {
      return current.filter((block) => block.id !== id);
    });
    setActiveBlockId((current) => (current === id ? null : current));
    setSelectedBlockIds((current) => current.filter((blockId) => blockId !== id));
  }

  function deleteBlock(id: string) {
    markEditorInteraction();
    recordDocumentHistory();
    setBlocks((current) => current.filter((block) => block.id !== id));
    setActiveBlockId((current) => (current === id ? null : current));
    setSelectedBlockIds((current) => current.filter((blockId) => blockId !== id));
  }

  function deleteBlocks(ids: string[]) {
    markEditorInteraction();
    recordDocumentHistory();
    setBlocks((current) =>
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
    setBlocks((current) =>
      current.map((block) =>
        block.id === dragStateRef.current?.id
          ? { ...block, x: nextX, y: nextY, width: blockWidth }
          : block,
      ),
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
    setBlocks((current) =>
      current.map((block) =>
        block.id === resizeStateRef.current?.id
          ? { ...block, x: nextX, width: nextWidth }
          : block,
      ),
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

  function applyDocumentSnapshot(nextSnapshot: EditorDocumentSnapshot) {
    const existingBlockIds = new Set(nextSnapshot.blocks.map((block) => block.id));
    const nextActiveBlockId =
      nextSnapshot.activeBlockId && existingBlockIds.has(nextSnapshot.activeBlockId)
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
    setActiveRichTextStyle(null);
    setRichTextInitialSelections({});
  }

  function undoDocument() {
    const previous = historyRef.current.past.pop();
    if (!previous) {
      return;
    }

    markEditorInteraction();
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

    markEditorInteraction();
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

  function applyInlineTextStyle(
    blockId: string,
    style: { textColor?: string; highlightColor?: string; fontSize?: number },
  ) {
    const richTextHandle = richTextBlockRefs.current[blockId];
    if (richTextHandle) {
      if (style.textColor) {
        richTextHandle.setTextColor(style.textColor);
      }
      if (style.highlightColor) {
        richTextHandle.setHighlightColor(style.highlightColor);
      }
      if (style.fontSize) {
        richTextHandle.setFontSize(style.fontSize);
      }
      return true;
    }

    const selection = textSelectionRef.current[blockId];
    if (!selection || selection.start === selection.end) {
      return false;
    }

    setRichTextInitialSelections((current) => ({
      ...current,
      [blockId]: selection,
    }));
    updateBlock(blockId, (block) => ({
      ...block,
      richText: createRichTextSelectionHtml(
        block.text,
        selection.start,
        selection.end,
        style,
      ),
    }));
    return true;
  }

  function runEditorCommand(
    command: EditorCommand,
    payload?: {
      textColor?: string;
      highlightColor?: string;
      fontSize?: number;
      targetBlockIds?: string[];
      primaryBlockId?: string | null;
    },
  ) {
    if (command === "undo") {
      undoDocument();
      return;
    }

    if (command === "redo") {
      redoDocument();
      return;
    }

    if (command === "insert-image") {
      imageFileInputRef.current?.click();
      return;
    }

    const targetIds =
      payload?.targetBlockIds && payload.targetBlockIds.length > 0
        ? payload.targetBlockIds
        : selectedBlockIds.length > 0
        ? selectedBlockIds
        : activeBlockId
          ? [activeBlockId]
          : [];

    if (targetIds.length === 0) {
      return;
    }

    const primaryBlockId = payload?.primaryBlockId ?? activeBlockId ?? targetIds[0];
    const activeRichTextHandle = primaryBlockId
      ? richTextBlockRefs.current[primaryBlockId]
      : null;
    const activeElement = primaryBlockId ? blockRefs.current[primaryBlockId] : null;
    activeRichTextHandle?.focus();
    activeElement?.focus();

    switch (command) {
      case "toggle-bold":
        updateBlocksByIds(targetIds, (block) => ({
          ...block,
          bold: !(block.bold ?? false),
        }));
        return;
      case "toggle-italic":
        updateBlocksByIds(targetIds, (block) => ({
          ...block,
          italic: !(block.italic ?? false),
        }));
        return;
      case "toggle-bullet-list":
        if (primaryBlockId) {
          toggleSelectedLines(primaryBlockId, BULLET_PREFIX);
        }
        return;
      case "toggle-todo-list":
        if (primaryBlockId) {
          cycleTodoLines(primaryBlockId);
        }
        return;
      case "align-right":
        updateBlocksByIds(targetIds, (block) => ({ ...block, align: "right" }));
        return;
      case "align-center":
        updateBlocksByIds(targetIds, (block) => ({ ...block, align: "center" }));
        return;
      case "align-justify":
        updateBlocksByIds(targetIds, (block) => ({ ...block, align: "justify" }));
        return;
      case "set-direction-rtl":
        updateBlocksByIds(targetIds, (block) =>
          isImageBlock(block) ? block : { ...block, direction: "rtl" },
        );
        return;
      case "set-direction-ltr":
        updateBlocksByIds(targetIds, (block) =>
          isImageBlock(block) ? block : { ...block, direction: "ltr" },
        );
        return;
      case "set-text-color":
        if (
          primaryBlockId &&
          applyInlineTextStyle(primaryBlockId, {
            textColor: payload?.textColor ?? "#222222",
          })
        ) {
          return;
        }
        updateBlocksByIds(targetIds, (block) => ({
          ...block,
          textColor: payload?.textColor ?? "#222222",
        }));
        return;
      case "set-highlight-color":
        if (
          primaryBlockId &&
          applyInlineTextStyle(primaryBlockId, {
            highlightColor: payload?.highlightColor ?? "#fff2a8",
          })
        ) {
          return;
        }
        updateBlocksByIds(targetIds, (block) => ({
          ...block,
          richText: createRichTextSelectionHtml(block.text, 0, block.text.length, {
            highlightColor: payload?.highlightColor ?? "#fff2a8",
          }),
        }));
        return;
      case "set-font-size":
        if (
          primaryBlockId &&
          applyInlineTextStyle(primaryBlockId, {
            fontSize: Math.min(32, Math.max(13, payload?.fontSize ?? 15)),
          })
        ) {
          return;
        }
        updateBlocksByIds(targetIds, (block) => ({
          ...block,
          fontSize: Math.min(32, Math.max(13, payload?.fontSize ?? 15)),
        }));
        return;
      case "delete-block":
        deleteBlocks(targetIds);
        return;
    }
  }

  const handleEditorCommandEvent = useEffectEvent(
    (
      command: EditorCommand,
      payload?: {
        textColor?: string;
        highlightColor?: string;
        fontSize?: number;
        targetBlockIds?: string[];
        primaryBlockId?: string | null;
      },
    ) => {
      runEditorCommand(command, payload);
    },
  );

  useEffect(() => {
    const listener = (event: Event) => {
      const customEvent = event as CustomEvent<{
        command: EditorCommand;
        textColor?: string;
        highlightColor?: string;
        fontSize?: number;
      }>;
      handleEditorCommandEvent(customEvent.detail.command, {
        textColor: customEvent.detail.textColor,
        highlightColor: customEvent.detail.highlightColor,
        fontSize: customEvent.detail.fontSize,
      });
    };

    window.addEventListener("note-editor-command", listener);
    return () => window.removeEventListener("note-editor-command", listener);
  }, []);

  useEffect(() => {
    const dispatchToolbarState = () => {
      window.dispatchEvent(
        new CustomEvent("note-editor-state", {
          detail: {
            hasActiveBlock: Boolean(activeBlock),
            canInsertImage: true,
            canUndo: historyRef.current.past.length > 0,
            canRedo: historyRef.current.future.length > 0,
            align: activeBlock?.align ?? "right",
            direction: activeBlock?.direction ?? "rtl",
            bold: activeBlock?.bold ?? false,
            italic: activeBlock?.italic ?? false,
            textColor:
              activeRichTextStyle?.blockId === activeBlock?.id
                ? activeRichTextStyle?.textColor ?? "#222222"
                : activeBlock?.textColor ?? "#222222",
            highlightColor:
              activeRichTextStyle?.blockId === activeBlock?.id
                ? activeRichTextStyle?.highlightColor ?? "transparent"
                : "transparent",
            fontSize:
              activeRichTextStyle?.blockId === activeBlock?.id
                ? activeRichTextStyle?.fontSize ?? 15
                : activeBlock?.fontSize ?? 15,
            selectionCount: selectedBlockIds.length,
          },
        }),
      );
    };

    dispatchToolbarState();
    const animationFrameId = requestAnimationFrame(dispatchToolbarState);
    return () => cancelAnimationFrame(animationFrameId);
  }, [activeBlock, activeRichTextStyle, blocks, selectedBlockIds.length, title]);

  useEffect(
    () => () => {
      window.dispatchEvent(
        new CustomEvent("note-editor-state", {
          detail: {
            hasActiveBlock: false,
            canInsertImage: false,
            canUndo: false,
            canRedo: false,
          },
        }),
      );
    },
    [],
  );

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
          <div className="px-4 pt-5 text-right md:px-[48px] md:pt-6" dir="rtl">
            <div
              className="w-full border-b align-top"
              style={{ borderColor: notebookTheme.accent }}
            >
              <input
                ref={titleInputRef}
                value={title}
                onChange={(event) => {
                  markEditorInteraction();
                  recordDocumentHistory("title");
                  setTitle(event.target.value);
                }}
                onBlur={() => {
                  finishHistoryGroup();
                  flushPendingSave("title-blur");
                }}
                onContextMenu={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  const selectionStart =
                    event.currentTarget.selectionStart ?? 0;
                  const selectionEnd =
                    event.currentTarget.selectionEnd ?? selectionStart;
                  const selectedText =
                    selectionStart !== selectionEnd
                      ? title.slice(selectionStart, selectionEnd)
                      : title;

                  openMenu(event, {
                    title: "عنوان صفحه",
                    items: [
                      {
                        id: "copy-title",
                        label: "کپی",
                        disabled: !selectedText,
                        onSelect: () =>
                          copyTextToClipboard(selectedText),
                      },
                      {
                        id: "paste-title",
                        label: "پیست",
                        onSelect: () =>
                          pasteFromClipboard({
                            targetTitle: true,
                            selectionStart,
                            selectionEnd,
                          }),
                      },
                    ],
                  });
                }}
                placeholder="صفحه بدون عنوان"
                className="mb-2 w-full border-none bg-transparent text-[22px] font-normal text-[#111] outline-none placeholder:text-[#7d7d7d]"
                dir="rtl"
                aria-label="عنوان صفحه"
              />
              <div className="flex flex-row-reverse gap-8 text-[12px] text-[#6f6f6f]">
                <span>{persianTimeLabel}</span>
                <span>{persianDateLabel}</span>
              </div>
            </div>

          </div>

          <div
            ref={canvasRef}
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
