"use client";

import Image from "next/image";
import { GripVertical, Trash2 } from "lucide-react";
import React, { Suspense, lazy } from "react";

import type { ContextMenuEntry } from "@/components/context-menu";
import type { RichTextBlockHandle } from "@/components/editor/rich-text-block-editor";
import type { EditorCommand } from "@/lib/editor-events";
import {
  IMAGE_DEFAULT_ASPECT_RATIO,
  IMAGE_DEFAULT_WIDTH,
  getBlockMaxWidth,
  getImageBlockHeight,
  getRenderedBlockWidth,
  isImageBlock,
} from "@/lib/editor-document";
import type { getNotebookTheme } from "@/lib/notebook-theme";
import type { FreeformBlock } from "@/lib/notes";

const RichTextBlockEditor = lazy(() =>
  import("@/components/editor/rich-text-block-editor").then((module) => ({
    default: module.RichTextBlockEditor,
  })),
);

type OpenMenu = (
  event:
    | Pick<MouseEvent, "clientX" | "clientY">
    | Pick<React.MouseEvent, "clientX" | "clientY">,
  options: { title?: string; items: ContextMenuEntry[] },
) => void;

type PasteTarget = {
  placement?: { x: number; y: number; width: number };
  targetTitle?: boolean;
  targetBlockId?: string;
  selectionStart?: number;
  selectionEnd?: number;
};

type EditorCommandPayload = {
  textColor?: string;
  highlightColor?: string;
  fontSize?: number;
  targetBlockIds?: string[];
  primaryBlockId?: string | null;
};

type NoteEditorBlockProps = {
  block: FreeformBlock;
  canvasWidth: number;
  selectedBlockIds: string[];
  notebookTheme: ReturnType<typeof getNotebookTheme>;
  richTextInitialSelections: Record<string, { start: number; end: number }>;
  setBlockRef: (blockId: string, element: HTMLTextAreaElement | null) => void;
  setRichTextBlockRef: (
    blockId: string,
    handle: RichTextBlockHandle | null,
  ) => void;
  textSelectionRef: {
    current: Record<string, { start: number; end: number }>;
  };
  getCanvasBoundedX: (
    canvasWidth: number,
    requestedX: number,
    blockWidth: number,
  ) => number;
  selectSingleBlock: (blockId: string) => void;
  startDraggingBlock: (
    event: React.PointerEvent<HTMLButtonElement>,
    block: FreeformBlock,
  ) => void;
  startResizingBlock: (
    event: React.PointerEvent<HTMLElement>,
    block: FreeformBlock,
    edge?: "left" | "right",
  ) => void;
  copyImageToClipboard: (block: FreeformBlock) => void | Promise<void>;
  pasteFromClipboard: (target: PasteTarget) => void | Promise<void>;
  deleteBlock: (blockId: string) => void;
  updateBlock: (
    blockId: string,
    updater: (block: FreeformBlock) => FreeformBlock,
    trackHistory?: boolean,
  ) => void;
  finishHistoryGroup: () => void;
  removeBlockIfEmpty: (blockId: string) => void;
  flushPendingSave: (reason: string) => void;
  updateBlockText: (blockId: string, text: string, richText?: string) => void;
  setActiveRichTextStyle: React.Dispatch<
    React.SetStateAction<{
      blockId: string;
      textColor: string;
      highlightColor: string;
      fontSize: number;
    } | null>
  >;
  openMenu: OpenMenu;
  copyTextToClipboard: (text: string) => void | Promise<void>;
  handleBlockKeyDown: (
    event: React.KeyboardEvent<HTMLTextAreaElement>,
    block: FreeformBlock,
  ) => void;
  toggleBlockSelection: (blockId: string) => void;
  getSelectedBlocksText: (blockIds: string[]) => string;
  runEditorCommand: (
    command: EditorCommand,
    payload?: EditorCommandPayload,
  ) => void;
  setSelectedBlockIds: React.Dispatch<React.SetStateAction<string[]>>;
};

