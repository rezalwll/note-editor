"use client";

import {
  useEffect,
  useEffectEvent,
  useMemo,
  useState,
  useRef,
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

const PAGE_SIDE_PADDING = 48;
const BLOCK_MIN_WIDTH = 100;
const BLOCK_MAX_WIDTH = 420;
const BLOCK_RIGHT_GUTTER = 0;
const BLOCK_RTL_CLICK_ANCHOR = 12;

function createId() {
  return `block-${Math.random().toString(36).slice(2, 10)}`;
}

function getInitialBlocks(initialHtml: string): FreeformBlock[] {
  const parsed = parseFreeformDocument(initialHtml);

  if (parsed) {
    return parsed.blocks.length > 0
      ? parsed.blocks
      : [{ id: createId(), x: 96, y: 72, text: "" }];
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
  const initializedRef = useRef(false);
  const autosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSavedSnapshotRef = useRef("");

  const serializedDocument = useMemo(
    () =>
      serializeFreeformDocument({
        type: "freeform-v1",
        blocks,
      }),
    [blocks],
  );

  const snapshot = `${title}::${serializedDocument}`;

  useEffect(() => {
    if (!activeBlockId) return;
    const element = blockRefs.current[activeBlockId];
    if (!element) return;
    element.focus();
    const end = element.value.length;
    element.setSelectionRange(end, end);
  }, [activeBlockId, blocks]);

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
    const maxX = Math.max(
      PAGE_SIDE_PADDING,
      canvasRect.width - BLOCK_MIN_WIDTH - BLOCK_RIGHT_GUTTER,
    );
    const x = Math.min(
      Math.max(
        PAGE_SIDE_PADDING,
        event.clientX - canvasRect.left - BLOCK_MIN_WIDTH + BLOCK_RTL_CLICK_ANCHOR,
      ),
      maxX,
    );
    const canvasOffsetTop = canvasRect.top - pageRect.top;
    const y = Math.max(24, event.clientY - pageRect.top - canvasOffsetTop);

    addBlockAt(x, y);
  }

  function updateBlockText(id: string, text: string) {
    setBlocks((current) =>
      current.map((block) => (block.id === id ? { ...block, text } : block)),
    );
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
              <div className="flex flex-row-reverse justify-start gap-8 text-[12px] text-[#6f6f6f]">
                <span>
                  {now.toLocaleDateString("fa-IR", {
                    weekday: "long",
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                    calendar: "persian",
                  })}
                </span>
                <span>
                  {now.toLocaleTimeString("fa-IR", {
                    hour: "2-digit",
                    minute: "2-digit",
                    hour12: false,
                  })}
                </span>
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

            {blocks.map((block) => (
              <textarea
                key={block.id}
                ref={(element) => {
                  blockRefs.current[block.id] = element;
                }}
                value={block.text}
                onChange={(event) => updateBlockText(block.id, event.target.value)}
                onFocus={() => setActiveBlockId(block.id)}
                onBlur={() => removeBlockIfEmpty(block.id)}
                onClick={(event) => event.stopPropagation()}
                style={{
                  left: `${block.x}px`,
                  top: `${block.y}px`,
                }}
                className="freeform-note absolute min-h-7 w-[100px] max-w-[420px] resize-none overflow-hidden border-none bg-transparent px-1 py-0 text-right text-[15px] leading-7 text-[#222] outline-none"
                dir="rtl"
              />
            ))}

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
