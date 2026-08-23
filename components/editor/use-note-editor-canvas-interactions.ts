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
  getBlockHorizontalAnchor,
  getBlockMaxWidth,
  getBlockRightGutter,
  getCanvasBoundedX,
  getCanvasInset,
  getRenderedBlockWidth,
  getResponsiveBlockX,
  getTextBlockMinWidth,
  isImageBlock,
} from "@/lib/editor-document";
import type { FreeformBlock } from "@/lib/notes";

const POINTER_GEOMETRY_INTENT_THRESHOLD = 2;

export type CanvasCoordinates = {
  x: number;
  y: number;
  width: number;
};

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
    startClientX: number;
    startClientY: number;
    startRenderedX: number;
    startRenderedY: number;
    startPersistedY: number;
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
    const dragState = dragStateRef.current;
    const horizontalDelta = event.clientX - dragState.startClientX;
    const verticalDelta = event.clientY - dragState.startClientY;
    const nextRenderedX = getCanvasBoundedX(
      rect.width,
      dragState.startRenderedX + horizontalDelta,
      blockWidth,
    );
    const nextRenderedY = Math.max(
      24,
      dragState.startRenderedY + verticalDelta,
    );
    const nextY = Math.max(
      24,
      dragState.startPersistedY + nextRenderedY - dragState.startRenderedY,
    );
    const movedHorizontally =
      Math.abs(nextRenderedX - dragState.startRenderedX) >=
      POINTER_GEOMETRY_INTENT_THRESHOLD;

    markEditorInteraction();
    setEditedBlocks((current) =>
      current.map((block) => {
        if (block.id !== dragStateRef.current?.id) {
          return block;
        }
        const nextBlock = {
          ...block,
          ...(movedHorizontally
            ? {
                x: nextRenderedX,
                horizontalAnchor: getBlockHorizontalAnchor(
                  rect.width,
                  nextRenderedX,
                  blockWidth,
                ),
              }
            : {}),
          y: nextY,
        };
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
    const geometryChanged =
      Math.abs(nextWidth - resizeState.startWidth) >=
        POINTER_GEOMETRY_INTENT_THRESHOLD ||
      Math.abs(nextX - resizeState.startX) >=
        POINTER_GEOMETRY_INTENT_THRESHOLD;
    if (!geometryChanged) {
      return;
    }

    markEditorInteraction();
    setEditedBlocks((current) =>
      current.map((block) => {
        if (block.id !== resizeStateRef.current?.id) {
          return block;
        }
        const nextBlock = {
          ...block,
          x: nextX,
          width: nextWidth,
          horizontalAnchor: getBlockHorizontalAnchor(
            rect.width,
            nextX,
            nextWidth,
          ),
        };
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
    const persistedBlock = blocks.find((candidate) => candidate.id === block.id);
    const renderedX = getResponsiveBlockX(block, rect.width);
    dragStateRef.current = {
      id: block.id,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startRenderedX: renderedX,
      startRenderedY: block.y,
      startPersistedY: persistedBlock?.y ?? block.y,
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