export function NoteEditorBlock({
  block,
  canvasWidth,
  selectedBlockIds,
  notebookTheme,
  richTextInitialSelections,
  setBlockRef,
  setRichTextBlockRef,
  textSelectionRef,
  getCanvasBoundedX,
  selectSingleBlock,
  startDraggingBlock,
  startResizingBlock,
  copyImageToClipboard,
  pasteFromClipboard,
  deleteBlock,
  updateBlock,
  finishHistoryGroup,
  removeBlockIfEmpty,
  flushPendingSave,
  updateBlockText,
  setActiveRichTextStyle,
  openMenu,
  copyTextToClipboard,
  handleBlockKeyDown,
  toggleBlockSelection,
  getSelectedBlocksText,
  runEditorCommand,
  setSelectedBlockIds,
}: NoteEditorBlockProps) {
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
                    data-block-id={block.id}
                    data-layout="freeform"
                    style={{
                      left: `${blockX}px`,
                      top: `${block.y}px`,
                      width: `${blockWidth}px`,
                    }}
                    className="group absolute rounded-md"
                  >
                    <div
                      role="separator"
                      aria-label="تغییر عرض بلوک از مرز چپ"
                      aria-orientation="vertical"
                      data-testid={`resize-edge-block-${block.id}`}
                      onPointerDown={(event) =>
                        startResizingBlock(event, block, "left")
                      }
                      className="absolute -left-1 top-0 z-10 h-full w-2 touch-none cursor-ew-resize"
                    />
  
                    <button
                      type="button"
                      onPointerDown={(event) => startDraggingBlock(event, block)}
                      className="absolute -right-7 top-1 inline-flex h-6 w-6 items-center justify-center rounded-md border border-[#d8e1ea] bg-white/95 text-[#7a94a6] opacity-0 shadow-sm transition hover:bg-[#f7fbff] group-hover:opacity-100 md:-right-8"
                      aria-label="جابجایی بلوک"
                    >
                      <GripVertical className="h-3.5 w-3.5" />
                    </button>
  
                    {block.richText ? (
                      <Suspense
                        fallback={
                          <div
                            className="min-h-7 w-full px-1 text-right text-[15px] leading-7 text-[#222]"
                            dir={block.direction ?? "rtl"}
                          >
                            {block.text}
                          </div>
                        }
                      >
                      <RichTextBlockEditor
                        ref={(handle) => setRichTextBlockRef(block.id, handle)}
                        html={block.richText}
                        direction={block.direction ?? "rtl"}
                        textAlign={block.align ?? "right"}
                        defaultColor={block.textColor ?? "#222222"}
                        defaultFontSize={block.fontSize ?? 15}
                        bold={block.bold ?? false}
                        italic={block.italic ?? false}
                        isSelected={isSelected}
                        selectionColor={notebookTheme.accent}
                        initialSelection={richTextInitialSelections[block.id]}
                        onFocus={() => selectSingleBlock(block.id)}
                        onBlur={() => {
                          finishHistoryGroup();
                          removeBlockIfEmpty(block.id);
                          flushPendingSave("block-blur");
                        }}
                        onUpdate={(text, richText) =>
                          updateBlockText(block.id, text, richText)
                        }
                        onSelectionStyleChange={(style) =>
                          setActiveRichTextStyle({ blockId: block.id, ...style })
                        }
                        onContextMenu={(event, selectedText) => {
                          selectSingleBlock(block.id);
                          openMenu(event, {
                            title: "Ø¨Ù„ÙˆÚ© Ù…ØªÙ†",
                            items: [
                              {
                                id: "copy-text",
                                label: "Ú©Ù¾ÛŒ",
                                disabled: !selectedText,
                                onSelect: () => copyTextToClipboard(selectedText),
                              },
                              {
                                id: "paste-text",
                                label: "Ù¾ÛŒØ³Øª",
                                onSelect: () =>
                                  pasteFromClipboard({ targetBlockId: block.id }),
                              },
                              { id: "separator-clipboard", separator: true },
                              {
                                id: "delete-block",
                                label: "Ø­Ø°Ù Ø¨Ù„ÙˆÚ©",
                                danger: true,
                                onSelect: () => deleteBlock(block.id),
                              },
                            ],
                          });
                        }}
                      />
                      </Suspense>
                    ) : (
                    <textarea
                    ref={(element) => setBlockRef(block.id, element)}
                      value={block.text}
                      onChange={(event) => updateBlockText(block.id, event.target.value)}
                      onKeyDown={(event) => handleBlockKeyDown(event, block)}
                      onFocus={() => selectSingleBlock(block.id)}
                      onSelect={(event) => {
                        textSelectionRef.current[block.id] = {
                          start: event.currentTarget.selectionStart ?? 0,
                          end:
                            event.currentTarget.selectionEnd ??
                            event.currentTarget.selectionStart ??
                            0,
                        };
                      }}
                      onBlur={() => {
                        finishHistoryGroup();
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
                                      runEditorCommand("align-right", {
                                        targetBlockIds: selectedIds,
                                        primaryBlockId: block.id,
                                      }),
                                  },
                                  {
                                    id: "align-center",
                                    label: "تراز وسط",
                                    onSelect: () =>
                                      runEditorCommand("align-center", {
                                        targetBlockIds: selectedIds,
                                        primaryBlockId: block.id,
                                      }),
                                  },
                                  {
                                    id: "align-justify",
                                    label: "تراز کامل",
                                    onSelect: () =>
                                      runEditorCommand("align-justify", {
                                        targetBlockIds: selectedIds,
                                        primaryBlockId: block.id,
                                      }),
                                  },
                                  { id: "separator-1", separator: true },
                                  {
                                    id: "italic",
                                    label: "مورب کردن انتخاب",
                                    onSelect: () =>
                                      runEditorCommand("toggle-italic", {
                                        targetBlockIds: selectedIds,
                                        primaryBlockId: block.id,
                                      }),
                                  },
                                  {
                                    id: "bold",
                                    label: "پررنگ کردن انتخاب",
                                    onSelect: () =>
                                      runEditorCommand("toggle-bold", {
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
                                      runEditorCommand("delete-block", {
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
                                      runEditorCommand("undo", {
                                        targetBlockIds: selectedIds,
                                        primaryBlockId: block.id,
                                      }),
                                  },
                                  {
                                    id: "redo",
                                    label: "انجام دوباره",
                                    onSelect: () =>
                                      runEditorCommand("redo", {
                                        targetBlockIds: selectedIds,
                                        primaryBlockId: block.id,
                                      }),
                                  },
                                  { id: "separator-1", separator: true },
                                  {
                                    id: "align-right",
                                    label: "تراز راست",
                                    onSelect: () =>
                                      runEditorCommand("align-right", {
                                        targetBlockIds: selectedIds,
                                        primaryBlockId: block.id,
                                      }),
                                  },
                                  {
                                    id: "align-center",
                                    label: "تراز وسط",
                                    onSelect: () =>
                                      runEditorCommand("align-center", {
                                        targetBlockIds: selectedIds,
                                        primaryBlockId: block.id,
                                      }),
                                  },
                                  {
                                    id: "align-justify",
                                    label: "تراز کامل",
                                    onSelect: () =>
                                      runEditorCommand("align-justify", {
                                        targetBlockIds: selectedIds,
                                        primaryBlockId: block.id,
                                      }),
                                  },
                                  { id: "separator-2", separator: true },
                                  {
                                    id: "italic",
                                    label: block.italic ? "برداشتن حالت مورب" : "مورب",
                                    onSelect: () =>
                                      runEditorCommand("toggle-italic", {
                                        targetBlockIds: selectedIds,
                                        primaryBlockId: block.id,
                                      }),
                                  },
                                  {
                                    id: "bold",
                                    label: block.bold ? "برداشتن حالت پررنگ" : "پررنگ",
                                    onSelect: () =>
                                      runEditorCommand("toggle-bold", {
                                        targetBlockIds: selectedIds,
                                        primaryBlockId: block.id,
                                      }),
                                  },
                                  { id: "separator-3", separator: true },
                                  {
                                    id: "bullet-list",
                                    label: "تبدیل به فهرست نشانه‌دار",
                                    onSelect: () =>
                                      runEditorCommand("toggle-bullet-list", {
                                        targetBlockIds: selectedIds,
                                        primaryBlockId: block.id,
                                      }),
                                  },
                                  {
                                    id: "todo-list",
                                    label: "تبدیل به فهرست کارها",
                                    onSelect: () =>
                                      runEditorCommand("toggle-todo-list", {
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
                                      runEditorCommand("delete-block", {
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
                    )}
                  </div>
                  );
}
