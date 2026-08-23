import { describe, expect, it } from "vitest";

import {
  getAnchoredBlockX,
  getBlockHorizontalAnchor,
  getResponsiveBlockX,
} from "@/lib/editor-document";
import type { FreeformBlock } from "@/lib/notes";

describe("responsive editor block positioning", () => {
  it("round-trips a logical horizontal position between mobile and desktop", () => {
    const mobileX = 92;
    const blockWidth = 240;
    const anchor = getBlockHorizontalAnchor(390, mobileX, blockWidth);
    const desktopX = getAnchoredBlockX(1200, anchor, blockWidth);

    expect(anchor).toBeCloseTo(76 / 118, 8);
    expect(desktopX).toBeCloseTo(604.474576, 5);
    expect(
      getBlockHorizontalAnchor(1200, desktopX, blockWidth),
    ).toBeCloseTo(anchor, 8);
    expect(getAnchoredBlockX(390, anchor, blockWidth)).toBeCloseTo(
      mobileX,
      8,
    );
  });

  it("keeps both horizontal edges stable across viewport widths", () => {
    expect(getAnchoredBlockX(390, 0, 240)).toBe(16);
    expect(getAnchoredBlockX(390, 1, 240)).toBe(134);
    expect(getAnchoredBlockX(1200, 0, 240)).toBe(48);
    expect(getAnchoredBlockX(1200, 1, 240)).toBe(912);
  });

  it("uses the anchor for new blocks and legacy clamping otherwise", () => {
    const anchoredBlock: FreeformBlock = {
      id: "anchored",
      x: 92,
      y: 72,
      width: 240,
      horizontalAnchor: getBlockHorizontalAnchor(390, 92, 240),
      text: "mobile",
    };
    const legacyBlock: FreeformBlock = {
      id: "legacy",
      x: 600,
      y: 72,
      width: 240,
      text: "desktop",
    };

    expect(getResponsiveBlockX(anchoredBlock, 1200)).toBeCloseTo(
      604.474576,
      5,
    );
    expect(getResponsiveBlockX(legacyBlock, 390)).toBe(134);
    expect(legacyBlock.x).toBe(600);
  });

  it("clamps malformed runtime anchors without allowing overflow", () => {
    expect(getAnchoredBlockX(390, -2, 240)).toBe(16);
    expect(getAnchoredBlockX(390, 3, 240)).toBe(134);
    expect(getBlockHorizontalAnchor(200, 100, 180)).toBe(1);
  });
});
