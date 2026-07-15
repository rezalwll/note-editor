"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { RichTextBlockHandle } from "@/components/editor/rich-text-block-editor";
import {
  DEFAULT_CANVAS_WIDTH,
  DEFAULT_VIEWPORT_HEIGHT,
  estimateBlockHeight,
  getImageBlockHeight,
  getRenderedBlockWidth,
  isImageBlock,
} from "@/lib/editor-document";
import type { FreeformBlock } from "@/lib/notes";
import { SpatialItemIndex } from "@/lib/virtualization";

const BLOCK_VIRTUALIZATION_THRESHOLD = 120;
const BLOCK_VIRTUALIZATION_OVERSCAN = 800;

type UseNoteEditorLayoutOptions = {
  blocks: FreeformBlock[];
  activeBlockId: string | null;
  isHydrated: boolean;
};

export function useNoteEditorLayout({
  blocks,
  activeBlockId,
  isHydrated,
}: UseNoteEditorLayoutOptions) {
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const blockRefs = useRef<Record<string, HTMLTextAreaElement | null>>({});
  const lastBlockElementsRef = useRef<
    Record<string, HTMLTextAreaElement | null>
  >({});
  const richTextBlockRefs = useRef<Record<string, RichTextBlockHandle | null>>(
    {},
  );
  const lastRichTextHandlesRef = useRef<
    Record<string, RichTextBlockHandle | null>
  >({});
  const selectionRestoreRef = useRef<{
    id: string;
    start: number;
    end: number;
  } | null>(null);
  const [isDesktopViewport, setIsDesktopViewport] = useState(true);
  const [canvasWidth, setCanvasWidth] = useState(DEFAULT_CANVAS_WIDTH);
  const [viewportHeight, setViewportHeight] = useState(DEFAULT_VIEWPORT_HEIGHT);
  const [lowestBlockBottom, setLowestBlockBottom] = useState(0);
  const [blockViewport, setBlockViewport] = useState({
    top: 0,
    bottom: DEFAULT_VIEWPORT_HEIGHT,
  });
  const dirtyBlocksRef = useRef(new Map<string, FreeformBlock>());
  const removedBlockIdsRef = useRef(new Set<string>());
  const measuredBoundsRef = useRef(
    new Map<string, { block: FreeformBlock; bottom: number }>(),
  );
  const lowestBlockBottomRef = useRef(0);
  const lastMeasuredCanvasWidthRef = useRef(canvasWidth);
  const [spatialIndex] = useState(
    () =>
      new SpatialItemIndex(
        blocks,
        (block) => block.id,
        (block) => ({
          top: block.y,
          height: estimateBlockHeight(block, canvasWidth),
        }),
      ),
  );
  const [spatialIndexRevision, setSpatialIndexRevision] = useState(0);

  const shouldVirtualizeBlocks =
    blocks.length >= BLOCK_VIRTUALIZATION_THRESHOLD;
  const renderedBlocks = useMemo(() => {
    void spatialIndexRevision;
    return shouldVirtualizeBlocks
        ? spatialIndex.query(
            { ...blockViewport, overscan: BLOCK_VIRTUALIZATION_OVERSCAN },
            activeBlockId,
          )
        : blocks;
  },
    [
      activeBlockId,
      blockViewport,
      blocks,
      shouldVirtualizeBlocks,
      spatialIndex,
      spatialIndexRevision,
    ],
  );

  const upsertLayoutBlock = useCallback(
    (block: FreeformBlock) => {
      spatialIndex.upsert(block, {
        top: block.y,
        height: estimateBlockHeight(block, canvasWidth),
      });
      dirtyBlocksRef.current.set(block.id, block);
      removedBlockIdsRef.current.delete(block.id);
    },
    [canvasWidth, spatialIndex],
  );
  const removeLayoutBlocks = useCallback(
    (blockIds: readonly string[]) => {
      spatialIndex.remove(blockIds);
      for (const blockId of blockIds) {
        dirtyBlocksRef.current.delete(blockId);
        removedBlockIdsRef.current.add(blockId);
      }
    },
    [spatialIndex],
  );
  const replaceLayoutBlocks = useCallback(
    (nextBlocks: readonly FreeformBlock[]) => {
      spatialIndex.replaceAll(nextBlocks, (block) => ({
        top: block.y,
        height: estimateBlockHeight(block, canvasWidth),
      }));
      dirtyBlocksRef.current = new Map(
        nextBlocks.map((block) => [block.id, block]),
      );
      removedBlockIdsRef.current = new Set(measuredBoundsRef.current.keys());
      for (const block of nextBlocks) {
        removedBlockIdsRef.current.delete(block.id);
      }
    },
    [canvasWidth, spatialIndex],
  );

  const getTextBlockElement = useCallback(
    (blockId: string) =>
      blockRefs.current[blockId] ??
      richTextBlockRefs.current[blockId]?.getElement() ??
      null,
    [],
  );

  const getCanvasRect = useCallback(
    () => canvasRef.current?.getBoundingClientRect() ?? null,
    [],
  );
  const setBlockElement = useCallback(
    (blockId: string, element: HTMLTextAreaElement | null) => {
      blockRefs.current[blockId] = element;
      if (!element || lastBlockElementsRef.current[blockId] === element) {
        return;
      }
      lastBlockElementsRef.current[blockId] = element;
      const cachedBlock = measuredBoundsRef.current.get(blockId)?.block;
      if (cachedBlock) {
        dirtyBlocksRef.current.set(blockId, cachedBlock);
      }
    },
    [],
  );
  const setRichTextBlockHandle = useCallback(
    (blockId: string, handle: RichTextBlockHandle | null) => {
      richTextBlockRefs.current[blockId] = handle;
      if (!handle || lastRichTextHandlesRef.current[blockId] === handle) {
        return;
      }
      lastRichTextHandlesRef.current[blockId] = handle;
      const cachedBlock = measuredBoundsRef.current.get(blockId)?.block;
      if (cachedBlock) {
        dirtyBlocksRef.current.set(blockId, cachedBlock);
      }
    },
    [],
  );
  const queueSelectionRestore = useCallback(
    (blockId: string, start: number, end: number) => {
      selectionRestoreRef.current = { id: blockId, start, end };
    },
    [],
  );

  const updateBlockViewport = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const rect = canvas.getBoundingClientRect();
    const nextTop = Math.max(0, -rect.top);
    const nextBottom = Math.max(
      nextTop,
      Math.min(
        rect.height || Number.POSITIVE_INFINITY,
        window.innerHeight - rect.top,
      ),
    );

    setBlockViewport((current) =>
      Math.abs(current.top - nextTop) < 1 &&
      Math.abs(current.bottom - nextBottom) < 1
        ? current
        : { top: nextTop, bottom: nextBottom },
    );
  }, []);

  useEffect(() => {
    if (!shouldVirtualizeBlocks) {
      return;
    }

    let frameId: number | null = null;
    const scheduleUpdate = () => {
      if (frameId !== null) {
        return;
      }

      frameId = window.requestAnimationFrame(() => {
        frameId = null;
        updateBlockViewport();
      });
    };

    scheduleUpdate();
    window.addEventListener("scroll", scheduleUpdate, true);
    window.addEventListener("resize", scheduleUpdate);

    return () => {
      if (frameId !== null) {
        window.cancelAnimationFrame(frameId);
      }
      window.removeEventListener("scroll", scheduleUpdate, true);
      window.removeEventListener("resize", scheduleUpdate);
    };
  }, [shouldVirtualizeBlocks, updateBlockViewport]);

  useEffect(() => {
    if (!isHydrated || !activeBlockId) {
      return;
    }

    const richTextHandle = richTextBlockRefs.current[activeBlockId];
    if (richTextHandle) {
      const richTextElement = richTextHandle.getElement();
      if (!richTextElement?.contains(document.activeElement)) {
        richTextHandle.focus();
      }
      return;
    }

    const element = blockRefs.current[activeBlockId];
    if (element && document.activeElement !== element) {
      element.focus();
    }
  }, [activeBlockId, isHydrated]);

  useEffect(() => {
    const restore = selectionRestoreRef.current;
    if (restore) {
      selectionRestoreRef.current = null;
      const element = blockRefs.current[restore.id];
      element?.focus();
      element?.setSelectionRange(restore.start, restore.end);
    }

    const widthChanged = lastMeasuredCanvasWidthRef.current !== canvasWidth;
    lastMeasuredCanvasWidthRef.current = canvasWidth;
    if (widthChanged) {
      spatialIndex.replaceAll(blocks, (block) => ({
        top: block.y,
        height: estimateBlockHeight(block, canvasWidth),
      }));
    }
    const blocksToMeasure =
      widthChanged || measuredBoundsRef.current.size === 0
        ? blocks
        : [...dirtyBlocksRef.current.values()];
    let shouldRecalculateMaximum = widthChanged;
    let nextLowestBlockBottom = lowestBlockBottomRef.current;

    for (const removedBlockId of removedBlockIdsRef.current) {
      if (
        measuredBoundsRef.current.get(removedBlockId)?.bottom ===
        lowestBlockBottomRef.current
      ) {
        shouldRecalculateMaximum = true;
      }
      measuredBoundsRef.current.delete(removedBlockId);
    }

    for (const block of blocksToMeasure) {
      const element = getTextBlockElement(block.id);
      if (element instanceof HTMLTextAreaElement) {
        element.style.height = "0px";
        element.style.height = `${Math.max(element.scrollHeight, 28)}px`;
      }
      const blockWidth = getRenderedBlockWidth(block, canvasWidth);
      const blockHeight = isImageBlock(block)
        ? getImageBlockHeight(block, blockWidth)
        : Math.max(
            element?.scrollHeight ?? 28,
            element?.offsetHeight ?? 28,
            estimateBlockHeight(block, canvasWidth),
            28,
          );
      const previousBottom = measuredBoundsRef.current.get(block.id)?.bottom;
      const bottom = block.y + blockHeight;
      measuredBoundsRef.current.set(block.id, { block, bottom });
      if (
        previousBottom === lowestBlockBottomRef.current &&
        bottom < previousBottom
      ) {
        shouldRecalculateMaximum = true;
      }
      nextLowestBlockBottom = Math.max(nextLowestBlockBottom, bottom);
    }

    if (shouldRecalculateMaximum) {
      nextLowestBlockBottom = 0;
      for (const bounds of measuredBoundsRef.current.values()) {
        nextLowestBlockBottom = Math.max(nextLowestBlockBottom, bounds.bottom);
      }
    }

    dirtyBlocksRef.current.clear();
    removedBlockIdsRef.current.clear();
    lowestBlockBottomRef.current = nextLowestBlockBottom;

    const frameId = window.requestAnimationFrame(() => {
      setLowestBlockBottom(nextLowestBlockBottom);
      if (widthChanged) {
        setSpatialIndexRevision((current) => current + 1);
      }
    });
    return () => window.cancelAnimationFrame(frameId);
  }, [blocks, canvasWidth, getTextBlockElement, spatialIndex]);

  useEffect(() => {
    const normalizeBlockLayout = () => {
      const nextCanvasWidth = canvasRef.current?.getBoundingClientRect().width;
      if (!nextCanvasWidth) {
        return;
      }

      setCanvasWidth(nextCanvasWidth);
      setViewportHeight(window.visualViewport?.height ?? window.innerHeight);
      setIsDesktopViewport(nextCanvasWidth >= 768);
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

  return {
    blockRefs,
    canvasRef,
    canvasWidth,
    desktopCanvasMinHeight: Math.max(
      viewportHeight - 240,
      lowestBlockBottom + 360,
    ),
    getCanvasRect,
    getTextBlockElement,
    isDesktopViewport,
    mobileCanvasMinHeight: Math.max(
      viewportHeight - 256,
      lowestBlockBottom + 280,
    ),
    renderedBlocks,
    removeLayoutBlocks,
    replaceLayoutBlocks,
    richTextBlockRefs,
    queueSelectionRestore,
    selectionRestoreRef,
    setBlockElement,
    setRichTextBlockHandle,
    shouldVirtualizeBlocks,
    upsertLayoutBlock,
  };
}
