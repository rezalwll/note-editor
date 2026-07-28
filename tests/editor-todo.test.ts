import { describe, expect, it } from "vitest";

import { toggleTodoMarkerAtPosition } from "@/lib/editor-document";

describe("clickable editor todos", () => {
  it("checks an unchecked marker and unchecks completed markers", () => {
    expect(toggleTodoMarkerAtPosition("☐ first", 0)).toEqual({
      text: "☑ first",
      selectionPosition: 1,
      checked: true,
    });
    expect(toggleTodoMarkerAtPosition("☑ first", 1)).toEqual({
      text: "☐ first",
      selectionPosition: 1,
      checked: false,
    });
    expect(toggleTodoMarkerAtPosition("☒ first", 0)).toEqual({
      text: "☐ first",
      selectionPosition: 1,
      checked: false,
    });
  });

  it("supports indented todos on later lines", () => {
    const text = "plain\n  ☐ nested";
    const markerPosition = text.indexOf("☐");

    expect(toggleTodoMarkerAtPosition(text, markerPosition)).toMatchObject({
      text: "plain\n  ☑ nested",
      selectionPosition: markerPosition + 1,
    });
  });

  it("does not toggle ordinary text or clicks outside the marker", () => {
    expect(toggleTodoMarkerAtPosition("plain", 0)).toBeNull();
    expect(toggleTodoMarkerAtPosition("☐ task", 3)).toBeNull();
    expect(toggleTodoMarkerAtPosition("☐without-space", 0)).toBeNull();
  });
});
