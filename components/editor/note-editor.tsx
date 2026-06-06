"use client";

import { GripVertical } from "lucide-react";
import {
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  type FreeformBlock,
  parseFreeformDocument,
  serializeFreeformDocument,
} from "@/lib/notes";

type Attachment = {
  id: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
};

type NoteEditorProps = {
  pageId: string;
  initialTitle: string;
  initialHtml: string;
  attachments: Attachment[];
};

type EditorCommand =
  | "undo"
  | "redo"
  | "toggle-bold"
  | "toggle-italic"
  | "align-right"
  | "align-center"
  | "align-justify";

type BlockSnapshot = Pick<FreeformBlock, "text" | "align" | "bold" | "italic">;

const PAGE_SIDE_PADDING = 48;
const BLOCK_MIN_WIDTH = 180;
const BLOCK_DEFAULT_WIDTH = 240;
const BLOCK_MAX_WIDTH = 900;
const BLOCK_RIGHT_GUTTER = 0;
const BLOCK_RTL_CLICK_ANCHOR = 12;

function createId() {
  return `block-${Math.random().toString(36).slice(2, 10)}`;
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

export function NoteEditor({
  pageId,
  initialTitle,
  initialHtml,
  attachments: _initialAttachments,
}: NoteEditorProps) {
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
  const [status, setStatus] = useState<string | null>(null);
  const [blocks, setBlocks] = useState<FreeformBlock[]>(() =>
    getInitialBlocks(initialHtml),
  );
  const [isAutosaving, setIsAutosaving] = useState(false);
  const [activeBlockId, setActiveBlockId] = useState<string | null>(null);
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
  const initializedRef = useRef(false);
  const autosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSavedSnapshotRef = useRef("");
  const lastFocusedBlockIdRef = useRef<string | null>(null);

  const serializedDocument = useMemo(
    () =>
      serializeFreeformDocument({
        type: "freeform-v1",
        blocks,
      }),
    [blocks],
  );

  const snapshot = `${title}::${serializedDocument}`;
  const activeBlock = blocks.find((block) => block.id === activeBlockId) ?? null;

  function getCanvasBoundedX(canvasWidth: number, desiredX: number, blockWidth: number) {
    return Math.min(
      Math.max(PAGE_SIDE_PADDING, desiredX),
      Math.max(PAGE_SIDE_PADDING, canvasWidth - blockWidth - BLOCK_RIGHT_GUTTER),
    );
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
    if (!activeBlockId) return;
    if (lastFocusedBlockIdRef.current === activeBlockId) return;
    const element = blockRefs.current[activeBlockId];
    if (!element) return;
    lastFocusedBlockIdRef.current = activeBlockId;
    element.focus();
    const end = element.value.length;
    element.setSelectionRange(end, end);
  }, [activeBlockId]);

  useEffect(() => {
    Object.values(blockRefs.current).forEach((element) => {
      if (!element) return;
      element.style.height = "0px";
      element.style.height = `${Math.max(element.scrollHeight, 28)}px`;
    });
  }, [blocks]);

  const saveNote = useEffectEvent(async (isAuto = false) => {
    if (isAuto) {
      setIsAutosaving(true);
    } else {
      setStatus("Saving...");
    }

    const response = await fetch(`/api/pages/${pageId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title,
        bodyHtml: serializedDocument,
      }),
    });

    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as
        | { error?: string }
        | null;
      setStatus(payload?.error ?? "Save failed.");
      setIsAutosaving(false);
      return;
    }

    lastSavedSnapshotRef.current = `${title}::${serializedDocument}`;
    setStatus("Saved");
    setIsAutosaving(false);
  });

  useEffect(() => {
    if (!initializedRef.current) {
      lastSavedSnapshotRef.current = snapshot;
      initializedRef.current = true;
      return;
    }

    if (snapshot === lastSavedSnapshotRef.current) {
      return;
    }

    setStatus("Saving...");

    if (autosaveTimerRef.current) {
      clearTimeout(autosaveTimerRef.current);
    }

    autosaveTimerRef.current = setTimeout(() => {
      void saveNote(true);
    }, 800);

    return () => {
      if (autosaveTimerRef.current) {
        clearTimeout(autosaveTimerRef.current);
      }
    };
  }, [snapshot]);

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
  }

  function handlePageClick(event: React.MouseEvent<HTMLDivElement>) {
    if (!canvasRef.current || !pageRef.current) {
      return;
    }

    const target = event.target as HTMLElement;
    if (target.closest("textarea")) {
      return;
    }

    const pageRect = pageRef.current.getBoundingClientRect();
    const canvasRect = canvasRef.current.getBoundingClientRect();
    const x = getCanvasBoundedX(
      canvasRect.width,
      event.clientX -
        canvasRect.left -
        BLOCK_DEFAULT_WIDTH +
        BLOCK_RTL_CLICK_ANCHOR,
      BLOCK_DEFAULT_WIDTH,
    );
    const canvasOffsetTop = canvasRect.top - pageRect.top;
    const y = Math.max(24, event.clientY - pageRect.top - canvasOffsetTop);

    addBlockAt(x, y);
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

  function updateBlockText(id: string, text: string) {
    updateBlock(id, (block) => {
      const previousWidth = getBlockWidth(block.text);
      const nextWidth = getBlockWidth(text);
      const widthDelta = nextWidth - previousWidth;

      return {
        ...block,
        text,
        x: widthDelta === 0 ? block.x : block.x - widthDelta,
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
    const nextY = Math.max(24, event.clientY - rect.top - dragStateRef.current.pointerOffsetY);

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
    if (!activeBlockId) {
      return;
    }

    const activeElement = blockRefs.current[activeBlockId];
    activeElement?.focus();

    switch (command) {
      case "undo":
        undoBlock(activeBlockId);
        return;
      case "redo":
        redoBlock(activeBlockId);
        return;
      case "toggle-bold":
        updateBlock(activeBlockId, (block) => ({
          ...block,
          bold: !(block.bold ?? false),
        }));
        return;
      case "toggle-italic":
        updateBlock(activeBlockId, (block) => ({
          ...block,
          italic: !(block.italic ?? false),
        }));
        return;
      case "align-right":
        updateBlock(activeBlockId, (block) => ({ ...block, align: "right" }));
        return;
      case "align-center":
        updateBlock(activeBlockId, (block) => ({ ...block, align: "center" }));
        return;
      case "align-justify":
        updateBlock(activeBlockId, (block) => ({ ...block, align: "justify" }));
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
        },
      }),
    );
  }, [activeBlock]);

  function startDraggingBlock(
    event: React.PointerEvent<HTMLButtonElement>,
    block: FreeformBlock,
  ) {
    if (!canvasRef.current) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    setActiveBlockId(block.id);

    const rect = canvasRef.current.getBoundingClientRect();
    dragStateRef.current = {
      id: block.id,
      pointerOffsetX: event.clientX - rect.left - block.x,
      pointerOffsetY: event.clientY - rect.top - block.y,
    };
  }

  return (
    <div className="h-full bg-white">
      <div className="min-h-[calc(100vh-160px)] w-full pr-0">
        <div
          ref={pageRef}
          onClick={handlePageClick}
          className="ml-0 mr-0 mt-4 min-h-[calc(100vh-176px)] overflow-hidden rounded-[10px] border border-[#e3e3e3] bg-white pb-[60vh] shadow-[0_1px_0_rgba(0,0,0,0.04)]"
        >
          <div className="px-[48px] pt-6 text-right" dir="rtl">
            <div className="inline-block min-w-[360px] max-w-[560px] border-b border-[#9b9b9b] pb-3 align-top">
              <h1 className="mb-2 text-[22px] font-normal text-[#111]">{title}</h1>
              <div className="flex gap-8 text-[12px] text-[#6f6f6f]">
                <span>{persianDateLabel}</span>
                <span>{persianTimeLabel}</span>
              </div>
            </div>
          </div>

          <div
            ref={canvasRef}
            className="freeform-canvas relative min-h-[calc(100vh-260px)] bg-white"
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

              return (
                <div
                  key={block.id}
                  style={{
                    left: `${block.x}px`,
                    top: `${block.y}px`,
                    width: `${blockWidth}px`,
                  }}
                  className="group absolute"
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
                  onFocus={() => setActiveBlockId(block.id)}
                  onBlur={() => removeBlockIfEmpty(block.id)}
                  onClick={(event) => event.stopPropagation()}
                  style={{
                    textAlign: block.align ?? "right",
                    fontWeight: block.bold ? 700 : 400,
                    fontStyle: block.italic ? "italic" : "normal",
                  }}
                  className="freeform-note min-h-7 w-full resize-none overflow-hidden border-none bg-transparent px-1 py-0 text-right text-[15px] leading-7 text-[#222] outline-none"
                  dir="rtl"
                />
              </div>
              );
            })}

            {blocks.length === 0 ? (
              <div className="px-[48px] py-8 text-right text-sm text-[#8b8b8b]">
                Click anywhere on the page and start writing.
              </div>
            ) : null}
          </div>
        </div>

      </div>
    </div>
  );
}
