"use client";

import { GripVertical } from "lucide-react";
import { useEffect, useEffectEvent, useMemo, useRef, useState } from "react";

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
  notebookId: string;
  pageId: string;
  initialTitle: string;
  initialHtml: string;
  initialUpdatedAt: string;
  attachments: Attachment[];
};

type BlockSnapshot = Pick<FreeformBlock, "text" | "align" | "bold" | "italic">;

const PAGE_SIDE_PADDING = 48;
const BLOCK_MIN_WIDTH = 180;
const BLOCK_DEFAULT_WIDTH = 240;
const BLOCK_MAX_WIDTH = 900;
const BLOCK_RIGHT_GUTTER = 0;
const BLOCK_RTL_CLICK_ANCHOR = 12;
const BULLET_PREFIX = "\u25CF ";
const TODO_PREFIX = "\u2610 ";
const TODO_DONE_PREFIX = "\u2611 ";

function createId() {
  return `block-${Math.random().toString(36).slice(2, 10)}`;
}

function toStatusLabel(syncStatus: SyncStatus, isOnline: boolean) {
  if (syncStatus === "conflict") {
    return "Conflict";
  }

  if (syncStatus === "failed") {
    return "Sync failed";
  }

  if (syncStatus === "pending") {
    return isOnline ? "Syncing" : "Saved locally";
  }

  return isOnline ? "Synced" : "Offline";
}

function getBlockWidth(text: string) {
  const longestLineLength = text
    .split("\n")
    .reduce((max, line) => Math.max(max, line.trim().length), 0);

  if (longestLineLength === 0) {
    return BLOCK_DEFAULT_WIDTH;
  }

  return Math.min(
    BLOCK_MAX_WIDTH,
    Math.max(BLOCK_MIN_WIDTH, longestLineLength * 11 + 56),
  );
}

