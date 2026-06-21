"use client";

import { GripVertical } from "lucide-react";
import {
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
} from "react";
import { flushSync } from "react-dom";

import { useContextMenu } from "@/components/context-menu";
import {
  dispatchEditorCommand,
  type EditorCommand,
} from "@/lib/editor-events";
import {
  enqueuePageUpsert,
  getLocalPage,
  upsertLocalPage,
} from "@/lib/offline-db/client";
import type { LocalPage, SyncStatus } from "@/lib/offline-db/types";
import {
  type FreeformBlock,
  extractFreeformPlainText,
  parseFreeformDocument,
  serializeFreeformDocument,
} from "@/lib/notes";
import { getNotebookTheme } from "@/lib/notebook-theme";
import { processSyncQueue } from "@/lib/sync/client";

type Attachment = {
  id: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
};

type NoteEditorProps = {
  userId: string;
  notebookId: string;
  pageId: string;
  initialTitle: string;
  initialHtml: string;
  initialUpdatedAt: string;
  attachments: Attachment[];
};

type BlockSnapshot = Pick<FreeformBlock, "text" | "align" | "bold" | "italic">;
type CanvasCoordinates = {
  x: number;
  y: number;
  width: number;
  isMobile: boolean;
};

const PAGE_SIDE_PADDING_DESKTOP = 48;
const PAGE_SIDE_PADDING_MOBILE = 16;
const MOBILE_BREAKPOINT = 768;
const BLOCK_MIN_WIDTH = 180;
const BLOCK_DEFAULT_WIDTH = 240;
const BLOCK_MAX_WIDTH = 900;
const BLOCK_RTL_CLICK_ANCHOR = 12;
const BULLET_PREFIX = "\u25CF ";
const TODO_PREFIX = "\u2610 ";
const TODO_DONE_PREFIX = "\u2611 ";
let textMeasureContext: CanvasRenderingContext2D | null = null;

function createId() {
  return `block-${Math.random().toString(36).slice(2, 10)}`;
}

function getCanvasInset(canvasWidth: number) {
  return canvasWidth >= MOBILE_BREAKPOINT
    ? PAGE_SIDE_PADDING_DESKTOP
    : PAGE_SIDE_PADDING_MOBILE;
}

function getMobileColumnLayout(canvasWidth: number) {
  return {
    x: PAGE_SIDE_PADDING_MOBILE,
    width: Math.max(0, canvasWidth - PAGE_SIDE_PADDING_MOBILE * 2),
  };
}

function getBlockRightGutter(canvasWidth: number) {
  return getCanvasInset(canvasWidth);
}

function getBlockMaxWidth(canvasWidth: number) {
  const inset = getCanvasInset(canvasWidth);
  const rightGutter = getBlockRightGutter(canvasWidth);
  return Math.max(BLOCK_MIN_WIDTH, canvasWidth - inset - rightGutter);
}

function getBlockWidth(text: string, canvasWidth = BLOCK_MAX_WIDTH) {
  const longestLineLength = text
    .split("\n")
    .reduce((max, line) => Math.max(max, line.trim().length), 0);
  const maxWidth = Math.min(BLOCK_MAX_WIDTH, getBlockMaxWidth(canvasWidth));

  if (longestLineLength === 0) {
    return Math.min(BLOCK_DEFAULT_WIDTH, maxWidth);
  }

  return Math.min(
    maxWidth,
    Math.max(BLOCK_MIN_WIDTH, longestLineLength * 11 + 56),
  );
}

function measureBlockWidth(text: string, canvasWidth = BLOCK_MAX_WIDTH) {
  if (typeof document === "undefined") {
    return getBlockWidth(text, canvasWidth);
  }

  if (!textMeasureContext) {
    const canvas = document.createElement("canvas");
    textMeasureContext = canvas.getContext("2d");
  }

  if (!textMeasureContext) {
    return getBlockWidth(text, canvasWidth);
  }

  textMeasureContext.font = "400 15px Segoe UI, Tahoma, Geneva, Verdana, sans-serif";
  const longestLineWidth = text
    .split("\n")
    .reduce(
      (max, line) =>
        Math.max(max, textMeasureContext!.measureText(line || " ").width),
      0,
    );
  const maxWidth = Math.min(BLOCK_MAX_WIDTH, getBlockMaxWidth(canvasWidth));

  if (longestLineWidth === 0) {
    return Math.min(BLOCK_DEFAULT_WIDTH, maxWidth);
  }

  return Math.min(
    maxWidth,
    Math.max(BLOCK_MIN_WIDTH, Math.ceil(longestLineWidth) + 40),
  );
}

