import {
  estimateBlockHeight,
  getBlockRightGutter,
  getCanvasInset,
  getRenderedBlockWidth,
} from "@/lib/editor-document";
import type { FreeformBlock } from "@/lib/notes";

export const BLOCK_COLLISION_GAP = 12;

type BlockBounds = {
  left: number;
  right: number;
  top: number;
  bottom: number;
};

function overlapsHorizontally(
  first: Pick<BlockBounds, "left" | "right">,
  second: Pick<BlockBounds, "left" | "right">,
) {
  return first.left < second.right && first.right > second.left;
}

function getBoundedBlockX(
  canvasWidth: number,
  desiredX: number,
  blockWidth: number,
) {
  const inset = getCanvasInset(canvasWidth);
  const rightGutter = getBlockRightGutter(canvasWidth);

  return Math.min(
    Math.max(inset, desiredX),
    Math.max(inset, canvasWidth - blockWidth - rightGutter),
  );
}

function overlapsVertically(first: BlockBounds, second: BlockBounds) {
  return first.top < second.bottom && first.bottom > second.top;
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
      const x = getBoundedBlockX(canvasWidth, block.x, width);
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
      second.x - first.x ||
      first.id.localeCompare(second.id),
  );

  for (const block of orderedBlocks) {
    const width = getRenderedBlockWidth(block, canvasWidth);
    const x = getBoundedBlockX(canvasWidth, block.x, width);
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
          (constrained || displaced || obstacle.constrained || obstacle.displaced),
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
  gap = BLOCK_COLLISION_GAP,
}: {
  blocks: readonly FreeformBlock[];
  sourceBlockId: string;
  previousHeight: number;
  nextHeight: number;
  canvasWidth: number;
  measuredHeights?: ReadonlyMap<string, number>;
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
  const previousSourceBottom = source.y + previousHeight;
  const affectedBounds: BlockBounds[] = [
    {
      left: source.x,
      right: source.x + sourceWidth,
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
    const horizontalBounds = {
      left: block.x,
      right: block.x + width,
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
