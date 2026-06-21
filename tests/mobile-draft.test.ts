import { describe, expect, it } from "vitest";

import {
  commitMobileDraft,
  findMobileInsertIndex,
  mobileDraftReducer,
  removeMobileBlockPreservingGap,
  type MobileDraft,
} from "@/components/editor/freeform/mobile-draft";
import type { FreeformBlock } from "@/lib/notes";

const draft: MobileDraft = {
  id: "draft-block",
  insertIndex: 1,
  x: 16,
  y: 180,
  width: 358,
  gapBefore: 12,
  nextBlockId: "lower",
  nextGapBefore: 112,
  text: "",
};

describe("mobile freeform draft", () => {
  it("keeps placement and text outside the document until commit", () => {
    const placed = mobileDraftReducer(null, { type: "place", draft });
    const typed = mobileDraftReducer(placed, {
      type: "update-text",
      text: "new note",
    });

    expect(typed?.text).toBe("new note");
    expect(mobileDraftReducer(typed, { type: "clear" })).toBeNull();
  });

  it("finds insertion slots from measured visual geometry", () => {
    const rects = [
      { top: 140, bottom: 168 },
      { top: 320, bottom: 348 },
    ];

    expect(findMobileInsertIndex(180, rects)).toBe(1);
    expect(findMobileInsertIndex(400, rects)).toBe(2);
  });

  it("commits the first real text and adjusts only the following gap", () => {
    const blocks: FreeformBlock[] = [
      { id: "upper", x: 16, y: 40, text: "upper" },
      { id: "lower", x: 16, y: 320, text: "lower" },
    ];
    const committed = commitMobileDraft(blocks, {
      ...draft,
      text: "new note",
    });

    expect(committed).toHaveLength(3);
    expect(committed.find((block) => block.id === "draft-block")).toMatchObject({
      text: "new note",
      mobileGapBefore: 12,
    });
    expect(committed.find((block) => block.id === "lower")?.mobileGapBefore).toBe(
      112,
    );
  });

  it("preserves surrounding whitespace when a committed block is removed", () => {
    const blocks: FreeformBlock[] = [
      { id: "upper", x: 16, y: 40, text: "upper" },
      {
        id: "middle",
        x: 16,
        y: 180,
        text: "",
        mobileGapBefore: 12,
      },
      {
        id: "lower",
        x: 16,
        y: 320,
        text: "lower",
        mobileGapBefore: 112,
      },
    ];

    const next = removeMobileBlockPreservingGap(blocks, "middle", 28, 24);

    expect(next).toHaveLength(2);
    expect(next.find((block) => block.id === "lower")?.mobileGapBefore).toBe(152);
  });
});