function getInitialBlocks(initialHtml: string): FreeformBlock[] {
  const parsed = parseFreeformDocument(initialHtml);

  if (parsed) {
    return parsed.blocks.length > 0
      ? parsed.blocks
      : [{ id: createId(), x: 96, y: 72, text: "", align: "right" }];
  }

  const plainText = initialHtml
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return [
    {
      id: createId(),
      x: 96,
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
  notebookId,
  pageId,
  initialTitle,
  initialHtml,
  initialUpdatedAt,
  attachments: _initialAttachments,
}: NoteEditorProps) {
  const { openMenu } = useContextMenu();
  const notebookTheme = getNotebookTheme(notebookId);
  const now = new Date();
  const dateParts = new Intl.DateTimeFormat("fa-IR-u-ca-persian", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).formatToParts(now);
  const day = dateParts.find((part) => part.type === "day")?.value ?? "";
  const month = dateParts.find((part) => part.type === "month")?.value ?? "";
  const year = dateParts.find((part) => part.type === "year")?.value ?? "";
  const persianDateLabel = `${day} ${month} ${year}`;
  const persianTimeLabel = now.toLocaleTimeString("fa-IR", {
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
  const lastFocusedBlockIdRef = useRef<string | null>(null);
  const lastSyncedAtRef = useRef(initialUpdatedAt);
  const selectionRestoreRef = useRef<{
    id: string;
    start: number;
    end: number;
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

  const snapshot = `${title}::${serializedDocument}`;
  const activeBlock = blocks.find((block) => block.id === activeBlockId) ?? null;
  const selectedBlocks = blocks.filter((block) => selectedBlockIds.includes(block.id));
  const statusMessage = !isHydrated
    ? "Loading..."
    : isSavingLocally
      ? "Saving locally..."
      : toStatusLabel(syncStatus, isOnline);
  const shouldShowStatus =
    !isHydrated || isSavingLocally || syncStatus !== "synced" || !isOnline;

  function getCanvasBoundedX(
    canvasWidth: number,
    desiredX: number,
    blockWidth: number,
  ) {
    return Math.min(
      Math.max(PAGE_SIDE_PADDING, desiredX),
      Math.max(
        PAGE_SIDE_PADDING,
        canvasWidth - blockWidth - BLOCK_RIGHT_GUTTER,
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
      const localPage = await getLocalPage(pageId);
      const serverUpdatedAt = new Date(initialUpdatedAt).getTime();
      const localUpdatedAt = localPage ? new Date(localPage.updatedAt).getTime() : 0;
      const shouldPreferLocal =
        Boolean(localPage) &&
        ((localPage?.syncStatus ?? "synced") !== "synced" ||
          localUpdatedAt >= serverUpdatedAt);

      const serverPage: LocalPage = {
        id: pageId,
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
  }, [initialHtml, initialTitle, initialUpdatedAt, notebookId, pageId]);

  useEffect(() => {
    if (!isHydrated || !activeBlockId) {
      return;
    }

    if (lastFocusedBlockIdRef.current === activeBlockId) {
      return;
    }

    const element = blockRefs.current[activeBlockId];
    if (!element) {
      return;
    }

    lastFocusedBlockIdRef.current = activeBlockId;
    element.focus();
    const end = element.value.length;
    element.setSelectionRange(end, end);
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
  }, [blocks]);

  const saveNoteLocally = useEffectEvent(async () => {
    try {
      const updatedAt = new Date().toISOString();
      const localPage: LocalPage = {
        id: pageId,
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
        await processSyncQueue();
        const refreshed = await getLocalPage(pageId);

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
        pageId?: string;
        syncStatus?: SyncStatus;
        lastSyncedAt?: string | null;
      }>;

      if (customEvent.detail?.pageId !== pageId || !customEvent.detail.syncStatus) {
        return;
      }

      setSyncStatus(customEvent.detail.syncStatus);
      if (customEvent.detail.lastSyncedAt) {
        lastSyncedAtRef.current = customEvent.detail.lastSyncedAt;
      }
    };

    window.addEventListener("notava-sync", listener);
    return () => window.removeEventListener("notava-sync", listener);
  }, [pageId]);

  function addBlockAt(x: number, y: number) {
    const block: FreeformBlock = {
      id: createId(),
      x,
      y,
      text: "",
      align: "right",
    };

    setBlocks((current) => [...current, block]);
    setActiveBlockId(block.id);
    setSelectedBlockIds([block.id]);
  }

  function getCanvasCoordinates(
    clientX: number,
    clientY: number,
    blockWidth = BLOCK_DEFAULT_WIDTH,
  ) {
    if (!canvasRef.current || !pageRef.current) {
      return null;
    }

    const pageRect = pageRef.current.getBoundingClientRect();
    const canvasRect = canvasRef.current.getBoundingClientRect();
    const x = getCanvasBoundedX(
      canvasRect.width,
      clientX - canvasRect.left - blockWidth + BLOCK_RTL_CLICK_ANCHOR,
      blockWidth,
    );
    const canvasOffsetTop = canvasRect.top - pageRect.top;
    const y = Math.max(24, clientY - pageRect.top - canvasOffsetTop);

    return { x, y };
  }

  function handlePageClick(event: React.MouseEvent<HTMLDivElement>) {
    const target = event.target as HTMLElement;
    if (target.closest("textarea") || target.closest("button")) {
      return;
    }

    const coordinates = getCanvasCoordinates(event.clientX, event.clientY);

    if (coordinates) {
      addBlockAt(coordinates.x, coordinates.y);
    }
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
      const previousWidth = getBlockWidth(block.text);
      const nextWidth = getBlockWidth(text);
      const widthDelta = nextWidth - previousWidth;
      const canvasWidth = canvasRef.current?.getBoundingClientRect().width ?? BLOCK_MAX_WIDTH;
      const nextX = getCanvasBoundedX(
        canvasWidth,
        widthDelta === 0 ? block.x : block.x - widthDelta,
        nextWidth,
      );

      return {
        ...block,
        text,
        x: nextX,
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
    setBlocks((current) => current.filter((block) => !ids.includes(block.id)));
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
    const blockWidth = getBlockWidth(currentBlock?.text ?? "");
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
          ? { ...block, x: nextX, y: nextY }
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
    dragStateRef.current = {
      id: block.id,
      pointerOffsetX: event.clientX - rect.left - block.x,
      pointerOffsetY: event.clientY - rect.top - block.y,
    };
  }

  return (
    <div className="h-full bg-white">
      <div className="min-h-[calc(100vh-120px)] w-full">
        <div
          ref={pageRef}
          onClick={handlePageClick}
          className="mt-0 min-h-[calc(100vh-136px)] overflow-hidden border-x-0 border-y bg-white pb-[60vh] md:mt-4 md:rounded-[10px] md:border"
          style={{
            borderColor: notebookTheme.editorBorder,
            boxShadow: `0 1px 0 rgba(0,0,0,0.04), 0 14px 36px ${notebookTheme.editorGlow}`,
          }}
        >
          <div className="px-4 pt-5 text-right md:px-[48px] md:pt-6" dir="rtl">
            <div
              className="inline-block min-w-[260px] max-w-[560px] border-b pb-3 align-top"
              style={{ borderColor: notebookTheme.accent }}
            >
              <h1 className="mb-2 text-[22px] font-normal text-[#111]">{title}</h1>
              <div className="flex flex-row-reverse gap-8 text-[12px] text-[#6f6f6f]">
                <span>{persianTimeLabel}</span>
                <span>{persianDateLabel}</span>
              </div>
            </div>

            {shouldShowStatus ? (
              <div className="mt-3 text-left text-[11px] text-[#6d7c8e]" dir="ltr">
                {statusMessage}
              </div>
            ) : null}
          </div>

          <div
            ref={canvasRef}
            className="freeform-canvas relative min-h-[calc(100vh-240px)] bg-white"
            onContextMenu={(event) => {
              const target = event.target as HTMLElement;

              if (target.closest("textarea") || target.closest("button")) {
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
                    ? `${selectedBlockIds.length} blocks selected`
                    : "Editor",
                items:
                  selectedBlockIds.length > 1
                    ? [
                        {
                          id: "new-block",
                          label: "Add text block here",
                          onSelect: () => addBlockAt(coordinates.x, coordinates.y),
                        },
                        { id: "separator-1", separator: true },
                        {
                          id: "delete-selected-blocks",
                          label: "Delete selected blocks",
                          danger: true,
                          onSelect: () => deleteBlocks(selectedBlockIds),
                        },
                        {
                          id: "clear-selection",
                          label: "Clear selection",
                          onSelect: () => setSelectedBlockIds([]),
                        },
                      ]
                    : [
                        {
                          id: "new-block",
                          label: "Add text block here",
                          onSelect: () => addBlockAt(coordinates.x, coordinates.y),
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
              const blockWidth = getBlockWidth(block.text);
              const isSelected = selectedBlockIds.includes(block.id);

              return (
                <div
                  key={block.id}
                  style={{
                    left: `${block.x}px`,
                    top: `${block.y}px`,
                    width: `${blockWidth}px`,
                  }}
                  className="group absolute rounded-md"
                >
                  <button
                    type="button"
                    onPointerDown={(event) => startDraggingBlock(event, block)}
                    className="absolute -right-8 top-1 inline-flex h-6 w-6 items-center justify-center rounded-md border border-[#d8e1ea] bg-white/95 text-[#7a94a6] opacity-0 shadow-sm transition hover:bg-[#f7fbff] group-hover:opacity-100"
                    aria-label="Move block"
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
                            ? `${selectedIds.length} blocks selected`
                            : "Text block",
                        items:
                          selectedIds.length > 1
                            ? [
                                {
                                  id: "align-right",
                                  label: "Align right",
                                  onSelect: () => dispatchEditorCommand("align-right"),
                                },
                                {
                                  id: "align-center",
                                  label: "Align center",
                                  onSelect: () => dispatchEditorCommand("align-center"),
                                },
                                {
                                  id: "align-justify",
                                  label: "Justify",
                                  onSelect: () => dispatchEditorCommand("align-justify"),
                                },
                                { id: "separator-1", separator: true },
                                {
                                  id: "italic",
                                  label: "Toggle italic on selected",
                                  onSelect: () =>
                                    dispatchEditorCommand("toggle-italic"),
                                },
                                {
                                  id: "bold",
                                  label: "Toggle bold on selected",
                                  onSelect: () =>
                                    dispatchEditorCommand("toggle-bold"),
                                },
                                { id: "separator-2", separator: true },
                                {
                                  id: "delete-selected",
                                  label: "Delete selected blocks",
                                  danger: true,
                                  onSelect: () =>
                                    dispatchEditorCommand("delete-block"),
                                },
                                {
                                  id: "clear-selection",
                                  label: "Clear selection",
                                  onSelect: () => setSelectedBlockIds([]),
                                },
                              ]
                            : [
                                {
                                  id: "undo",
                                  label: "Undo",
                                  onSelect: () => dispatchEditorCommand("undo"),
                                },
                                {
                                  id: "redo",
                                  label: "Redo",
                                  onSelect: () => dispatchEditorCommand("redo"),
                                },
                                { id: "separator-1", separator: true },
                                {
                                  id: "align-right",
                                  label: "Align right",
                                  onSelect: () =>
                                    dispatchEditorCommand("align-right"),
                                },
                                {
                                  id: "align-center",
                                  label: "Align center",
                                  onSelect: () =>
                                    dispatchEditorCommand("align-center"),
                                },
                                {
                                  id: "align-justify",
                                  label: "Justify",
                                  onSelect: () =>
                                    dispatchEditorCommand("align-justify"),
                                },
                                { id: "separator-2", separator: true },
                                {
                                  id: "italic",
                                  label: block.italic ? "Remove italic" : "Italic",
                                  onSelect: () =>
                                    dispatchEditorCommand("toggle-italic"),
                                },
                                {
                                  id: "bold",
                                  label: block.bold ? "Remove bold" : "Bold",
                                  onSelect: () => dispatchEditorCommand("toggle-bold"),
                                },
                                { id: "separator-3", separator: true },
                                {
                                  id: "bullet-list",
                                  label: "Toggle bullet list",
                                  onSelect: () =>
                                    dispatchEditorCommand("toggle-bullet-list"),
                                },
                                {
                                  id: "todo-list",
                                  label: "Toggle todo list",
                                  onSelect: () =>
                                    dispatchEditorCommand("toggle-todo-list"),
                                },
                                { id: "separator-4", separator: true },
                                {
                                  id: "delete-block",
                                  label: "Delete block",
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
                Click anywhere on the page and start writing.
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
