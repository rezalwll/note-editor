"use client";

import { useState } from "react";
import { flushSync } from "react-dom";

import type { RichTextBlockHandle } from "@/components/editor/rich-text-block-editor";
import {
  IMAGE_DEFAULT_ASPECT_RATIO,
  IMAGE_DEFAULT_WIDTH,
  createBlockId,
  getBlockHorizontalAnchor,
  getBlockMaxWidth,
  getBlockRightGutter,
  getImageBlockHeight,
  getRenderedBlockWidth,
  getResponsiveBlockX,
  isImageBlock,
} from "@/lib/editor-document";
import { looksLikeMarkdown, markdownToHtml } from "@/lib/markdown";
import type { FreeformBlock } from "@/lib/notes";

const CLIPBOARD_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

type CanvasCoordinates = {
  x: number;
  y: number;
  width: number;
};

type AttachmentUploadResponse = {
  attachment: {
    id: string;
    fileName: string;
    mimeType: string;
    sizeBytes: number;
  };
  url: string;
};

type PasteTarget = {
  placement?: CanvasCoordinates;
  targetTitle?: boolean;
  targetBlockId?: string;
  selectionStart?: number;
  selectionEnd?: number;
};

type UseNoteEditorClipboardOptions = {
  pageId: string;
  canvasWidth: number;
  blocks: FreeformBlock[];
  activeBlockId: string | null;
  title: string;
  getCanvasRect: () => DOMRect | null;
  getTextBlockElement: (blockId: string) => HTMLElement | null;
  getCanvasBoundedX: (
    canvasWidth: number,
    requestedX: number,
    blockWidth: number,
  ) => number;
  getCurrentBlocks: () => FreeformBlock[];
  getRichTextHandle: (blockId: string) => RichTextBlockHandle | null;
  focusTitleAt: (caretPosition: number) => void;
  restoreTextSelection: (
    blockId: string,
    start: number,
    end: number,
  ) => void;
  isEditorMounted: () => boolean;
  markEditorInteraction: () => void;
  recordDocumentHistory: () => void;
  setTitle: React.Dispatch<React.SetStateAction<string>>;
  setBlocks: React.Dispatch<React.SetStateAction<FreeformBlock[]>>;
  setActiveBlockId: React.Dispatch<React.SetStateAction<string | null>>;
  setSelectedBlockIds: React.Dispatch<React.SetStateAction<string[]>>;
  updateBlockText: (blockId: string, text: string, richText?: string) => void;
  addBlockAt: (
    x: number,
    y: number,
    shouldFocus?: boolean,
    requestedWidth?: number,
    initialText?: string,
    initialRichText?: string,
  ) => void;
  onBlockInserted: (block: FreeformBlock) => void;
};

