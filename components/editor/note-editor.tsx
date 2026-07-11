"use client";

import Image from "next/image";
import { ArrowLeftRight, GripVertical, LoaderCircle, Trash2 } from "lucide-react";
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
import { dispatchPageTitleUpdated } from "@/lib/page-events";
import { getNotebookTheme } from "@/lib/notebook-theme";
import { getPageDocumentTitle } from "@/lib/page-title";
import { processSyncQueue } from "@/lib/sync/client";

type Attachment = {
  id: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
};

type AttachmentUploadResponse = {
  attachment: Attachment;
  url: string;
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

type BlockSnapshot = Pick<
  FreeformBlock,
  | "text"
  | "align"
  | "direction"
  | "bold"
  | "italic"
  | "textColor"
  | "fontSize"
>;
type CanvasCoordinates = {
  x: number;
  y: number;
  width: number;
};

const PAGE_SIDE_PADDING_DESKTOP = 48;
const PAGE_SIDE_PADDING_MOBILE = 16;
const DEFAULT_CANVAS_WIDTH = 1200;
const DEFAULT_VIEWPORT_HEIGHT = 900;
const BLOCK_MIN_WIDTH = 180;
const BLOCK_DEFAULT_WIDTH = 240;
const BLOCK_MAX_WIDTH = 900;
const BLOCK_RTL_CLICK_ANCHOR = 12;
const AUTOSAVE_DEBOUNCE_MS = 150;
const IMAGE_DEFAULT_WIDTH = 420;
const IMAGE_MIN_WIDTH = 160;
const IMAGE_DEFAULT_ASPECT_RATIO = 4 / 3;
const CLIPBOARD_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);
const BULLET_PREFIX = "\u25CF ";
const TODO_PREFIX = "\u2610 ";
const TODO_DONE_PREFIX = "\u2611 ";
let textMeasureContext: CanvasRenderingContext2D | null = null;

function createId() {
  return `block-${Math.random().toString(36).slice(2, 10)}`;
}

function getCanvasInset(canvasWidth: number) {
  return canvasWidth >= 768 ? PAGE_SIDE_PADDING_DESKTOP : PAGE_SIDE_PADDING_MOBILE;
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

function isImageBlock(block: FreeformBlock) {
  return block.type === "image" && Boolean(block.attachmentId);
}

function getImageBlockHeight(block: FreeformBlock, width: number) {
  return width / (block.aspectRatio ?? IMAGE_DEFAULT_ASPECT_RATIO);
}

function isEmptyTextBlock(block: FreeformBlock) {
  return block.type !== "image" && !block.text.trim();
}

function getPersistableBlocks(blocks: FreeformBlock[]) {
  return blocks.filter((block) => !isEmptyTextBlock(block));
}

function getInitialBlocks(initialHtml: string): FreeformBlock[] {
  const parsed = parseFreeformDocument(initialHtml);

  if (parsed) {
    return getPersistableBlocks(parsed.blocks);
  }

  const plainText = initialHtml
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!plainText) {
    return [];
  }

  return [
    {
      id: createId(),
      x: PAGE_SIDE_PADDING_DESKTOP,
      y: 72,
      text: plainText,
      align: "right",
      direction: "rtl",
      textColor: "#222222",
      fontSize: 15,
    },
  ];
}

function toSnapshot(block: FreeformBlock): BlockSnapshot {
  return {
    text: block.text,
    align: block.align ?? "right",
    direction: block.direction ?? "rtl",
    bold: block.bold ?? false,
    italic: block.italic ?? false,
    textColor: block.textColor ?? "#222222",
    fontSize: block.fontSize ?? 15,
  };
}

