"use client";

import {
  useEffect,
  useEffectEvent,
  type Dispatch,
  type RefObject,
  type SetStateAction,
} from "react";

import type { RichTextBlockHandle } from "@/components/editor/rich-text-block-editor";
import type { EditorCommand } from "@/lib/editor-events";
import {
  createRichTextSelectionHtml,
  isImageBlock,
  type EditorDocumentSnapshot,
} from "@/lib/editor-document";
import type { FreeformBlock } from "@/lib/notes";

const BULLET_PREFIX = "\u25CF ";

export type EditorCommandPayload = {
  textColor?: string;
  highlightColor?: string;
  fontSize?: number;
  targetBlockIds?: string[];
  primaryBlockId?: string | null;
};

type ActiveRichTextStyle = {
  blockId: string;
  bold: boolean;
  italic: boolean;
  textColor: string;
  highlightColor: string;
  fontSize: number;
} | null;

type UseNoteEditorCommandsOptions = {
  activeBlock: FreeformBlock | null;
  activeBlockId: string | null;
  activeRichTextStyle: ActiveRichTextStyle;
  blocks: FreeformBlock[];
  selectedBlockIds: string[];
  title: string;
  blockRefs: RefObject<Record<string, HTMLTextAreaElement | null>>;
  richTextBlockRefs: RefObject<Record<string, RichTextBlockHandle | null>>;
  textSelectionRef: RefObject<
    Record<string, { start: number; end: number }>
  >;
  imageFileInputRef: RefObject<HTMLInputElement | null>;
  historyRef: RefObject<{
    past: EditorDocumentSnapshot[];
    future: EditorDocumentSnapshot[];
  }>;
  setRichTextInitialSelections: Dispatch<
    SetStateAction<Record<string, { start: number; end: number }>>
  >;
  updateBlock: (
    blockId: string,
    updater: (block: FreeformBlock) => FreeformBlock,
  ) => void;
  updateBlocksByIds: (
    blockIds: string[],
    updater: (block: FreeformBlock) => FreeformBlock,
  ) => void;
  toggleSelectedLines: (blockId: string, prefix: string) => void;
  cycleTodoLines: (blockId: string) => void;
  deleteBlocks: (blockIds: string[]) => void;
  undoDocument: () => void;
  redoDocument: () => void;
};

