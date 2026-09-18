import {
  estimateBlockHeight,
  getRenderedBlockWidth,
  getResponsiveBlockX,
} from "@/lib/editor-document";
import type { FreeformBlock } from "@/lib/notes";

export const BLOCK_COLLISION_GAP = 12;
const POSITION_ROUNDING_TOLERANCE = 0.5;

type BlockBounds = {
  left: number;
  right: number;
  top: number;
  bottom: number;
};

export type BlockHorizontalBounds = Pick<BlockBounds, "left" | "right">;

/**
 * Returns the furthest width a block may grow to without crossing a block in
 * the same visual row. Resizing only changes one edge, so a block on the
 * opposite side of that fixed edge cannot become a new collision.
 */
export function getBlockResizeMaxWidth({
  blocks,
  resizingBlockId,
  edge,
  startX,
  startY,
  startWidth,
  canvasWidth,
  measuredHeights,
  gap = BLOCK_COLLISION_GAP,
}: {
  blocks: readonly FreeformBlock[];
  resizingBlockId: string;
  edge: "left" | "right";
  startX: number;
  startY: number;
  startWidth: number;
  canvasWidth: number;
  measuredHeights?: ReadonlyMap<string, number>;
  gap?: number;
}) {
  const resizingBlock = blocks.find((block) => block.id === resizingBlockId);
  if (!resizingBlock) {
    return null;
  }

  const sourceBounds = {
    left: startX,
    right: startX + startWidth,
    top: startY,
    bottom:
      startY +
      (measuredHeights?.get(resizingBlock.id) ??
        estimateBlockHeight(resizingBlock, canvasWidth)),
  };
  const fixedEdge = edge === "left" ? sourceBounds.right : sourceBounds.left;
  let maxWidth: number | null = null;

  for (const block of blocks) {
    if (block.id === resizingBlockId) {
      continue;
    }

    const width = getRenderedBlockWidth(block, canvasWidth);
    const x = getResponsiveBlockX(block, canvasWidth);
    const bounds = {
      left: x,
      right: x + width,
      top: block.y,
      bottom:
        block.y +
        (measuredHeights?.get(block.id) ?? estimateBlockHeight(block, canvasWidth)),
    };
    if (!overlapsVertically(sourceBounds, bounds)) {
      continue;
    }

    const candidateMaxWidth =
      edge === "left"
        ? fixedEdge - bounds.right - gap
        : bounds.left - fixedEdge - gap;
    const isInExpansionDirection =
      edge === "left"
        ? bounds.right < fixedEdge
        : bounds.left > fixedEdge;

    if (!isInExpansionDirection) {
      continue;
    }

    // Existing overlapping layouts remain editable, but they must not become
    // more overlapped while a user drags an edge outward.
    const safeMaxWidth = Math.max(startWidth, candidateMaxWidth);
    maxWidth = maxWidth === null ? safeMaxWidth : Math.min(maxWidth, safeMaxWidth);
  }

  return maxWidth;
}

function overlapsHorizontally(
  first: Pick<BlockBounds, "left" | "right">,
  second: Pick<BlockBounds, "left" | "right">,
) {
  return first.left < second.right && first.right > second.left;
}

function overlapsVertically(first: BlockBounds, second: BlockBounds) {
  return first.top < second.bottom && first.bottom > second.top;
}

function getStableResponsiveX(block: FreeformBlock, canvasWidth: number) {
  const x = getResponsiveBlockX(block, canvasWidth);
  // An anchor reconstructed at the same canvas width can differ by a tiny
  // floating-point fraction. That is not a viewport constraint.
  return Math.abs(x - block.x) < POSITION_ROUNDING_TOLERANCE ? block.x : x;
}

/**
 * Creates a display-only layout for a narrower canvas. Blocks retain their
 * persisted desktop coordinates, but blocks forced into each other by width
 * clamping are stacked vertically with a stable gap.
 */
