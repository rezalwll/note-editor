import {
  type FreeformBlock,
  parseFreeformDocument,
} from "@/lib/notes";

export type EditorDocumentSnapshot = {
  title: string;
  blocks: FreeformBlock[];
  activeBlockId: string | null;
  selectedBlockIds: string[];
};

export const PAGE_SIDE_PADDING_DESKTOP = 48;
export const PAGE_SIDE_PADDING_MOBILE = 16;
export const DEFAULT_CANVAS_WIDTH = 1200;
export const DEFAULT_VIEWPORT_HEIGHT = 900;
export const BLOCK_MIN_WIDTH = 180;
export const BLOCK_DEFAULT_WIDTH = 240;
export const BLOCK_MAX_WIDTH = 900;
export const BLOCK_RTL_CLICK_ANCHOR = 12;
export const IMAGE_DEFAULT_WIDTH = 420;
export const IMAGE_MIN_WIDTH = 160;
export const IMAGE_DEFAULT_ASPECT_RATIO = 4 / 3;

let textMeasureContext: CanvasRenderingContext2D | null = null;

export function createBlockId() {
  return `block-${Math.random().toString(36).slice(2, 10)}`;
}

export function getCanvasInset(canvasWidth: number) {
  return canvasWidth >= 768 ? PAGE_SIDE_PADDING_DESKTOP : PAGE_SIDE_PADDING_MOBILE;
}

export function getBlockRightGutter(canvasWidth: number) {
  return getCanvasInset(canvasWidth);
}

export function getBlockMaxWidth(canvasWidth: number) {
  const inset = getCanvasInset(canvasWidth);
  const rightGutter = getBlockRightGutter(canvasWidth);
  return Math.max(BLOCK_MIN_WIDTH, canvasWidth - inset - rightGutter);
}

function getBlockWidth(text: string, canvasWidth = BLOCK_MAX_WIDTH) {
  const longestLineLength = text
    .split("\n")
    .reduce((max, line) => Math.max(max, line.trim().length), 0);
  const maxWidth = Math.min(BLOCK_MAX_WIDTH, getBlockMaxWidth(canvasWidth));

  if (longestLineLength === 0) return Math.min(BLOCK_DEFAULT_WIDTH, maxWidth);
  return Math.min(maxWidth, Math.max(BLOCK_MIN_WIDTH, longestLineLength * 11 + 56));
}

export function measureBlockWidth(
  text: string,
  canvasWidth = BLOCK_MAX_WIDTH,
  textStyle?: CSSStyleDeclaration | null,
) {
  if (typeof document === "undefined") return getBlockWidth(text, canvasWidth);

  if (!textMeasureContext) {
    textMeasureContext = document.createElement("canvas").getContext("2d");
  }
  if (!textMeasureContext) return getBlockWidth(text, canvasWidth);

  const fontStyle = textStyle?.fontStyle || "normal";
  const fontWeight = textStyle?.fontWeight || "400";
  const fontSize = textStyle?.fontSize || "15px";
  const fontFamily = textStyle?.fontFamily || "Segoe UI, Tahoma, Geneva, Verdana, sans-serif";
  const letterSpacing = Number.parseFloat(textStyle?.letterSpacing || "0") || 0;
  const wordSpacing = Number.parseFloat(textStyle?.wordSpacing || "0") || 0;
  const horizontalPadding =
    (Number.parseFloat(textStyle?.paddingLeft || "0") || 0) +
    (Number.parseFloat(textStyle?.paddingRight || "0") || 0);

  textMeasureContext.font = `${fontStyle} ${fontWeight} ${fontSize} ${fontFamily}`;
  const longestLineWidth = text.split("\n").reduce((max, line) => {
    const measuredLine = line || " ";
    const spacingWidth =
      Math.max(0, measuredLine.length - 1) * letterSpacing +
      (measuredLine.match(/\s/g)?.length ?? 0) * wordSpacing;
    return Math.max(max, textMeasureContext!.measureText(measuredLine).width + spacingWidth);
  }, 0);
  const maxWidth = Math.min(BLOCK_MAX_WIDTH, getBlockMaxWidth(canvasWidth));

  if (longestLineWidth === 0) return Math.min(BLOCK_DEFAULT_WIDTH, maxWidth);
  return Math.min(
    maxWidth,
    Math.max(BLOCK_MIN_WIDTH, Math.ceil(longestLineWidth) + horizontalPadding + 32),
  );
}

export function getLegacyBlockWidth(x: number, canvasWidth: number) {
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

export function getRenderedBlockWidth(block: FreeformBlock, canvasWidth: number) {
  return typeof block.width === "number"
    ? Math.min(block.width, getBlockMaxWidth(canvasWidth))
    : getLegacyBlockWidth(block.x, canvasWidth);
}

export function isImageBlock(block: FreeformBlock) {
  return block.type === "image" && Boolean(block.attachmentId);
}

export function getImageBlockHeight(block: FreeformBlock, width: number) {
  return width / (block.aspectRatio ?? IMAGE_DEFAULT_ASPECT_RATIO);
}

export function isEmptyTextBlock(block: FreeformBlock) {
  return block.type !== "image" && !block.text.trim();
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function textToHtml(value: string) {
  return escapeHtml(value).replaceAll("\n", "<br>");
}

export function createRichTextSelectionHtml(
  text: string,
  start: number,
  end: number,
  style: { textColor?: string; highlightColor?: string; fontSize?: number },
) {
  const styleValue = [
    style.textColor ? `color: ${style.textColor}` : "",
    style.fontSize ? `font-size: ${style.fontSize}px` : "",
  ].filter(Boolean).join("; ");
  const selectedText = textToHtml(text.slice(start, end));
  const styledSelection =
    style.highlightColor && style.highlightColor !== "transparent"
      ? `<mark data-color="${style.highlightColor}" style="background-color: ${style.highlightColor}">${selectedText}</mark>`
      : selectedText;
  return `<p>${textToHtml(text.slice(0, start))}<span style="${styleValue}">${styledSelection}</span>${textToHtml(text.slice(end))}</p>`;
}

export function getPersistableBlocks(blocks: FreeformBlock[]) {
  return blocks.filter((block) => !isEmptyTextBlock(block));
}

export function getInitialBlocks(initialHtml: string): FreeformBlock[] {
  const parsed = parseFreeformDocument(initialHtml);
  if (parsed) return getPersistableBlocks(parsed.blocks);

  const plainText = initialHtml.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  if (!plainText) return [];
  return [{
    id: createBlockId(),
    x: PAGE_SIDE_PADDING_DESKTOP,
    y: 72,
    text: plainText,
    align: "right",
    direction: "rtl",
    textColor: "#222222",
    fontSize: 15,
  }];
}

export function cloneDocumentSnapshot(
  title: string,
  blocks: FreeformBlock[],
  activeBlockId: string | null,
  selectedBlockIds: string[],
): EditorDocumentSnapshot {
  return {
    title,
    // Blocks are updated immutably, so snapshots can structurally share unchanged objects.
    blocks: [...blocks],
    activeBlockId,
    selectedBlockIds: [...selectedBlockIds],
  };
}

export function getCurrentLineRange(text: string, position: number) {
  const lineStart = text.lastIndexOf("\n", Math.max(0, position - 1)) + 1;
  const nextBreak = text.indexOf("\n", position);
  const lineEnd = nextBreak === -1 ? text.length : nextBreak;
  return { lineStart, lineEnd, lineText: text.slice(lineStart, lineEnd) };
}