function applySnapshot(block: FreeformBlock, snapshotValue: BlockSnapshot) {
  return {
    ...block,
    text: snapshotValue.text,
    align: snapshotValue.align ?? "right",
    direction: snapshotValue.direction ?? "rtl",
    bold: snapshotValue.bold ?? false,
    italic: snapshotValue.italic ?? false,
    textColor: snapshotValue.textColor ?? "#222222",
    fontSize: snapshotValue.fontSize ?? 15,
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
  const [syncStatus, setSyncStatus] = useState<SyncStatus>("synced");
  const [isOnline, setIsOnline] = useState(
    typeof navigator === "undefined" ? true : navigator.onLine,
  );
  const [isSavingLocally, setIsSavingLocally] = useState(false);
  const [isHydrated, setIsHydrated] = useState(false);
  const [activeBlockId, setActiveBlockId] = useState<string | null>(null);
  const [selectedBlockIds, setSelectedBlockIds] = useState<string[]>([]);
  const [isDesktopViewport, setIsDesktopViewport] = useState(true);
  const [canvasWidth, setCanvasWidth] = useState(DEFAULT_CANVAS_WIDTH);
  const [viewportHeight, setViewportHeight] = useState(DEFAULT_VIEWPORT_HEIGHT);
  const [lowestBlockBottom, setLowestBlockBottom] = useState(0);
  const [pendingImageUploads, setPendingImageUploads] = useState(0);
  const [imageUploadError, setImageUploadError] = useState<string | null>(null);

  const pageRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const titleInputRef = useRef<HTMLInputElement | null>(null);
  const imageFileInputRef = useRef<HTMLInputElement | null>(null);
  const blockRefs = useRef<Record<string, HTMLTextAreaElement | null>>({});
  const dragStateRef = useRef<{
    id: string;
    pointerOffsetX: number;
    pointerOffsetY: number;
  } | null>(null);
  const resizeStateRef = useRef<{
    id: string;
    startClientX: number;
    startWidth: number;
  } | null>(null);
  const historyRef = useRef<
    Record<string, { past: BlockSnapshot[]; future: BlockSnapshot[] }>
  >({});
  const autosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSavedSnapshotRef = useRef("");
  const lastSyncedAtRef = useRef(initialUpdatedAt);
  const latestSnapshotRef = useRef("");
  const isMountedRef = useRef(true);
  const userEditedBeforeHydrationRef = useRef(false);
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
  const activeBlock =
    blocks.find(
      (block) => block.id === activeBlockId && !isImageBlock(block),
    ) ?? null;

  function markEditorInteraction() {
    if (!isHydrated) {
      userEditedBeforeHydrationRef.current = true;
    }
  }

  useEffect(() => {
    latestSnapshotRef.current = snapshot;
  }, [snapshot]);

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
    isMountedRef.current = true;

    return () => {
      isMountedRef.current = false;
    };
  }, []);

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
    document.title = getPageDocumentTitle(title);
  }, [title]);

  useEffect(() => {
    let isCancelled = false;

    async function hydrateFromOfflineStore() {
      const localPage = await getLocalPage(userId, pageId);
      const serverUpdatedAt = new Date(initialUpdatedAt).getTime();
      const localUpdatedAt = localPage ? new Date(localPage.updatedAt).getTime() : 0;
      const userEditedBeforeHydration = userEditedBeforeHydrationRef.current;
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

      if (shouldPreferLocal && localPage && !isCancelled && !userEditedBeforeHydration) {
        setTitle(localPage.title);
        setBlocks(getInitialBlocks(localPage.bodyHtml));
        setSyncStatus(localPage.syncStatus);
        lastSyncedAtRef.current =
          localPage.lastSyncedAt ?? localPage.updatedAt ?? initialUpdatedAt;
        lastSavedSnapshotRef.current = `${localPage.title}::${localPage.bodyHtml}`;
      } else if (userEditedBeforeHydration) {
        if (!isCancelled) {
          lastSyncedAtRef.current =
            localPage?.lastSyncedAt ?? localPage?.updatedAt ?? initialUpdatedAt;
          setSyncStatus(localPage?.syncStatus === "failed" ? "failed" : "pending");
        }
      } else {
        try {
          await upsertLocalPage(serverPage);

          if (!isCancelled) {
            setSyncStatus("synced");
            lastSyncedAtRef.current = initialUpdatedAt;
            lastSavedSnapshotRef.current = `${initialTitle}::${initialHtml}`;
          }
        } catch (error) {
          console.error("Failed to seed local page state during hydration.", error);

          if (!isCancelled && isMountedRef.current) {
            setSyncStatus("failed");
          }
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
    if (!isHydrated || !activeBlockId) {
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
        const element = blockRefs.current[block.id];
        const blockWidth = getRenderedBlockWidth(block, canvasWidth);
        const blockHeight = isImageBlock(block)
          ? getImageBlockHeight(block, blockWidth)
          : Math.max(
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
      const blockWidth = getRenderedBlockWidth(block, canvasWidth);
      const blockHeight = isImageBlock(block)
        ? getImageBlockHeight(block, blockWidth)
        : Math.max(
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

  const persistLocalDraft = useCallback(async (reason: string) => {
    if (!isHydrated) {
      return false;
    }

    const pendingSnapshot = snapshot;

    if (pendingSnapshot === lastSavedSnapshotRef.current) {
      if (isMountedRef.current) {
        setIsSavingLocally(false);
      }

      return true;
    }

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

      const isCurrentSnapshot = latestSnapshotRef.current === pendingSnapshot;

      if (isCurrentSnapshot) {
        lastSavedSnapshotRef.current = pendingSnapshot;
      }

      if (isMountedRef.current) {
        setSyncStatus("pending");
        setIsSavingLocally(!isCurrentSnapshot);
      }

      dispatchPageTitleUpdated({
        notebookId,
        pageId,
        title,
        updatedAt,
      });

      return true;
    } catch (error) {
      console.error(`Failed to persist page draft locally during ${reason}.`, error);

      if (isMountedRef.current && latestSnapshotRef.current === pendingSnapshot) {
        setIsSavingLocally(false);
        setSyncStatus("failed");
      }

      return false;
    }
  }, [
    bodyText,
    initialUpdatedAt,
    isHydrated,
    notebookId,
    pageId,
    serializedDocument,
    snapshot,
    title,
    userId,
  ]);

  const flushRemoteSync = useCallback(async (reason: string) => {
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      return;
    }

    try {
      await processSyncQueue(userId);
      const refreshed = await getLocalPage(userId, pageId);

      if (refreshed?.lastSyncedAt) {
        lastSyncedAtRef.current = refreshed.lastSyncedAt;
      }

      if (refreshed?.syncStatus && isMountedRef.current) {
        setSyncStatus(refreshed.syncStatus);
      }
    } catch (error) {
      console.error(`Failed to sync page draft during ${reason}.`, error);

      if (isMountedRef.current) {
        setSyncStatus((current) => (current === "failed" ? current : "pending"));
        setIsSavingLocally(false);
      }
    }
  }, [pageId, userId]);

  const persistDraftAndSync = useCallback(async (reason: string) => {
    const persisted = await persistLocalDraft(reason);

    if (persisted) {
      await flushRemoteSync(reason);
    }
  }, [flushRemoteSync, persistLocalDraft]);

  const flushPendingSave = useCallback((reason: string) => {
    if (!isHydrated) {
      return;
    }

    if (autosaveTimerRef.current) {
      clearTimeout(autosaveTimerRef.current);
      autosaveTimerRef.current = null;
    }

    if (snapshot === lastSavedSnapshotRef.current) {
      if (isMountedRef.current) {
        setIsSavingLocally(false);
      }

      return;
    }

    if (isMountedRef.current) {
      setIsSavingLocally(true);
    }

    void persistDraftAndSync(reason);
  }, [isHydrated, persistDraftAndSync, snapshot]);

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
      void persistDraftAndSync("autosave");
    }, AUTOSAVE_DEBOUNCE_MS);

    return () => {
      if (autosaveTimerRef.current) {
        clearTimeout(autosaveTimerRef.current);
      }
    };
  }, [isHydrated, persistDraftAndSync, snapshot]);

  useEffect(() => {
    if (!isHydrated) {
      return;
    }

    const handlePageHide = () => {
      flushPendingSave("pagehide");
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        flushPendingSave("visibilitychange");
      }
    };
    const handleBeforeUnload = () => {
      flushPendingSave("beforeunload");
    };

    window.addEventListener("pagehide", handlePageHide);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      window.removeEventListener("pagehide", handlePageHide);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("beforeunload", handleBeforeUnload);
      flushPendingSave("unmount");
    };
  }, [flushPendingSave, isHydrated]);

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
    width = BLOCK_DEFAULT_WIDTH,
    initialText = "",
  ) {
    const block: FreeformBlock = {
      id: createId(),
      x,
      y,
      width,
      text: initialText,
      align: "right",
      direction: "rtl",
      textColor: "#222222",
      fontSize: 15,
    };

    const addBlock = () => {
      markEditorInteraction();
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

  function getPastedImageCoordinates() {
    const targetCanvasWidth =
      canvasRef.current?.getBoundingClientRect().width ?? canvasWidth;
    const width = Math.min(
      IMAGE_DEFAULT_WIDTH,
      getBlockMaxWidth(targetCanvasWidth),
    );
    const selectedBlock = blocks.find((block) => block.id === activeBlockId);

    if (selectedBlock) {
      const selectedWidth = getRenderedBlockWidth(
        selectedBlock,
        targetCanvasWidth,
      );
      const selectedElement = blockRefs.current[selectedBlock.id];
      const selectedHeight = isImageBlock(selectedBlock)
        ? getImageBlockHeight(selectedBlock, selectedWidth)
        : Math.max(
            selectedElement?.scrollHeight ?? 28,
            selectedElement?.offsetHeight ?? 28,
            28,
          );

      return {
        x: getCanvasBoundedX(targetCanvasWidth, selectedBlock.x, width),
        y: selectedBlock.y + selectedHeight + 24,
        width,
      };
    }

    const canvasRect = canvasRef.current?.getBoundingClientRect();
    const visibleCanvasTop = canvasRect ? Math.max(24, 72 - canvasRect.top) : 72;

    return {
      x: getCanvasBoundedX(
        targetCanvasWidth,
        targetCanvasWidth - width - getBlockRightGutter(targetCanvasWidth),
        width,
      ),
      y: visibleCanvasTop,
      width,
    };
  }

  async function uploadImage(file: File) {
    const formData = new FormData();
    formData.append("file", file);

    const response = await fetch(`/api/pages/${pageId}/attachments`, {
      method: "POST",
      body: formData,
    });
    const payload = (await response.json().catch(() => null)) as
      | AttachmentUploadResponse
      | { error?: string }
      | null;

    if (
      !response.ok ||
      !payload ||
      !("attachment" in payload) ||
      !payload.attachment?.id
    ) {
      const message =
        payload && "error" in payload && payload.error
          ? payload.error
          : "بارگذاری تصویر انجام نشد.";
      throw new Error(message);
    }

    return payload;
  }

  async function insertImageFiles(
    imageFiles: File[],
    placementOverride?: CanvasCoordinates,
  ) {
    if (imageFiles.length === 0) {
      return;
    }

    const placement = placementOverride ?? getPastedImageCoordinates();
    let nextY = placement.y;
    setImageUploadError(null);

    for (const file of imageFiles) {
      setPendingImageUploads((current) => current + 1);

      try {
        const uploaded = await uploadImage(file);

        if (!isMountedRef.current) {
          continue;
        }

        const block: FreeformBlock = {
          id: createId(),
          type: "image",
          attachmentId: uploaded.attachment.id,
          fileName: uploaded.attachment.fileName,
          x: placement.x,
          y: nextY,
          width: placement.width,
          text: "",
          aspectRatio: IMAGE_DEFAULT_ASPECT_RATIO,
        };

        markEditorInteraction();
        setBlocks((current) => [...current, block]);
        setActiveBlockId(block.id);
        setSelectedBlockIds([block.id]);
        nextY += getImageBlockHeight(block, placement.width) + 24;
      } catch (error) {
        console.error("Failed to upload a pasted image.", error);

        if (isMountedRef.current) {
          setImageUploadError(
            error instanceof Error ? error.message : "بارگذاری تصویر انجام نشد.",
          );
        }
      } finally {
        if (isMountedRef.current) {
          setPendingImageUploads((current) => Math.max(0, current - 1));
        }
      }
    }
  }

  function handleImagePaste(event: React.ClipboardEvent<HTMLDivElement>) {
    const itemFiles = Array.from(event.clipboardData.items)
      .filter(
        (item) => item.kind === "file" && item.type.startsWith("image/"),
      )
      .map((item) => item.getAsFile())
      .filter((file): file is File => Boolean(file));
    const imageFiles =
      itemFiles.length > 0
        ? itemFiles
        : Array.from(event.clipboardData.files).filter((file) =>
            file.type.startsWith("image/"),
          );

    if (imageFiles.length === 0) {
      return;
    }

    event.preventDefault();
    void insertImageFiles(imageFiles);
  }

  function handleImageFileSelection(
    event: React.ChangeEvent<HTMLInputElement>,
  ) {
    const input = event.currentTarget;
    const imageFiles = Array.from(input.files ?? []).filter((file) =>
      file.type.startsWith("image/"),
    );
    input.value = "";
    void insertImageFiles(imageFiles);
  }

  async function readClipboardContent() {
    const clipboard = navigator.clipboard;

    if (!clipboard) {
      throw new Error("دسترسی به کلیپ‌بورد در این مرورگر فعال نیست.");
    }

    if (typeof clipboard.read === "function") {
      try {
        const clipboardItems = await clipboard.read();
        const imageFiles: File[] = [];

        for (const item of clipboardItems) {
          for (const type of item.types.filter((itemType) =>
            CLIPBOARD_IMAGE_TYPES.has(itemType),
          )) {
            const blob = await item.getType(type);
            const extension =
              type === "image/jpeg"
                ? "jpg"
                : type.split("/")[1]?.replace("jpeg", "jpg") || "png";
            imageFiles.push(
              new File(
                [blob],
                `clipboard-image-${imageFiles.length + 1}.${extension}`,
                { type },
              ),
            );
          }
        }

        if (imageFiles.length > 0) {
          return { imageFiles, text: "" };
        }

        for (const item of clipboardItems) {
          if (item.types.includes("text/plain")) {
            const textBlob = await item.getType("text/plain");
            return { imageFiles: [], text: await textBlob.text() };
          }
        }
      } catch (error) {
        if (typeof clipboard.readText !== "function") {
          throw error;
        }
      }
    }

    if (typeof clipboard.readText === "function") {
      return { imageFiles: [], text: await clipboard.readText() };
    }

    throw new Error("خواندن از کلیپ‌بورد در این مرورگر پشتیبانی نمی‌شود.");
  }

  async function copyTextToClipboard(text: string) {
    if (!text) {
      return;
    }

    try {
      if (!navigator.clipboard?.writeText) {
        throw new Error("نوشتن در کلیپ‌بورد پشتیبانی نمی‌شود.");
      }

      await navigator.clipboard.writeText(text);
      setImageUploadError(null);
    } catch (error) {
      console.error("Failed to copy editor text.", error);
      setImageUploadError(
        error instanceof Error
          ? error.message
          : "کپی‌کردن متن انجام نشد.",
      );
    }
  }

  async function copyImageToClipboard(block: FreeformBlock) {
    if (!block.attachmentId) {
      return;
    }

    try {
      if (
        !navigator.clipboard?.write ||
        typeof ClipboardItem === "undefined"
      ) {
        throw new Error("کپی تصویر در این مرورگر پشتیبانی نمی‌شود.");
      }

      const response = await fetch(`/api/attachments/${block.attachmentId}`);
      if (!response.ok) {
        throw new Error("دریافت تصویر برای کپی انجام نشد.");
      }

      const blob = await response.blob();
      await navigator.clipboard.write([
        new ClipboardItem({ [blob.type]: blob }),
      ]);
      setImageUploadError(null);
    } catch (error) {
      console.error("Failed to copy an editor image.", error);
      setImageUploadError(
        error instanceof Error
          ? error.message
          : "کپی‌کردن تصویر انجام نشد.",
      );
    }
  }

  function getSelectedBlocksText(ids: string[]) {
    return blocks
      .filter((block) => ids.includes(block.id) && !isImageBlock(block))
      .map((block) => block.text)
      .filter(Boolean)
      .join("\n\n");
  }

  async function pasteFromClipboard({
    placement,
    targetTitle = false,
    targetBlockId,
    selectionStart = 0,
    selectionEnd = selectionStart,
  }: {
    placement?: CanvasCoordinates;
    targetTitle?: boolean;
    targetBlockId?: string;
    selectionStart?: number;
    selectionEnd?: number;
  }) {
    try {
      setImageUploadError(null);
      const clipboardContent = await readClipboardContent();

      if (clipboardContent.imageFiles.length > 0) {
        await insertImageFiles(clipboardContent.imageFiles, placement);
        return;
      }

      if (!clipboardContent.text) {
        return;
      }

      if (targetTitle) {
        const nextTitle =
          title.slice(0, selectionStart) +
          clipboardContent.text +
          title.slice(selectionEnd);
        const nextCaretPosition =
          selectionStart + clipboardContent.text.length;

        markEditorInteraction();
        setTitle(nextTitle);
        requestAnimationFrame(() => {
          titleInputRef.current?.focus();
          titleInputRef.current?.setSelectionRange(
            nextCaretPosition,
            nextCaretPosition,
          );
        });
        return;
      }

      if (targetBlockId) {
        const targetBlock = blocks.find(
          (block) => block.id === targetBlockId && !isImageBlock(block),
        );

        if (!targetBlock) {
          return;
        }

        const nextText =
          targetBlock.text.slice(0, selectionStart) +
          clipboardContent.text +
          targetBlock.text.slice(selectionEnd);
        const nextCaretPosition =
          selectionStart + clipboardContent.text.length;

        selectionRestoreRef.current = {
          id: targetBlockId,
          start: nextCaretPosition,
          end: nextCaretPosition,
        };
        updateBlockText(targetBlockId, nextText);
        return;
      }

      if (placement) {
        addBlockAt(
          placement.x,
          placement.y,
          true,
          placement.width,
          clipboardContent.text,
        );
      }
    } catch (error) {
      console.error("Failed to paste clipboard content into the editor.", error);
      setImageUploadError(
        error instanceof Error
          ? error.message
          : "پیست‌کردن محتوا انجام نشد.",
      );
    }
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
    markEditorInteraction();
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
    markEditorInteraction();
    setBlocks((current) => {
      const target = current.find((block) => block.id === id);

      if (!target || target.text.trim()) {
        return current;
      }

      return current.filter((block) => block.id !== id);
    });
    setActiveBlockId((current) => (current === id ? null : current));
    setSelectedBlockIds((current) => current.filter((blockId) => blockId !== id));
  }

  function deleteBlock(id: string) {
    markEditorInteraction();
    setBlocks((current) => current.filter((block) => block.id !== id));
    setActiveBlockId((current) => (current === id ? null : current));
    setSelectedBlockIds((current) => current.filter((blockId) => blockId !== id));
  }

  function deleteBlocks(ids: string[]) {
    markEditorInteraction();
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

    const minWidth = isImageBlock(currentBlock) ? IMAGE_MIN_WIDTH : BLOCK_MIN_WIDTH;
    const maxWidth = Math.max(
      minWidth,
      rect.width - currentBlock.x - getBlockRightGutter(rect.width),
    );
    const nextWidth = Math.min(
      maxWidth,
      Math.max(
        minWidth,
        resizeStateRef.current.startWidth +
          event.clientX -
          resizeStateRef.current.startClientX,
      ),
    );

    markEditorInteraction();
    setBlocks((current) =>
      current.map((block) =>
        block.id === resizeStateRef.current?.id
          ? { ...block, width: nextWidth }
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

  function undoBlock(id: string) {
    markEditorInteraction();
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
    markEditorInteraction();
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

  const handleEditorCommand = useEffectEvent(
    (
      command: EditorCommand,
      payload?: {
        textColor?: string;
        fontSize?: number;
        targetBlockIds?: string[];
        primaryBlockId?: string | null;
      },
    ) => {
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
        updateBlocksByIds(targetIds, (block) => ({
          ...block,
          textColor: payload?.textColor ?? "#222222",
        }));
        return;
      case "set-font-size":
        updateBlocksByIds(targetIds, (block) => ({
          ...block,
          fontSize: Math.min(32, Math.max(13, payload?.fontSize ?? 15)),
        }));
        return;
      case "delete-block":
        deleteBlocks(targetIds);
        return;
    }
    },
  );

  useEffect(() => {
    const listener = (event: Event) => {
      const customEvent = event as CustomEvent<{
        command: EditorCommand;
        textColor?: string;
        fontSize?: number;
      }>;
      handleEditorCommand(customEvent.detail.command, {
        textColor: customEvent.detail.textColor,
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
            align: activeBlock?.align ?? "right",
            direction: activeBlock?.direction ?? "rtl",
            bold: activeBlock?.bold ?? false,
            italic: activeBlock?.italic ?? false,
            textColor: activeBlock?.textColor ?? "#222222",
            fontSize: activeBlock?.fontSize ?? 15,
            selectionCount: selectedBlockIds.length,
          },
        }),
      );
    };

    dispatchToolbarState();
    const animationFrameId = requestAnimationFrame(dispatchToolbarState);
    return () => cancelAnimationFrame(animationFrameId);
  }, [activeBlock, selectedBlockIds.length]);

  useEffect(
    () => () => {
      window.dispatchEvent(
        new CustomEvent("note-editor-state", {
          detail: {
            hasActiveBlock: false,
            canInsertImage: false,
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
    event: React.PointerEvent<HTMLButtonElement>,
    block: FreeformBlock,
  ) {
    if (!canvasRef.current) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    selectSingleBlock(block.id);
    resizeStateRef.current = {
      id: block.id,
      startClientX: event.clientX,
      startWidth: getRenderedBlockWidth(
        block,
        canvasRef.current.getBoundingClientRect().width,
      ),
    };
  }

  return (
    <div
      className="h-full bg-white"
      onPaste={handleImagePaste}
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
              className="w-full border-b pb-3 align-top"
              style={{ borderColor: notebookTheme.accent }}
            >
              <input
                ref={titleInputRef}
                value={title}
                onChange={(event) => {
                  markEditorInteraction();
                  setTitle(event.target.value);
                }}
                onBlur={() => flushPendingSave("title-blur")}
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

            {blocks.map((block) => {
              const blockWidth = getRenderedBlockWidth(block, canvasWidth);
              const blockX = getCanvasBoundedX(canvasWidth, block.x, blockWidth);
              const isSelected = selectedBlockIds.includes(block.id);

              if (isImageBlock(block) && block.attachmentId) {
                const imageHeight = getImageBlockHeight(block, blockWidth);
                const pasteWidth = Math.min(
                  IMAGE_DEFAULT_WIDTH,
                  getBlockMaxWidth(canvasWidth),
                );
                const pasteCoordinates = {
                  x: getCanvasBoundedX(canvasWidth, block.x, pasteWidth),
                  y: block.y + imageHeight + 24,
                  width: pasteWidth,
                };

                return (
                  <div
                    key={block.id}
                    data-testid={`image-block-${block.id}`}
                    data-editor-block
                    data-layout="freeform"
                    style={{
                      left: `${blockX}px`,
                      top: `${block.y}px`,
                      width: `${blockWidth}px`,
                    }}
                    className="group absolute"
                    onPointerDown={() => selectSingleBlock(block.id)}
                    onContextMenu={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      selectSingleBlock(block.id);
                      openMenu(event, {
                        title: "تصویر",
                        items: [
                          {
                            id: "copy-image",
                            label: "کپی",
                            onSelect: () => copyImageToClipboard(block),
                          },
                          {
                            id: "paste-after-image",
                            label: "پیست",
                            onSelect: () =>
                              pasteFromClipboard({
                                placement: pasteCoordinates,
                              }),
                          },
                          { id: "separator-clipboard", separator: true },
                          {
                            id: "delete-image",
                            label: "حذف تصویر از یادداشت",
                            danger: true,
                            onSelect: () => deleteBlock(block.id),
                          },
                        ],
                      });
                    }}
                  >
                    <button
                      type="button"
                      onPointerDown={(event) =>
                        startDraggingBlock(event, block)
                      }
                      className="absolute -right-8 top-1 z-10 inline-flex h-7 w-7 touch-none items-center justify-center rounded-md border border-[#d8e1ea] bg-white/95 text-[#668399] opacity-100 shadow-sm transition hover:bg-[#f0f8f4] md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100"
                      aria-label="جابه‌جایی تصویر"
                    >
                      <GripVertical className="h-4 w-4" />
                    </button>

                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        deleteBlock(block.id);
                      }}
                      className="absolute left-2 top-2 z-10 inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/80 bg-white/90 text-[#a94444] opacity-100 shadow-sm transition hover:bg-[#fff0f0] md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100"
                      aria-label="حذف تصویر"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>

                    <div
                      className="overflow-hidden rounded-xl border bg-[#f5f7f6]"
                      style={{
                        borderColor: isSelected
                          ? notebookTheme.accent
                          : "#dce5df",
                        boxShadow: isSelected
                          ? `0 0 0 2px ${notebookTheme.accent}`
                          : "0 8px 24px rgba(49, 72, 59, 0.12)",
                      }}
                    >
                      <Image
                        src={`/api/attachments/${block.attachmentId}`}
                        alt={block.fileName ?? "تصویر یادداشت"}
                        width={Math.max(1, Math.round(blockWidth))}
                        height={Math.max(1, Math.round(imageHeight))}
                        unoptimized
                        draggable={false}
                        className="block h-auto w-full select-none object-contain"
                        onLoad={(event) => {
                          const { naturalWidth, naturalHeight } =
                            event.currentTarget;

                          if (naturalWidth > 0 && naturalHeight > 0) {
                            const nextAspectRatio =
                              naturalWidth / naturalHeight;

                            if (
                              Math.abs(
                                nextAspectRatio -
                                  (block.aspectRatio ??
                                    IMAGE_DEFAULT_ASPECT_RATIO),
                              ) > 0.01
                            ) {
                              updateBlock(
                                block.id,
                                (current) => ({
                                  ...current,
                                  aspectRatio: nextAspectRatio,
                                }),
                                false,
                              );
                            }
                          }
                        }}
                      />
                    </div>

                    <button
                      type="button"
                      onPointerDown={(event) =>
                        startResizingBlock(event, block)
                      }
                      className="absolute -bottom-2 -right-2 z-10 h-5 w-5 touch-none cursor-se-resize rounded-full border-2 border-white bg-[#4f9b6c] opacity-100 shadow transition md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100"
                      aria-label="تغییر اندازه تصویر"
                    />
                  </div>
                );
              }

              return (
                <div
                  key={block.id}
                  data-testid={`note-block-${block.id}`}
                  data-editor-block
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

                  <button
                    type="button"
                    data-testid={`resize-block-${block.id}`}
                    onPointerDown={(event) => startResizingBlock(event, block)}
                    className="absolute -bottom-3 -right-3 z-10 inline-flex h-6 w-6 touch-none cursor-ew-resize items-center justify-center rounded-md border border-[#d8e1ea] bg-white/95 text-[#5f7688] opacity-0 shadow-sm transition hover:bg-[#f7fbff] hover:text-[#233746] group-hover:opacity-100 group-focus-within:opacity-100"
                    aria-label="تغییر عرض بلوک"
                  >
                    <ArrowLeftRight className="h-3.5 w-3.5" />
                  </button>

                  <textarea
                    ref={(element) => {
                      blockRefs.current[block.id] = element;
                    }}
                    value={block.text}
                    onChange={(event) => updateBlockText(block.id, event.target.value)}
                    onKeyDown={(event) => handleBlockKeyDown(event, block)}
                    onFocus={() => selectSingleBlock(block.id)}
                    onBlur={() => {
                      removeBlockIfEmpty(block.id);
                      flushPendingSave("block-blur");
                    }}
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
                      const selectionStart =
                        event.currentTarget.selectionStart ?? 0;
                      const selectionEnd =
                        event.currentTarget.selectionEnd ?? selectionStart;
                      const selectedText =
                        selectionStart !== selectionEnd
                          ? block.text.slice(selectionStart, selectionEnd)
                          : getSelectedBlocksText(selectedIds);
                      const clipboardItems = [
                        {
                          id: "copy-text",
                          label: "کپی",
                          disabled: !selectedText,
                          onSelect: () =>
                            copyTextToClipboard(selectedText),
                        },
                        {
                          id: "paste-text",
                          label: "پیست",
                          onSelect: () =>
                            pasteFromClipboard({
                              targetBlockId: block.id,
                              selectionStart,
                              selectionEnd,
                            }),
                        },
                        {
                          id: "separator-clipboard",
                          separator: true as const,
                        },
                      ];

                      openMenu(event, {
                        title:
                          selectedIds.length > 1
                            ? `${selectedIds.length} بلوک انتخاب شده`
                            : "بلوک متن",
                        items:
                          selectedIds.length > 1
                            ? [
                                ...clipboardItems,
                                {
                                  id: "align-right",
                                  label: "تراز راست",
                                  onSelect: () =>
                                    handleEditorCommand("align-right", {
                                      targetBlockIds: selectedIds,
                                      primaryBlockId: block.id,
                                    }),
                                },
                                {
                                  id: "align-center",
                                  label: "تراز وسط",
                                  onSelect: () =>
                                    handleEditorCommand("align-center", {
                                      targetBlockIds: selectedIds,
                                      primaryBlockId: block.id,
                                    }),
                                },
                                {
                                  id: "align-justify",
                                  label: "تراز کامل",
                                  onSelect: () =>
                                    handleEditorCommand("align-justify", {
                                      targetBlockIds: selectedIds,
                                      primaryBlockId: block.id,
                                    }),
                                },
                                { id: "separator-1", separator: true },
                                {
                                  id: "italic",
                                  label: "مورب کردن انتخاب",
                                  onSelect: () =>
                                    handleEditorCommand("toggle-italic", {
                                      targetBlockIds: selectedIds,
                                      primaryBlockId: block.id,
                                    }),
                                },
                                {
                                  id: "bold",
                                  label: "پررنگ کردن انتخاب",
                                  onSelect: () =>
                                    handleEditorCommand("toggle-bold", {
                                      targetBlockIds: selectedIds,
                                      primaryBlockId: block.id,
                                    }),
                                },
                                { id: "separator-2", separator: true },
                                {
                                  id: "delete-selected",
                                  label: "حذف بلوک‌های انتخاب‌شده",
                                  danger: true,
                                  onSelect: () =>
                                    handleEditorCommand("delete-block", {
                                      targetBlockIds: selectedIds,
                                      primaryBlockId: block.id,
                                    }),
                                },
                                {
                                  id: "clear-selection",
                                  label: "پاک کردن انتخاب",
                                  onSelect: () => setSelectedBlockIds([]),
                                },
                              ]
                            : [
                                ...clipboardItems,
                                {
                                  id: "undo",
                                  label: "واگرد",
                                  onSelect: () =>
                                    handleEditorCommand("undo", {
                                      targetBlockIds: selectedIds,
                                      primaryBlockId: block.id,
                                    }),
                                },
                                {
                                  id: "redo",
                                  label: "انجام دوباره",
                                  onSelect: () =>
                                    handleEditorCommand("redo", {
                                      targetBlockIds: selectedIds,
                                      primaryBlockId: block.id,
                                    }),
                                },
                                { id: "separator-1", separator: true },
                                {
                                  id: "align-right",
                                  label: "تراز راست",
                                  onSelect: () =>
                                    handleEditorCommand("align-right", {
                                      targetBlockIds: selectedIds,
                                      primaryBlockId: block.id,
                                    }),
                                },
                                {
                                  id: "align-center",
                                  label: "تراز وسط",
                                  onSelect: () =>
                                    handleEditorCommand("align-center", {
                                      targetBlockIds: selectedIds,
                                      primaryBlockId: block.id,
                                    }),
                                },
                                {
                                  id: "align-justify",
                                  label: "تراز کامل",
                                  onSelect: () =>
                                    handleEditorCommand("align-justify", {
                                      targetBlockIds: selectedIds,
                                      primaryBlockId: block.id,
                                    }),
                                },
                                { id: "separator-2", separator: true },
                                {
                                  id: "italic",
                                  label: block.italic ? "برداشتن حالت مورب" : "مورب",
                                  onSelect: () =>
                                    handleEditorCommand("toggle-italic", {
                                      targetBlockIds: selectedIds,
                                      primaryBlockId: block.id,
                                    }),
                                },
                                {
                                  id: "bold",
                                  label: block.bold ? "برداشتن حالت پررنگ" : "پررنگ",
                                  onSelect: () =>
                                    handleEditorCommand("toggle-bold", {
                                      targetBlockIds: selectedIds,
                                      primaryBlockId: block.id,
                                    }),
                                },
                                { id: "separator-3", separator: true },
                                {
                                  id: "bullet-list",
                                  label: "تبدیل به فهرست نشانه‌دار",
                                  onSelect: () =>
                                    handleEditorCommand("toggle-bullet-list", {
                                      targetBlockIds: selectedIds,
                                      primaryBlockId: block.id,
                                    }),
                                },
                                {
                                  id: "todo-list",
                                  label: "تبدیل به فهرست کارها",
                                  onSelect: () =>
                                    handleEditorCommand("toggle-todo-list", {
                                      targetBlockIds: selectedIds,
                                      primaryBlockId: block.id,
                                    }),
                                },
                                { id: "separator-4", separator: true },
                                {
                                  id: "delete-block",
                                  label: "حذف بلوک",
                                  danger: true,
                                  onSelect: () =>
                                    handleEditorCommand("delete-block", {
                                      targetBlockIds: selectedIds,
                                      primaryBlockId: block.id,
                                    }),
                                },
                              ],
                      });
                    }}
                    style={{
                      textAlign: block.align ?? "right",
                      fontWeight: block.bold ? 700 : 400,
                      fontStyle: block.italic ? "italic" : "normal",
                      color: block.textColor ?? "#222222",
                      fontSize: `${block.fontSize ?? 15}px`,
                      boxShadow: isSelected
                        ? `0 0 0 2px ${notebookTheme.accent}`
                        : "none",
                      borderRadius: "6px",
                    }}
                    className="freeform-note min-h-7 w-full resize-none overflow-hidden border-none bg-transparent px-1 py-0 text-right text-[15px] leading-7 text-[#222] outline-none"
                    dir={block.direction ?? "rtl"}
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