export function getResponsiveBlockLayout({
  blocks,
  canvasWidth,
  measuredHeights,
  gap = BLOCK_COLLISION_GAP,
}: {
  blocks: readonly FreeformBlock[];
  canvasWidth: number;
  measuredHeights?: ReadonlyMap<string, number>;
  gap?: number;
}) {
  if (blocks.length < 2) {
    return blocks.map((block) => {
      const width = getRenderedBlockWidth(block, canvasWidth);
      const x = getStableResponsiveX(block, canvasWidth);
      return x === block.x ? block : { ...block, x };
    });
  }

  const placed: Array<
    BlockBounds & { constrained: boolean; displaced: boolean }
  > = [];
  const positions = new Map<string, { x: number; y: number }>();
  const orderedBlocks = [...blocks].sort(
    (first, second) =>
      first.y - second.y ||
      getStableResponsiveX(second, canvasWidth) -
        getStableResponsiveX(first, canvasWidth) ||
      first.id.localeCompare(second.id),
  );

  for (const block of orderedBlocks) {
    const width = getRenderedBlockWidth(block, canvasWidth);
    const x = getStableResponsiveX(block, canvasWidth);
    const height =
      measuredHeights?.get(block.id) ?? estimateBlockHeight(block, canvasWidth);
    const constrained =
      x !== block.x ||
      (typeof block.width === "number" && width !== block.width);
    let y = block.y;
    let displaced = false;

    for (;;) {
      const bounds = {
        left: x,
        right: x + width,
        top: y,
        bottom: y + height,
      };
      const collision = placed.find(
        (obstacle) =>
          overlapsHorizontally(bounds, obstacle) &&
          overlapsVertically(bounds, obstacle) &&
          (canvasWidth < 768 ||
            constrained ||
            displaced ||
            obstacle.constrained ||
            obstacle.displaced),
      );
      if (!collision) {
        break;
      }

      y = collision.bottom + gap;
      displaced = true;
    }

    positions.set(block.id, { x, y });
    placed.push({
      left: x,
      right: x + width,
      top: y,
      bottom: y + height,
      constrained,
      displaced,
    });
    placed.sort(
      (first, second) =>
        first.top - second.top || first.bottom - second.bottom,
    );
  }

  return blocks.map((block) => {
    const position = positions.get(block.id);
    return !position || (position.x === block.x && position.y === block.y)
      ? block
      : { ...block, ...position };
  });
}

/**
 * Keeps blocks that were below a growing block in their original vertical
 * order. Only horizontally intersecting blocks move, and displacement
 * cascades through later blocks without disturbing unrelated columns.
 */
export function getBlockGrowthPositionUpdates({
  blocks,
  sourceBlockId,
  previousHeight,
  nextHeight,
  canvasWidth,
  measuredHeights,
  measuredHorizontalBounds,
  gap = BLOCK_COLLISION_GAP,
}: {
  blocks: readonly FreeformBlock[];
  sourceBlockId: string;
  previousHeight: number;
  nextHeight: number;
  canvasWidth: number;
  measuredHeights?: ReadonlyMap<string, number>;
  measuredHorizontalBounds?: ReadonlyMap<string, BlockHorizontalBounds>;
  gap?: number;
}) {
  const updates = new Map<string, number>();
  if (nextHeight <= previousHeight + 0.5) {
    return updates;
  }

  const source = blocks.find((block) => block.id === sourceBlockId);
  if (!source) {
    return updates;
  }

  const sourceWidth = getRenderedBlockWidth(source, canvasWidth);
  const sourceX = getResponsiveBlockX(source, canvasWidth);
  const sourceHorizontalBounds = measuredHorizontalBounds?.get(source.id) ?? {
    left: sourceX,
    right: sourceX + sourceWidth,
  };
  const previousSourceBottom = source.y + previousHeight;
  const affectedBounds: BlockBounds[] = [
    {
      ...sourceHorizontalBounds,
      top: source.y,
      bottom: source.y + nextHeight,
    },
  ];

  const candidates = blocks
    .filter(
      (block) =>
        block.id !== sourceBlockId && block.y >= previousSourceBottom - 0.5,
    )
    .sort((first, second) => first.y - second.y || first.id.localeCompare(second.id));

  for (const block of candidates) {
    const width = getRenderedBlockWidth(block, canvasWidth);
    const x = getResponsiveBlockX(block, canvasWidth);
    const horizontalBounds = measuredHorizontalBounds?.get(block.id) ?? {
      left: x,
      right: x + width,
    };
    let nextY = block.y;

    for (const obstacle of affectedBounds) {
      if (!overlapsHorizontally(horizontalBounds, obstacle)) {
        continue;
      }
      nextY = Math.max(nextY, obstacle.bottom + gap);
    }

    if (nextY === block.y) {
      continue;
    }

    updates.set(block.id, nextY);
    const height =
      measuredHeights?.get(block.id) ?? estimateBlockHeight(block, canvasWidth);
    affectedBounds.push({
      ...horizontalBounds,
      top: nextY,
      bottom: nextY + height,
    });
  }

  return updates;
}
