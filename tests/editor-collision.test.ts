import { describe, expect, it } from "vitest";

import { getBlockGrowthPositionUpdates } from "@/lib/editor-collision";
import type { FreeformBlock } from "@/lib/notes";

function textBlock(
  id: string,
  x: number,
  y: number,
  width = 240,
): FreeformBlock {
  return { id, x, y, width, text: id };
}

describe("editor block collision handling", () => {
  it("pushes intersecting blocks down and cascades through the column", () => {
    const blocks = [
      textBlock("source", 48, 72),
      textBlock("below", 48, 112),
      textBlock("next", 48, 152),
      textBlock("other-column", 400, 112),
    ];
    const heights = new Map(blocks.map((block) => [block.id, 28]));

    const updates = getBlockGrowthPositionUpdates({
      blocks,
      sourceBlockId: "source",
      previousHeight: 28,
      nextHeight: 84,
      canvasWidth: 1_200,
      measuredHeights: heights,
    });

    expect(Object.fromEntries(updates)).toEqual({
      below: 168,
      next: 208,
    });
    expect(updates.has("other-column")).toBe(false);
  });

  it("does not move blocks when the source shrinks or keeps its height", () => {
    const blocks = [textBlock("source", 48, 72), textBlock("below", 48, 112)];

    expect(
      getBlockGrowthPositionUpdates({
        blocks,
        sourceBlockId: "source",
        previousHeight: 84,
        nextHeight: 28,
        canvasWidth: 1_200,
      }).size,
    ).toBe(0);
  });
});
