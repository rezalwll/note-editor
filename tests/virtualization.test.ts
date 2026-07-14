import { describe, expect, it } from "vitest";

import { getFixedVirtualRange, getVisibleSpatialItems } from "@/lib/virtualization";

describe("virtualization helpers", () => {
  it("keeps a five-thousand-item fixed list bounded to the viewport", () => {
    const range = getFixedVirtualRange({
      itemCount: 5_000,
      itemHeight: 66,
      scrollTop: 180_000,
      viewportHeight: 660,
      overscan: 6,
    });

    expect(range.startIndex).toBeGreaterThan(2_700);
    expect(range.endIndex - range.startIndex).toBeLessThanOrEqual(22);
    expect(range.totalHeight).toBe(330_000);
    expect(range.offsetTop).toBe(range.startIndex * 66);
  });

  it("filters thousands of spatial blocks while retaining an active block", () => {
    const blocks = Array.from({ length: 5_000 }, (_, index) => ({
      id: `block-${index}`,
      y: index * 120,
      height: 36,
    }));
    const visible = getVisibleSpatialItems(
      blocks,
      { top: 240_000, bottom: 240_900, overscan: 720 },
      (block) => ({ top: block.y, height: block.height }),
      (block) => block.id === "block-0",
    );

    expect(visible).toContainEqual(blocks[0]);
    expect(visible.some((block) => block.id === "block-2000")).toBe(true);
    expect(visible.length).toBeLessThan(30);
  });
});
