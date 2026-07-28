"use client";

import {
  useEffect,
  useEffectEvent,
  useRef,
  type Dispatch,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
  type SetStateAction,
} from "react";

import {
  BLOCK_DEFAULT_WIDTH,
  BLOCK_RTL_CLICK_ANCHOR,
  IMAGE_MIN_WIDTH,
  getBlockMaxWidth,
  getBlockRightGutter,
  getCanvasInset,
  getRenderedBlockWidth,
  getTextBlockMinWidth,
  isImageBlock,
} from "@/lib/editor-document";
import type { FreeformBlock } from "@/lib/notes";

export type CanvasCoordinates = {
  x: number;
  y: number;
  width: number;
};

export function getCanvasBoundedX(
  targetCanvasWidth: number,
  desiredX: number,
  blockWidth: number,
) {
  const inset = getCanvasInset(targetCanvasWidth);
  const rightGutter = getBlockRightGutter(targetCanvasWidth);

  return Math.min(
    Math.max(inset, desiredX),
    Math.max(inset, targetCanvasWidth - blockWidth - rightGutter),
  );
}

export function isEditorControlTarget(target: HTMLElement) {
  return Boolean(
    target.closest("[data-editor-block]") ||
      target.closest("[data-rich-text-editor]") ||
      target.closest('[contenteditable="true"]') ||
      target.closest("textarea") ||
      target.closest("button") ||
      target.closest("input"),
  );
}

type UseNoteEditorCanvasInteractionsOptions = {
  blocks: FreeformBlock[];
  canvasRef: RefObject<HTMLDivElement | null>;
  pageRef: RefObject<HTMLDivElement | null>;
  addBlockAt: (
    x: number,
    y: number,
    shouldFocus?: boolean,
    width?: number,
  ) => void;
  markEditorInteraction: () => void;
  recordDocumentHistory: (coalesceKey?: string) => void;
  selectSingleBlock: (blockId: string) => void;
  setEditedBlocks: Dispatch<SetStateAction<FreeformBlock[]>>;
  upsertLayoutBlock: (block: FreeformBlock) => void;
};

/** Owns click-to-create, dragging, and edge-resizing on the freeform canvas. */
export function useNoteEditorCanvasInteractions({
  blocks,
  canvasRef,
  pageRef,
  addBlockAt,
  markEditorInteraction,
  recordDocumentHistory,
  selectSingleBlock,
  setEditedBlocks,
  upsertLayoutBlock,
}: UseNoteEditorCanvasInteractionsOptions) {
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
  const pagePointerStartRef = useRef<{
    pointerId: number;
    clientX: number;
    clientY: number;
  } | null>(null);

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
    const boundedBlockWidth = Math.min(
      blockWidth,
      getBlockMaxWidth(canvasRect.width),
    );
    const x = getCanvasBoundedX(
      canvasRect.width,
      clientX - canvasRect.left - boundedBlockWidth + BLOCK_RTL_CLICK_ANCHOR,
      boundedBlockWidth,
    );
    const canvasOffsetTop = canvasRect.top - pageRect.top;
    const y = Math.max(24, clientY - pageRect.top - canvasOffsetTop);

    return { x, y, width: boundedBlockWidth };
  }

  function handlePagePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
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

  function handlePagePointerUp(event: ReactPointerEvent<HTMLDivElement>) {
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
    setEditedBlocks((current) =>
      current.map((block) => {
        if (block.id !== dragStateRef.current?.id) {
          return block;
        }
        const nextBlock = { ...block, x: nextX, y: nextY, width: blockWidth };
        upsertLayoutBlock(nextBlock);
        return nextBlock;
      }),
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
    const minWidth = isImageBlock(currentBlock)
      ? IMAGE_MIN_WIDTH
      : getTextBlockMinWidth(currentBlock);
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
    setEditedBlocks((current) =>
      current.map((block) => {
        if (block.id !== resizeStateRef.current?.id) {
          return block;
        }
        const nextBlock = { ...block, x: nextX, width: nextWidth };
        upsertLayoutBlock(nextBlock);
        return nextBlock;
      }),
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

  function startDraggingBlock(
    event: ReactPointerEvent<HTMLButtonElement>,
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
    event: ReactPointerEvent<HTMLElement>,
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

  return {
    getCanvasCoordinates,
    handlePagePointerCancel,
    handlePagePointerDown,
    handlePagePointerUp,
    startDraggingBlock,
    startResizingBlock,
  };
}
