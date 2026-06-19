import { describe, expect, it } from "vitest";

import { getOverflowNotebookIds } from "@/lib/notebook-tabs";

describe("getOverflowNotebookIds", () => {
  it("keeps notebooks after the second row inside overflow by default", () => {
    const overflowIds = getOverflowNotebookIds([
      { id: "n1", rowTop: 0 },
      { id: "n2", rowTop: 0 },
      { id: "n3", rowTop: 24 },
      { id: "n4", rowTop: 24 },
      { id: "n5", rowTop: 48 },
    ]);

    expect(overflowIds).toEqual(["n4", "n5"]);
  });

  it("pins the editing notebook in the visible rows", () => {
    const overflowIds = getOverflowNotebookIds(
      [
        { id: "n1", rowTop: 0 },
        { id: "n2", rowTop: 0 },
        { id: "n3", rowTop: 24 },
        { id: "draft", rowTop: 48 },
      ],
      "draft",
    );

    expect(overflowIds).toEqual(["n3", "n2"]);
    expect(overflowIds).not.toContain("draft");
  });
});
