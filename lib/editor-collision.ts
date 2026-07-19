import {
  estimateBlockHeight,
  getRenderedBlockWidth,
} from "@/lib/editor-document";
import type { FreeformBlock } from "@/lib/notes";

export const BLOCK_COLLISION_GAP = 12;

type BlockBounds = {
  left: number;
  right: number;
  bottom: number;
};

function overlapsHorizontally(
  first: Pick<BlockBounds, "left" | "right">,
  second: Pick<BlockBounds, "left" | "right">,
) {
  return first.left < second.right && first.right > second.left;
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
      bottom: nextY + height,
    });
  }

  return updates;
}