export function useNoteEditorCommands({
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
}: UseNoteEditorCommandsOptions) {
  function applyInlineTextStyle(
    blockId: string,
    style: {
      textColor?: string;
      highlightColor?: string;
      fontSize?: number;
      bold?: boolean;
      italic?: boolean;
    },
  ) {
    const richTextHandle = richTextBlockRefs.current[blockId];
    if (richTextHandle) {
      if (style.bold) return richTextHandle.toggleBold();
      if (style.italic) return richTextHandle.toggleItalic();
      if (style.textColor) richTextHandle.setTextColor(style.textColor);
      if (style.highlightColor) {
        richTextHandle.setHighlightColor(style.highlightColor);
      }
      if (style.fontSize) richTextHandle.setFontSize(style.fontSize);
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
    payload?: EditorCommandPayload,
  ) {
    if (command === "undo") return undoDocument();
    if (command === "redo") return redoDocument();
    if (command === "insert-image") {
      imageFileInputRef.current?.click();
      return;
    }

    const targetIds =
      payload?.targetBlockIds?.length
        ? payload.targetBlockIds
        : selectedBlockIds.length > 0
          ? selectedBlockIds
          : activeBlockId
            ? [activeBlockId]
            : [];
    if (targetIds.length === 0) return;

    const primaryBlockId =
      payload?.primaryBlockId ?? activeBlockId ?? targetIds[0];
    richTextBlockRefs.current[primaryBlockId]?.focus();
    blockRefs.current[primaryBlockId]?.focus();

    switch (command) {
      case "toggle-bold":
        if (applyInlineTextStyle(primaryBlockId, { bold: true })) return;
        updateBlocksByIds(targetIds, (block) => ({
          ...block,
          bold: !(block.bold ?? false),
        }));
        return;
      case "toggle-italic":
        if (applyInlineTextStyle(primaryBlockId, { italic: true })) return;
        updateBlocksByIds(targetIds, (block) => ({
          ...block,
          italic: !(block.italic ?? false),
        }));
        return;
      case "toggle-bullet-list":
        toggleSelectedLines(primaryBlockId, BULLET_PREFIX);
        return;
      case "toggle-todo-list":
        cycleTodoLines(primaryBlockId);
        return;
      case "align-right":
      case "align-center":
      case "align-justify": {
        const align = command.replace("align-", "") as
          | "right"
          | "center"
          | "justify";
        updateBlocksByIds(targetIds, (block) => ({ ...block, align }));
        return;
      }
      case "set-direction-rtl":
      case "set-direction-ltr": {
        const direction = command.endsWith("rtl") ? "rtl" : "ltr";
        updateBlocksByIds(targetIds, (block) =>
          isImageBlock(block) ? block : { ...block, direction },
        );
        return;
      }
      case "set-text-color": {
        const textColor = payload?.textColor ?? "#222222";
        if (applyInlineTextStyle(primaryBlockId, { textColor })) return;
        updateBlocksByIds(targetIds, (block) => ({ ...block, textColor }));
        return;
      }
      case "set-highlight-color": {
        const highlightColor = payload?.highlightColor ?? "#fff2a8";
        if (applyInlineTextStyle(primaryBlockId, { highlightColor })) return;
        updateBlocksByIds(targetIds, (block) => ({
          ...block,
          richText: createRichTextSelectionHtml(
            block.text,
            0,
            block.text.length,
            { highlightColor },
          ),
        }));
        return;
      }
      case "set-font-size": {
        const fontSize = Math.min(32, Math.max(13, payload?.fontSize ?? 15));
        if (applyInlineTextStyle(primaryBlockId, { fontSize })) return;
        updateBlocksByIds(targetIds, (block) => ({ ...block, fontSize }));
        return;
      }
      case "delete-block":
        deleteBlocks(targetIds);
    }
  }

  const handleEditorCommandEvent = useEffectEvent(
    (command: EditorCommand, payload?: EditorCommandPayload) => {
      runEditorCommand(command, payload);
    },
  );

  useEffect(() => {
    const listener = (event: Event) => {
      const detail = (
        event as CustomEvent<EditorCommandPayload & { command: EditorCommand }>
      ).detail;
      handleEditorCommandEvent(detail.command, detail);
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
            bold:
              activeRichTextStyle &&
              activeRichTextStyle.blockId === activeBlock?.id
                ? activeRichTextStyle.bold
                : activeBlock?.bold ?? false,
            italic:
              activeRichTextStyle &&
              activeRichTextStyle.blockId === activeBlock?.id
                ? activeRichTextStyle.italic
                : activeBlock?.italic ?? false,
            textColor:
              activeRichTextStyle &&
              activeRichTextStyle.blockId === activeBlock?.id
                ? activeRichTextStyle.textColor
                : activeBlock?.textColor ?? "#222222",
            highlightColor:
              activeRichTextStyle &&
              activeRichTextStyle.blockId === activeBlock?.id
                ? activeRichTextStyle.highlightColor
                : "transparent",
            fontSize:
              activeRichTextStyle &&
              activeRichTextStyle.blockId === activeBlock?.id
                ? activeRichTextStyle.fontSize
                : activeBlock?.fontSize ?? 15,
            selectionCount: selectedBlockIds.length,
          },
        }),
      );
    };

    dispatchToolbarState();
    const animationFrameId = requestAnimationFrame(dispatchToolbarState);
    return () => cancelAnimationFrame(animationFrameId);
  }, [
    activeBlock,
    activeRichTextStyle,
    blocks,
    historyRef,
    selectedBlockIds.length,
    title,
  ]);

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

  return { runEditorCommand };
}