export function useNoteEditorClipboard({
  pageId,
  canvasWidth,
  blocks,
  activeBlockId,
  title,
  getCanvasRect,
  getTextBlockElement,
  getCanvasBoundedX,
  getCurrentBlocks,
  getRichTextHandle,
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
  onBlockInserted,
}: UseNoteEditorClipboardOptions) {
  const [pendingImageUploads, setPendingImageUploads] = useState(0);
  const [imageUploadError, setImageUploadError] = useState<string | null>(null);

  function getPastedImageCoordinates() {
    const canvasRect = getCanvasRect();
    const targetCanvasWidth = canvasRect?.width ?? canvasWidth;
    const width = Math.min(IMAGE_DEFAULT_WIDTH, getBlockMaxWidth(targetCanvasWidth));
    const selectedBlock = blocks.find((block) => block.id === activeBlockId);

    if (selectedBlock) {
      const selectedWidth = getRenderedBlockWidth(selectedBlock, targetCanvasWidth);
      const selectedElement = getTextBlockElement(selectedBlock.id);
      const selectedHeight = isImageBlock(selectedBlock)
        ? getImageBlockHeight(selectedBlock, selectedWidth)
        : Math.max(
            selectedElement?.scrollHeight ?? 28,
            selectedElement?.offsetHeight ?? 28,
            28,
          );

      return {
        x: getCanvasBoundedX(
          targetCanvasWidth,
          getResponsiveBlockX(selectedBlock, targetCanvasWidth),
          width,
        ),
        y: selectedBlock.y + selectedHeight + 24,
        width,
      };
    }

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
        if (!isEditorMounted()) {
          continue;
        }

        const block: FreeformBlock = {
          id: createBlockId(),
          type: "image",
          attachmentId: uploaded.attachment.id,
          fileName: uploaded.attachment.fileName,
          x: placement.x,
          y: nextY,
          width: placement.width,
          horizontalAnchor: getBlockHorizontalAnchor(
            getCanvasRect()?.width ?? canvasWidth,
            placement.x,
            placement.width,
          ),
          text: "",
          aspectRatio: IMAGE_DEFAULT_ASPECT_RATIO,
        };

        markEditorInteraction();
        recordDocumentHistory();
        onBlockInserted(block);
        setBlocks((current) => [...current, block]);
        setActiveBlockId(block.id);
        setSelectedBlockIds([block.id]);
        nextY += getImageBlockHeight(block, placement.width) + 24;
      } catch (error) {
        console.error("Failed to upload a pasted image.", error);
        if (isEditorMounted()) {
          setImageUploadError(
            error instanceof Error ? error.message : "بارگذاری تصویر انجام نشد.",
          );
        }
      } finally {
        if (isEditorMounted()) {
          setPendingImageUploads((current) => Math.max(0, current - 1));
        }
      }
    }
  }

  function handleEditorPaste(event: React.ClipboardEvent<HTMLDivElement>) {
    const itemFiles = Array.from(event.clipboardData.items)
      .filter((item) => item.kind === "file" && item.type.startsWith("image/"))
      .map((item) => item.getAsFile())
      .filter((file): file is File => Boolean(file));
    const imageFiles =
      itemFiles.length > 0
        ? itemFiles
        : Array.from(event.clipboardData.files).filter((file) =>
            file.type.startsWith("image/"),
          );

    if (imageFiles.length === 0) {
      const pastedText = event.clipboardData.getData("text/plain");
      const target = event.target as HTMLElement;
      const blockElement = target.closest<HTMLElement>("[data-block-id]");
      const blockId = blockElement?.dataset.blockId;
      const textarea = target.closest("textarea");

      if (!pastedText || !blockId || !textarea || !looksLikeMarkdown(pastedText)) {
        return;
      }

      const targetBlock = blocks.find(
        (block) => block.id === blockId && !isImageBlock(block),
      );
      if (!targetBlock) {
        return;
      }

      event.preventDefault();
      const selectionStart = textarea.selectionStart ?? targetBlock.text.length;
      const selectionEnd = textarea.selectionEnd ?? selectionStart;
      const nextText =
        targetBlock.text.slice(0, selectionStart) +
        pastedText +
        targetBlock.text.slice(selectionEnd);
      updateBlockText(blockId, nextText, markdownToHtml(nextText));
      return;
    }

    event.preventDefault();
    void insertImageFiles(imageFiles);
  }

  function handleImageFileSelection(event: React.ChangeEvent<HTMLInputElement>) {
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
        error instanceof Error ? error.message : "کپی‌کردن متن انجام نشد.",
      );
    }
  }

  async function copyImageToClipboard(block: FreeformBlock) {
    if (!block.attachmentId) {
      return;
    }

    try {
      if (!navigator.clipboard?.write || typeof ClipboardItem === "undefined") {
        throw new Error("کپی تصویر در این مرورگر پشتیبانی نمی‌شود.");
      }

      const response = await fetch(`/api/attachments/${block.attachmentId}`);
      if (!response.ok) {
        throw new Error("دریافت تصویر برای کپی انجام نشد.");
      }

      const blob = await response.blob();
      await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })]);
      setImageUploadError(null);
    } catch (error) {
      console.error("Failed to copy an editor image.", error);
      setImageUploadError(
        error instanceof Error ? error.message : "کپی‌کردن تصویر انجام نشد.",
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
  }: PasteTarget) {
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
        const nextCaretPosition = selectionStart + clipboardContent.text.length;

        markEditorInteraction();
        recordDocumentHistory();
        setTitle(nextTitle);
        requestAnimationFrame(() => focusTitleAt(nextCaretPosition));
        return;
      }

      if (targetBlockId) {
        const currentBlocks = getCurrentBlocks();
        const targetBlock =
          currentBlocks.find(
            (block) => block.id === targetBlockId && !isImageBlock(block),
          ) ??
          blocks.find(
            (block) => block.id === targetBlockId && !isImageBlock(block),
          );

        if (!targetBlock) {
          return;
        }

        if (!currentBlocks.some((block) => block.id === targetBlockId)) {
          onBlockInserted(targetBlock);
          flushSync(() => {
            setBlocks((current) =>
              current.some((block) => block.id === targetBlockId)
                ? current
                : [...current, targetBlock],
            );
            setActiveBlockId(targetBlockId);
            setSelectedBlockIds([targetBlockId]);
          });
        }

        const richTextHandle = getRichTextHandle(targetBlockId);
        if (richTextHandle) {
          richTextHandle.replaceSelection(
            clipboardContent.text,
            looksLikeMarkdown(clipboardContent.text)
              ? markdownToHtml(clipboardContent.text)
              : undefined,
          );
          return;
        }

        const nextText =
          targetBlock.text.slice(0, selectionStart) +
          clipboardContent.text +
          targetBlock.text.slice(selectionEnd);
        const nextCaretPosition = selectionStart + clipboardContent.text.length;
        restoreTextSelection(
          targetBlockId,
          nextCaretPosition,
          nextCaretPosition,
        );
        updateBlockText(
          targetBlockId,
          nextText,
          targetBlock.richText ? markdownToHtml(nextText) : undefined,
        );
        return;
      }

      if (placement) {
        const richText = looksLikeMarkdown(clipboardContent.text)
          ? markdownToHtml(clipboardContent.text)
          : undefined;
        addBlockAt(
          placement.x,
          placement.y,
          true,
          placement.width,
          clipboardContent.text,
          richText,
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

  return {
    copyImageToClipboard,
    copyTextToClipboard,
    getSelectedBlocksText,
    handleEditorPaste,
    handleImageFileSelection,
    imageUploadError,
    pasteFromClipboard,
    pendingImageUploads,
  };
}
