import { describe, expect, it } from "vitest";

import {
  BLOCK_COLLISION_GAP,
  getBlockAutoGrowthWidth,
  getBlockResizeMaxWidth,
  getBlockGrowthPositionUpdates,
  getResponsiveBlockLayout,
} from "@/lib/editor-collision";
import { estimateBlockHeight, getBlockHorizontalAnchor } from "@/lib/editor-document";
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
  it("caps automatic text growth at a neighboring block so the text wraps", () => {
    const left = textBlock("left", 200, 72);
    const typing = textBlock("typing", 520, 72);

    expect(
      getBlockAutoGrowthWidth({
        blocks: [left, typing],
        growingBlockId: typing.id,
        desiredWidth: 500,
        canvasWidth: 1_200,
        sourceHeight: 28,
      }),
    ).toBe(308);
    expect(
      getBlockAutoGrowthWidth({
        blocks: [{ ...left, y: 180 }, typing],
        growingBlockId: typing.id,
        desiredWidth: 500,
        canvasWidth: 1_200,
        sourceHeight: 28,
      }),
    ).toBe(500);
  });

  it("respects a centered block anchor when limiting text growth", () => {
    const left = textBlock("left", 200, 72);
    const typing = { ...textBlock("typing", 480, 72), horizontalAnchor: 0.5 };

    expect(
      getBlockAutoGrowthWidth({
        blocks: [left, typing],
        growingBlockId: typing.id,
        desiredWidth: 500,
        canvasWidth: 1_200,
        sourceHeight: 28,
      }),
    ).toBe(296);
  });

  it("stops left-edge resizing before a block in the same row", () => {
    const left = textBlock("left", 200, 72);
    const right = textBlock("right", 520, 72);

    expect(
      getBlockResizeMaxWidth({
        blocks: [left, right],
        resizingBlockId: right.id,
        edge: "left",
        startX: right.x,
        startY: right.y,
        startWidth: right.width ?? 240,
        canvasWidth: 1_200,
      }),
    ).toBe(308);
  });

  it("stops right-edge resizing before a block in the same row", () => {
    const left = textBlock("left", 200, 72);
    const right = textBlock("right", 520, 72);

    expect(
      getBlockResizeMaxWidth({
        blocks: [left, right],
        resizingBlockId: left.id,
        edge: "right",
        startX: left.x,
        startY: left.y,
        startWidth: left.width ?? 240,
        canvasWidth: 1_200,
      }),
    ).toBe(308);
  });

  it("does not constrain resizing for a block in another row", () => {
    const left = textBlock("left", 200, 72);
    const right = textBlock("right", 520, 180);

    expect(
      getBlockResizeMaxWidth({
        blocks: [left, right],
        resizingBlockId: right.id,
        edge: "left",
        startX: right.x,
        startY: right.y,
        startWidth: right.width ?? 240,
        canvasWidth: 1_200,
      }),
    ).toBeNull();
  });

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

  it("uses responsive horizontal positions when anchored blocks grow", () => {
    const source = {
      ...textBlock("source", 48, 72, 300),
      horizontalAnchor: 0,
    };
    const otherColumn = {
      ...textBlock("other-column", 48, 112, 300),
      horizontalAnchor: 1,
    };

    const updates = getBlockGrowthPositionUpdates({
      blocks: [source, otherColumn],
      sourceBlockId: source.id,
      previousHeight: 28,
      nextHeight: 84,
      canvasWidth: 1_200,
    });

    expect(updates.has(otherColumn.id)).toBe(false);
  });

  it("trusts rendered bounds when stored geometry is stale", () => {
    const source = textBlock("source", 48, 72, 500);
    const visuallySeparate = textBlock("visually-separate", 400, 112, 500);
    const measuredHorizontalBounds = new Map([
      [source.id, { left: 80, right: 444 }],
      [visuallySeparate.id, { left: 488, right: 1_454 }],
    ]);

    const updates = getBlockGrowthPositionUpdates({
      blocks: [source, visuallySeparate],
      sourceBlockId: source.id,
      previousHeight: 28,
      nextHeight: 84,
      canvasWidth: 1_536,
      measuredHorizontalBounds,
    });

    expect(updates.has(visuallySeparate.id)).toBe(false);
  });

  it("stacks desktop columns when a narrow canvas forces them to overlap", () => {
    const right = textBlock("right", 600, 72, 300);
    const left = textBlock("left", 48, 72, 300);

    const layout = getResponsiveBlockLayout({
      blocks: [left, right],
      canvasWidth: 390,
    });

    expect(layout[1]).toMatchObject({
      id: "right",
      x: 74,
      y: 72,
    });
    expect(layout[0]).toMatchObject({
      id: "left",
      x: 48,
      y:
        72 +
        estimateBlockHeight(right, 390) +
        BLOCK_COLLISION_GAP,
    });
    expect(left).toMatchObject({ x: 48, y: 72 });
    expect(right).toMatchObject({ x: 600, y: 72 });
  });

  it("preserves fitting and intentionally overlapping freeform positions", () => {
    const fitting = [
      textBlock("right", 400, 72, 240),
      textBlock("left", 48, 72, 240),
    ];
    const overlapping = [
      textBlock("first", 48, 160, 240),
      textBlock("second", 100, 160, 240),
    ];

    expect(
      getResponsiveBlockLayout({ blocks: fitting, canvasWidth: 900 }),
    ).toEqual(fitting);
    expect(
      getResponsiveBlockLayout({ blocks: overlapping, canvasWidth: 900 }),
    ).toEqual(overlapping);
  });

  it("does not stack desktop blocks for floating-point anchor rounding", () => {
    const anchored = {
      ...textBlock("anchored", 199, 72),
      horizontalAnchor: getBlockHorizontalAnchor(900, 199, 240),
    };
    const neighbor = textBlock("neighbor", 48, 72);

    expect(
      getResponsiveBlockLayout({
        blocks: [neighbor, anchored],
        canvasWidth: 900,
      }).map(({ id, x, y }) => ({ id, x, y })),
    ).toEqual([
      { id: "neighbor", x: 48, y: 72 },
      { id: "anchored", x: 199, y: 72 },
    ]);
  });

  it("cascades responsive displacement through blocks below it", () => {
    const topRight = textBlock("top-right", 600, 72, 300);
    const topLeft = textBlock("top-left", 48, 72, 300);
    const belowLeft = textBlock("below-left", 48, 112, 300);
    const heights = new Map([
      ["top-right", 28],
      ["top-left", 28],
      ["below-left", 28],
    ]);

    const layout = getResponsiveBlockLayout({
      blocks: [topLeft, belowLeft, topRight],
      canvasWidth: 390,
      measuredHeights: heights,
    });

    expect(layout.map(({ id, y }) => ({ id, y }))).toEqual([
      { id: "top-left", y: 112 },
      { id: "below-left", y: 152 },
      { id: "top-right", y: 72 },
    ]);
  });

  it("orders mixed anchored and legacy blocks by their rendered position", () => {
    const anchored = {
      ...textBlock("anchored", 92, 72, 300),
      horizontalAnchor: 0.7,
    };
    const legacy = textBlock("legacy", 600, 72, 300);
    const heights = new Map([
      [anchored.id, 28],
      [legacy.id, 28],
    ]);

    const layout = getResponsiveBlockLayout({
      blocks: [legacy, anchored],
      canvasWidth: 1_200,
      measuredHeights: heights,
    });

    expect(layout.find((block) => block.id === "anchored")?.y).toBe(72);
    expect(layout.find((block) => block.id === "legacy")?.y).toBe(
      72 + 28 + BLOCK_COLLISION_GAP,
    );
  });
});