function getLegacyBlockWidth(x: number, canvasWidth: number) {
  const inset = getCanvasInset(canvasWidth);
  const rightGutter = getBlockRightGutter(canvasWidth);
  const boundedX = Math.min(
    Math.max(inset, x),
    Math.max(inset, canvasWidth - BLOCK_MIN_WIDTH - rightGutter),
  );

  return Math.min(
    getBlockMaxWidth(canvasWidth),
    Math.max(BLOCK_MIN_WIDTH, canvasWidth - boundedX - rightGutter),
  );
}

function getRenderedBlockWidth(block: FreeformBlock, canvasWidth: number) {
  return typeof block.width === "number"
    ? Math.min(block.width, getBlockMaxWidth(canvasWidth))
    : getLegacyBlockWidth(block.x, canvasWidth);
}

function getInitialBlocks(initialHtml: string): FreeformBlock[] {
  const parsed = parseFreeformDocument(initialHtml);

  if (parsed) {
    return parsed.blocks.length > 0
      ? parsed.blocks
      : [
          {
            id: createId(),
            x: PAGE_SIDE_PADDING_DESKTOP,
            y: 72,
            text: "",
            align: "right",
          },
        ];
  }

  const plainText = initialHtml
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return [
    {
      id: createId(),
      x: PAGE_SIDE_PADDING_DESKTOP,
      y: 72,
      text: plainText,
      align: "right",
    },
  ];
}

function toSnapshot(block: FreeformBlock): BlockSnapshot {
  return {
    text: block.text,
    align: block.align ?? "right",
    bold: block.bold ?? false,
    italic: block.italic ?? false,
  };
}

function applySnapshot(block: FreeformBlock, snapshotValue: BlockSnapshot) {
  return {
    ...block,
    text: snapshotValue.text,
    align: snapshotValue.align ?? "right",
    bold: snapshotValue.bold ?? false,
    italic: snapshotValue.italic ?? false,
  };
}

function getCurrentLineRange(text: string, position: number) {
  const lineStart = text.lastIndexOf("\n", Math.max(0, position - 1)) + 1;
  const nextBreak = text.indexOf("\n", position);
  const lineEnd = nextBreak === -1 ? text.length : nextBreak;

  return {
    lineStart,
    lineEnd,
    lineText: text.slice(lineStart, lineEnd),
  };
}

