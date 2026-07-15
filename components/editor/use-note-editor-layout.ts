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
import { getVisibleSpatialItems } from "@/lib/virtualization";

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
  const richTextBlockRefs = useRef<Record<string, RichTextBlockHandle | null>>(
    {},
  );
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

  const shouldVirtualizeBlocks =
    blocks.length >= BLOCK_VIRTUALIZATION_THRESHOLD;
  const renderedBlocks = useMemo(
    () =>
      shouldVirtualizeBlocks
        ? getVisibleSpatialItems(
            blocks,
            { ...blockViewport, overscan: BLOCK_VIRTUALIZATION_OVERSCAN },
            (block) => ({
              top: block.y,
              height: estimateBlockHeight(block, canvasWidth),
            }),
            (block) => block.id === activeBlockId,
          )
        : blocks,
    [activeBlockId, blockViewport, blocks, canvasWidth, shouldVirtualizeBlocks],
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
    },
    [],
  );
  const setRichTextBlockHandle = useCallback(
    (blockId: string, handle: RichTextBlockHandle | null) => {
      richTextBlockRefs.current[blockId] = handle;
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
    Object.values(blockRefs.current).forEach((element) => {
      if (!element) {
        return;
      }

      element.style.height = "0px";
      element.style.height = `${Math.max(element.scrollHeight, 28)}px`;
    });

    const restore = selectionRestoreRef.current;
    if (restore) {
      selectionRestoreRef.current = null;
      const element = blockRefs.current[restore.id];
      element?.focus();
      element?.setSelectionRange(restore.start, restore.end);
    }

    const nextLowestBlockBottom = blocks.reduce((max, block) => {
      const element = getTextBlockElement(block.id);
      const blockWidth = getRenderedBlockWidth(block, canvasWidth);
      const blockHeight = isImageBlock(block)
        ? getImageBlockHeight(block, blockWidth)
        : Math.max(
            element?.scrollHeight ?? 28,
            element?.offsetHeight ?? 28,
            estimateBlockHeight(block, canvasWidth),
            28,
          );
      return Math.max(max, block.y + blockHeight);
    }, 0);

    const frameId = window.requestAnimationFrame(() => {
      setLowestBlockBottom(nextLowestBlockBottom);
    });
    return () => window.cancelAnimationFrame(frameId);
  }, [blocks, canvasWidth, getTextBlockElement]);

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
    richTextBlockRefs,
    queueSelectionRestore,
    selectionRestoreRef,
    setBlockElement,
    setRichTextBlockHandle,
    shouldVirtualizeBlocks,
  };
}