export function NoteEditor({
  userId,
  notebookId,
  pageId,
  initialTitle,
  initialHtml,
  initialUpdatedAt,
  attachments: _initialAttachments,
}: NoteEditorProps) {
  const { openMenu } = useContextMenu();
  const notebookTheme = getNotebookTheme(notebookId);
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
  const [syncStatus, setSyncStatus] = useState<SyncStatus>("synced");
  const [isOnline, setIsOnline] = useState(
    typeof navigator === "undefined" ? true : navigator.onLine,
  );
  const [isSavingLocally, setIsSavingLocally] = useState(false);
  const [isHydrated, setIsHydrated] = useState(false);
  const [activeBlockId, setActiveBlockId] = useState<string | null>(null);
  const [selectedBlockIds, setSelectedBlockIds] = useState<string[]>([]);
  const [isDesktopViewport, setIsDesktopViewport] = useState(
    typeof window !== "undefined"
      ? window.innerWidth >= MOBILE_BREAKPOINT
      : true,
  );
  const [canvasWidth, setCanvasWidth] = useState(
    typeof window !== "undefined" ? window.innerWidth : 1200,
  );
  const [viewportHeight, setViewportHeight] = useState(
    typeof window !== "undefined" ? window.innerHeight : 900,
  );
  const [lowestBlockBottom, setLowestBlockBottom] = useState(0);

  const pageRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const blockRefs = useRef<Record<string, HTMLTextAreaElement | null>>({});
  const dragStateRef = useRef<{
    id: string;
    pointerOffsetX: number;
    pointerOffsetY: number;
  } | null>(null);
  const historyRef = useRef<
    Record<string, { past: BlockSnapshot[]; future: BlockSnapshot[] }>
  >({});
  const autosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSavedSnapshotRef = useRef("");
  const lastSyncedAtRef = useRef(initialUpdatedAt);
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
        blocks,
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
  const activeBlock = blocks.find((block) => block.id === activeBlockId) ?? null;

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

  function pushHistoryEntry(block: FreeformBlock) {
    const bucket = historyRef.current[block.id] ?? { past: [], future: [] };
    bucket.past.push(toSnapshot(block));
    if (bucket.past.length > 100) {
      bucket.past.shift();
    }
    bucket.future = [];
    historyRef.current[block.id] = bucket;
  }

  useEffect(() => {
    const handleConnectionChange = () => {
      setIsOnline(navigator.onLine);
    };

    window.addEventListener("online", handleConnectionChange);
    window.addEventListener("offline", handleConnectionChange);

    return () => {
      window.removeEventListener("online", handleConnectionChange);
      window.removeEventListener("offline", handleConnectionChange);
    };
  }, []);

  useEffect(() => {
    let isCancelled = false;

    async function hydrateFromOfflineStore() {
      const localPage = await getLocalPage(userId, pageId);
      const serverUpdatedAt = new Date(initialUpdatedAt).getTime();
      const localUpdatedAt = localPage ? new Date(localPage.updatedAt).getTime() : 0;
      const shouldPreferLocal =
        Boolean(localPage) &&
        ((localPage?.syncStatus ?? "synced") !== "synced" ||
          localUpdatedAt >= serverUpdatedAt);

      const serverPage: LocalPage = {
        id: pageId,
        userId,
        notebookId,
        title: initialTitle,
        bodyHtml: initialHtml,
        bodyText:
          parseFreeformDocument(initialHtml)?.blocks
            .map((block) => block.text.trim())
            .filter(Boolean)
            .join(" ") ?? "",
        archived: false,
        updatedAt: initialUpdatedAt,
        lastSyncedAt: initialUpdatedAt,
        deletedAt: null,
        syncStatus: "synced",
      };

      if (shouldPreferLocal && localPage && !isCancelled) {
        setTitle(localPage.title);
        setBlocks(getInitialBlocks(localPage.bodyHtml));
        setSyncStatus(localPage.syncStatus);
        lastSyncedAtRef.current =
          localPage.lastSyncedAt ?? localPage.updatedAt ?? initialUpdatedAt;
        lastSavedSnapshotRef.current = `${localPage.title}::${localPage.bodyHtml}`;
      } else {
        await upsertLocalPage(serverPage);

        if (!isCancelled) {
          setSyncStatus("synced");
          lastSyncedAtRef.current = initialUpdatedAt;
          lastSavedSnapshotRef.current = `${initialTitle}::${initialHtml}`;
        }
      }

      if (!isCancelled) {
        setIsHydrated(true);
      }
    }

    void hydrateFromOfflineStore();

    return () => {
      isCancelled = true;
    };
  }, [initialHtml, initialTitle, initialUpdatedAt, notebookId, pageId, userId]);

  useEffect(() => {
    if (isDesktopViewport || !isHydrated || !activeBlockId) {
      return;
    }

    const element = blockRefs.current[activeBlockId];
    if (!element || document.activeElement === element) {
      return;
    }

    // Keep the active mobile editor focused through hydration, as in 7959e9f.
    element.focus();
  }, [activeBlockId, isDesktopViewport, isHydrated]);

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
        const element = blockRefs.current[block.id];
        const blockHeight = Math.max(
          element?.scrollHeight ?? 28,
          element?.offsetHeight ?? 28,
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
      const blockElement = blockRefs.current[block.id];
      const blockHeight = Math.max(
        blockElement?.scrollHeight ?? 28,
        blockElement?.offsetHeight ?? 28,
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

      const nextIsDesktopViewport = canvasWidth >= MOBILE_BREAKPOINT;

      setCanvasWidth(canvasWidth);
      setViewportHeight(
        nextIsDesktopViewport
          ? (window.visualViewport?.height ?? window.innerHeight)
          : window.innerHeight,
      );
      setIsDesktopViewport(nextIsDesktopViewport);
    };
    let animationFrameId: number | null = null;
    let observedCanvasWidth: number | null = null;
    const scheduleNormalizeBlockLayout = () => {
      if (animationFrameId !== null) {
        cancelAnimationFrame(animationFrameId);
      }

      animationFrameId = requestAnimationFrame(() => {
        animationFrameId = null;
        normalizeBlockLayout();
      });
    };

    const scheduleObservedWidthLayout = () => {
      const nextWidth = canvasRef.current?.getBoundingClientRect().width;

      if (!nextWidth || nextWidth === observedCanvasWidth) {
        return;
      }

      observedCanvasWidth = nextWidth;
      scheduleNormalizeBlockLayout();
    };

    const handleVisualViewportResize = () => {
      const nextWidth = canvasRef.current?.getBoundingClientRect().width;

      if (nextWidth && nextWidth >= MOBILE_BREAKPOINT) {
        scheduleNormalizeBlockLayout();
      }
    };

    normalizeBlockLayout();
    observedCanvasWidth = canvasRef.current?.getBoundingClientRect().width ?? null;
    const resizeObserver =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(scheduleObservedWidthLayout);
    const visualViewport = window.visualViewport;

    if (canvasRef.current) {
      resizeObserver?.observe(canvasRef.current);
    }

    window.addEventListener("resize", scheduleNormalizeBlockLayout);
    visualViewport?.addEventListener("resize", handleVisualViewportResize);
    return () => {
      if (animationFrameId !== null) {
        cancelAnimationFrame(animationFrameId);
      }

      resizeObserver?.disconnect();
      window.removeEventListener("resize", scheduleNormalizeBlockLayout);
      visualViewport?.removeEventListener("resize", handleVisualViewportResize);
    };
  }, []);

  const saveNoteLocally = useEffectEvent(async () => {
    try {
      const updatedAt = new Date().toISOString();
      const localPage: LocalPage = {
        id: pageId,
        userId,
        notebookId,
        title,
        bodyHtml: serializedDocument,
        bodyText,
        archived: false,
        updatedAt,
        lastSyncedAt: lastSyncedAtRef.current ?? initialUpdatedAt,
        deletedAt: null,
        syncStatus: "pending",
      };

      await upsertLocalPage(localPage);
      await enqueuePageUpsert(localPage, lastSyncedAtRef.current ?? initialUpdatedAt);

      lastSavedSnapshotRef.current = snapshot;
      setSyncStatus("pending");
      setIsSavingLocally(false);

      if (navigator.onLine) {
        await processSyncQueue(userId);
        const refreshed = await getLocalPage(userId, pageId);

        if (refreshed?.lastSyncedAt) {
          lastSyncedAtRef.current = refreshed.lastSyncedAt;
        }

        if (refreshed?.syncStatus) {
          setSyncStatus(refreshed.syncStatus);
        }
      }
    } catch {
      setIsSavingLocally(false);
      setSyncStatus("failed");
    }
  });

  useEffect(() => {
    if (!isHydrated) {
      return;
    }

    if (snapshot === lastSavedSnapshotRef.current) {
      return;
    }

    setIsSavingLocally(true);

    if (autosaveTimerRef.current) {
      clearTimeout(autosaveTimerRef.current);
    }

    autosaveTimerRef.current = setTimeout(() => {
      void saveNoteLocally();
    }, 500);

    return () => {
      if (autosaveTimerRef.current) {
        clearTimeout(autosaveTimerRef.current);
      }
    };
  }, [isHydrated, snapshot]);

  useEffect(() => {
    const listener = (event: Event) => {
      const customEvent = event as CustomEvent<{
        type?: string;
        userId?: string;
        pageId?: string;
        syncStatus?: SyncStatus;
        lastSyncedAt?: string | null;
      }>;

      if (
        customEvent.detail?.userId !== userId ||
        customEvent.detail?.pageId !== pageId ||
        !customEvent.detail.syncStatus
      ) {
        return;
      }

      setSyncStatus(customEvent.detail.syncStatus);
      if (customEvent.detail.lastSyncedAt) {
        lastSyncedAtRef.current = customEvent.detail.lastSyncedAt;
      }
    };

    window.addEventListener("notava-sync", listener);
    return () => window.removeEventListener("notava-sync", listener);
  }, [pageId, userId]);

  function focusBlockElement(blockId: string, caretPosition = 0) {
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
    width?: number,
  ) {
    const block: FreeformBlock = {
      id: createId(),
      x,
      y,
      text: "",
      align: "right",
    };

    if (typeof width === "number") {
      block.width = width;
    }

    const addBlock = () => {
      setBlocks((current) => [...current, block]);
      setActiveBlockId(block.id);
      setSelectedBlockIds([block.id]);
    };

    if (shouldFocus) {
      flushSync(addBlock);
      focusBlockWhenReady(block.id);
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
    const isMobileCanvas = canvasRect.width < MOBILE_BREAKPOINT;
    const mobileLayout = getMobileColumnLayout(canvasRect.width);
    const boundedBlockWidth = Math.min(blockWidth, getBlockMaxWidth(canvasRect.width));
    const width = isMobileCanvas ? mobileLayout.width : boundedBlockWidth;
    const x = isMobileCanvas
      ? mobileLayout.x
      : getCanvasBoundedX(
          canvasRect.width,
          clientX - canvasRect.left - boundedBlockWidth + BLOCK_RTL_CLICK_ANCHOR,
          boundedBlockWidth,
        );
    const canvasOffsetTop = canvasRect.top - pageRect.top;
    const y = Math.max(24, clientY - pageRect.top - canvasOffsetTop);

    return { x, y, width, isMobile: isMobileCanvas };
  }

  function isEditorControlTarget(target: HTMLElement) {
    return Boolean(target.closest("textarea") || target.closest("button"));
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
      addBlockAt(
        coordinates.x,
        coordinates.y,
        true,
        coordinates.isMobile ? undefined : coordinates.width,
      );
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
    setBlocks((current) =>
      current.map((block) => {
        if (block.id !== id) {
          return block;
        }

        const next = updater(block);
        if (
          trackHistory &&
          JSON.stringify(toSnapshot(block)) !== JSON.stringify(toSnapshot(next))
        ) {
          pushHistoryEntry(block);
        }

        return next;
      }),
    );
  }

  function updateBlocksByIds(
    ids: string[],
    updater: (block: FreeformBlock) => FreeformBlock,
    trackHistory = true,
  ) {
    setBlocks((current) =>
      current.map((block) => {
        if (!ids.includes(block.id)) {
          return block;
        }

        const next = updater(block);
        if (
          trackHistory &&
          JSON.stringify(toSnapshot(block)) !== JSON.stringify(toSnapshot(next))
        ) {
          pushHistoryEntry(block);
        }

        return next;
      }),
    );
  }

  function updateBlockText(id: string, text: string) {
    updateBlock(id, (block) => {
      const activeCanvasWidth =
        canvasRef.current?.getBoundingClientRect().width ?? canvasWidth;

      if (activeCanvasWidth < MOBILE_BREAKPOINT) {
        return { ...block, text };
      }

      const isLegacyColumnBlock = typeof block.width !== "number";
      const previousWidth = getRenderedBlockWidth(block, activeCanvasWidth);
      const nextWidth = isLegacyColumnBlock
        ? previousWidth
        : measureBlockWidth(text, activeCanvasWidth);
      const widthDelta = nextWidth - previousWidth;
      const nextX = getCanvasBoundedX(
        activeCanvasWidth,
        widthDelta === 0 ? block.x : block.x - widthDelta,
        nextWidth,
      );

      return {
        ...block,
        text,
        x: nextX,
        width: isLegacyColumnBlock ? block.width : nextWidth,
      };
    });
  }

  function removeBlockIfEmpty(id: string) {
    setBlocks((current) => {
      const target = current.find((block) => block.id === id);

      if (!target || target.text.trim()) {
        return current;
      }

      if (current.length === 1) {
        return current;
      }

      return current.filter((block) => block.id !== id);
    });
    setSelectedBlockIds((current) => current.filter((blockId) => blockId !== id));
  }

  function deleteBlock(id: string) {
    setBlocks((current) => current.filter((block) => block.id !== id));
    setActiveBlockId((current) => (current === id ? null : current));
    setSelectedBlockIds((current) => current.filter((blockId) => blockId !== id));
  }

  function deleteBlocks(ids: string[]) {
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
    const isMobileCanvas = rect.width < MOBILE_BREAKPOINT;
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

    setBlocks((current) =>
      current.map((block) =>
        block.id === dragStateRef.current?.id
          ? isMobileCanvas
            ? { ...block, y: nextY }
            : { ...block, x: nextX, y: nextY, width: blockWidth }
          : block,
      ),
    );
  });

  useEffect(() => {
    const handlePointerMove = (event: PointerEvent) => handleBlockDrag(event);
    const handlePointerUp = () => {
      dragStateRef.current = null;
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, []);

  function undoBlock(id: string) {
    setBlocks((current) =>
      current.map((block) => {
        if (block.id !== id) {
          return block;
        }

        const bucket = historyRef.current[id];
        const previous = bucket?.past.pop();
        if (!bucket || !previous) {
          return block;
        }

        bucket.future.push(toSnapshot(block));
        return applySnapshot(block, previous);
      }),
    );
  }

  function redoBlock(id: string) {
    setBlocks((current) =>
      current.map((block) => {
        if (block.id !== id) {
          return block;
        }

        const bucket = historyRef.current[id];
        const next = bucket?.future.pop();
        if (!bucket || !next) {
          return block;
        }

        bucket.past.push(toSnapshot(block));
        return applySnapshot(block, next);
      }),
    );
  }

  const handleEditorCommand = useEffectEvent((command: EditorCommand) => {
    const targetIds =
      selectedBlockIds.length > 0
        ? selectedBlockIds
        : activeBlockId
          ? [activeBlockId]
          : [];

    if (targetIds.length === 0) {
      return;
    }

    const primaryBlockId = activeBlockId ?? targetIds[0];
    const activeElement = primaryBlockId
      ? blockRefs.current[primaryBlockId]
      : null;
    activeElement?.focus();

    switch (command) {
      case "undo":
        if (primaryBlockId) {
          undoBlock(primaryBlockId);
        }
        return;
      case "redo":
        if (primaryBlockId) {
          redoBlock(primaryBlockId);
        }
        return;
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
      case "delete-block":
        deleteBlocks(targetIds);
        return;
    }
  });

  useEffect(() => {
    const listener = (event: Event) => {
      const customEvent = event as CustomEvent<{ command: EditorCommand }>;
      handleEditorCommand(customEvent.detail.command);
    };

    window.addEventListener("note-editor-command", listener);
    return () => window.removeEventListener("note-editor-command", listener);
  }, []);

  useEffect(() => {
    window.dispatchEvent(
      new CustomEvent("note-editor-state", {
        detail: {
          hasActiveBlock: Boolean(activeBlock),
          align: activeBlock?.align ?? "right",
          bold: activeBlock?.bold ?? false,
          italic: activeBlock?.italic ?? false,
          selectionCount: selectedBlockIds.length,
        },
      }),
    );
  }, [activeBlock, selectedBlockIds.length]);

  function startDraggingBlock(
    event: React.PointerEvent<HTMLButtonElement>,
    block: FreeformBlock,
  ) {
    if (!canvasRef.current) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    selectSingleBlock(block.id);

    const rect = canvasRef.current.getBoundingClientRect();
    const isMobileCanvas = rect.width < MOBILE_BREAKPOINT;
    const mobileLayout = getMobileColumnLayout(rect.width);
    const blockWidth = isMobileCanvas
      ? mobileLayout.width
      : getRenderedBlockWidth(block, rect.width);
    const renderedX = isMobileCanvas
      ? mobileLayout.x
      : getCanvasBoundedX(rect.width, block.x, blockWidth);
    dragStateRef.current = {
      id: block.id,
      pointerOffsetX: event.clientX - rect.left - renderedX,
      pointerOffsetY: event.clientY - rect.top - block.y,
    };
  }

  return (
    <div className="h-full bg-white">
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
              className="w-full border-b pb-3 align-top"
              style={{ borderColor: notebookTheme.accent }}
            >
              <h1 className="mb-2 text-[22px] font-normal text-[#111]">{title}</h1>
              <div className="flex flex-row-reverse gap-8 text-[12px] text-[#6f6f6f]">
                <span>{persianTimeLabel}</span>
                <span>{persianDateLabel}</span>
              </div>
            </div>

          </div>

          <div
            ref={canvasRef}
            data-layout-mode="freeform"
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
              openMenu(event, {
                title:
                  selectedBlockIds.length > 1
                    ? `${selectedBlockIds.length} بلوک انتخاب شده`
                    : "ویرایشگر",
                items:
                  selectedBlockIds.length > 1
                    ? [
                        {
                          id: "new-block",
                          label: "افزودن بلوک متن در اینجا",
                          onSelect: () =>
                            addBlockAt(
                              coordinates.x,
                              coordinates.y,
                              true,
                              coordinates.isMobile
                                ? undefined
                                : coordinates.width,
                            ),
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
                          id: "new-block",
                          label: "افزودن بلوک متن در اینجا",
                          onSelect: () =>
                            addBlockAt(
                              coordinates.x,
                              coordinates.y,
                              true,
                              coordinates.isMobile
                                ? undefined
                                : coordinates.width,
                            ),
                        },
                      ],
              });
            }}
          >
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              className="sr-only"
              aria-hidden="true"
              tabIndex={-1}
            />

            {blocks.map((block) => {
                const mobileLayout = getMobileColumnLayout(canvasWidth);
                const blockWidth = isDesktopViewport
                  ? getRenderedBlockWidth(block, canvasWidth)
                  : mobileLayout.width;
                const blockX = isDesktopViewport
                  ? getCanvasBoundedX(canvasWidth, block.x, blockWidth)
                  : mobileLayout.x;
                const isSelected = selectedBlockIds.includes(block.id);

                return (
                <div
                  key={block.id}
                  data-testid={`note-block-${block.id}`}
                  data-layout="freeform"
                  style={{
                    left: `${blockX}px`,
                    top: `${block.y}px`,
                    width: `${blockWidth}px`,
                  }}
                  className="group absolute rounded-md"
                >
                  <button
                    type="button"
                    onPointerDown={(event) => startDraggingBlock(event, block)}
                    className="absolute -right-7 top-1 inline-flex h-6 w-6 items-center justify-center rounded-md border border-[#d8e1ea] bg-white/95 text-[#7a94a6] opacity-0 shadow-sm transition hover:bg-[#f7fbff] group-hover:opacity-100 md:-right-8"
                    aria-label="جابجایی بلوک"
                  >
                    <GripVertical className="h-3.5 w-3.5" />
                  </button>

                  <textarea
                    ref={(element) => {
                      blockRefs.current[block.id] = element;
                    }}
                    value={block.text}
                    onChange={(event) => updateBlockText(block.id, event.target.value)}
                    onKeyDown={(event) => handleBlockKeyDown(event, block)}
                    onFocus={() => selectSingleBlock(block.id)}
                    onBlur={() => removeBlockIfEmpty(block.id)}
                    onMouseDown={(event) => {
                      if (event.ctrlKey || event.metaKey) {
                        event.preventDefault();
                        event.stopPropagation();
                        toggleBlockSelection(block.id);
                      }
                    }}
                    onClick={(event) => {
                      event.stopPropagation();

                      if (event.ctrlKey || event.metaKey) {
                        return;
                      }

                      selectSingleBlock(block.id);
                    }}
                    onContextMenu={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      if (!selectedBlockIds.includes(block.id)) {
                        selectSingleBlock(block.id);
                      }

                      const selectedIds =
                        selectedBlockIds.includes(block.id) &&
                        selectedBlockIds.length > 1
                          ? selectedBlockIds
                          : [block.id];

                      openMenu(event, {
                        title:
                          selectedIds.length > 1
                            ? `${selectedIds.length} بلوک انتخاب شده`
                            : "بلوک متن",
                        items:
                          selectedIds.length > 1
                            ? [
                                {
                                  id: "align-right",
                                  label: "تراز راست",
                                  onSelect: () => dispatchEditorCommand("align-right"),
                                },
                                {
                                  id: "align-center",
                                  label: "تراز وسط",
                                  onSelect: () => dispatchEditorCommand("align-center"),
                                },
                                {
                                  id: "align-justify",
                                  label: "تراز کامل",
                                  onSelect: () => dispatchEditorCommand("align-justify"),
                                },
                                { id: "separator-1", separator: true },
                                {
                                  id: "italic",
                                  label: "مورب کردن انتخاب",
                                  onSelect: () =>
                                    dispatchEditorCommand("toggle-italic"),
                                },
                                {
                                  id: "bold",
                                  label: "پررنگ کردن انتخاب",
                                  onSelect: () =>
                                    dispatchEditorCommand("toggle-bold"),
                                },
                                { id: "separator-2", separator: true },
                                {
                                  id: "delete-selected",
                                  label: "حذف بلوک‌های انتخاب‌شده",
                                  danger: true,
                                  onSelect: () =>
                                    dispatchEditorCommand("delete-block"),
                                },
                                {
                                  id: "clear-selection",
                                  label: "پاک کردن انتخاب",
                                  onSelect: () => setSelectedBlockIds([]),
                                },
                              ]
                            : [
                                {
                                  id: "undo",
                                  label: "واگرد",
                                  onSelect: () => dispatchEditorCommand("undo"),
                                },
                                {
                                  id: "redo",
                                  label: "انجام دوباره",
                                  onSelect: () => dispatchEditorCommand("redo"),
                                },
                                { id: "separator-1", separator: true },
                                {
                                  id: "align-right",
                                  label: "تراز راست",
                                  onSelect: () =>
                                    dispatchEditorCommand("align-right"),
                                },
                                {
                                  id: "align-center",
                                  label: "تراز وسط",
                                  onSelect: () =>
                                    dispatchEditorCommand("align-center"),
                                },
                                {
                                  id: "align-justify",
                                  label: "تراز کامل",
                                  onSelect: () =>
                                    dispatchEditorCommand("align-justify"),
                                },
                                { id: "separator-2", separator: true },
                                {
                                  id: "italic",
                                  label: block.italic ? "برداشتن حالت مورب" : "مورب",
                                  onSelect: () =>
                                    dispatchEditorCommand("toggle-italic"),
                                },
                                {
                                  id: "bold",
                                  label: block.bold ? "برداشتن حالت پررنگ" : "پررنگ",
                                  onSelect: () => dispatchEditorCommand("toggle-bold"),
                                },
                                { id: "separator-3", separator: true },
                                {
                                  id: "bullet-list",
                                  label: "تبدیل به فهرست نشانه‌دار",
                                  onSelect: () =>
                                    dispatchEditorCommand("toggle-bullet-list"),
                                },
                                {
                                  id: "todo-list",
                                  label: "تبدیل به فهرست کارها",
                                  onSelect: () =>
                                    dispatchEditorCommand("toggle-todo-list"),
                                },
                                { id: "separator-4", separator: true },
                                {
                                  id: "delete-block",
                                  label: "حذف بلوک",
                                  danger: true,
                                  onSelect: () =>
                                    dispatchEditorCommand("delete-block"),
                                },
                              ],
                      });
                    }}
                    style={{
                      textAlign: block.align ?? "right",
                      fontWeight: block.bold ? 700 : 400,
                      fontStyle: block.italic ? "italic" : "normal",
                      boxShadow: isSelected
                        ? `0 0 0 2px ${notebookTheme.accent}`
                        : "none",
                      borderRadius: "6px",
                    }}
                    className="freeform-note min-h-7 w-full resize-none overflow-hidden border-none bg-transparent px-1 py-0 text-right text-[15px] leading-7 text-[#222] outline-none"
                    dir="rtl"
                  />
                </div>
                );
              })}

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
