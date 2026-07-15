import { describe, expect, it } from "vitest";

import { serializeEditorContent } from "@/lib/editor-serialization";
import { serializeEditorContentSync } from "@/lib/editor-serialization-core";
import { IncrementalBodyTextIndex } from "@/lib/incremental-body-text";
import type { FreeformBlock } from "@/lib/notes";
import { SpatialItemIndex } from "@/lib/virtualization";

function makeBlocks(count: number): FreeformBlock[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `block-${index}`,
    x: 48,
    y: index * 100,
    width: 280,
    text: `text ${index}`,
  }));
}

describe("editor CPU helpers", () => {
  it("updates body text incrementally and preserves document order", () => {
    const blocks = makeBlocks(5_000);
    const index = new IncrementalBodyTextIndex(blocks);

    index.upsert({ id: "block-2500", text: "changed middle" });
    index.remove(["block-0", "block-4999"]);

    const bodyText = index.getText();
    expect(bodyText.startsWith("text 1 text 2")).toBe(true);
    expect(bodyText).toContain("text 2499 changed middle text 2501");
    expect(bodyText).not.toContain("text 4999");
    expect(index.getText()).toBe(bodyText);
  });

  it("serializes only persistable blocks without reparsing JSON", () => {
    const result = serializeEditorContentSync([
      { id: "empty", x: 0, y: 0, text: "   " },
      { id: "text", x: 0, y: 100, text: " saved text " },
      {
        id: "image",
        x: 0,
        y: 200,
        text: "",
        type: "image",
        attachmentId: "attachment-1",
      },
    ]);

    expect(JSON.parse(result.bodyHtml).blocks).toHaveLength(2);
    expect(result.bodyText).toBe("saved text");
  });

  it("falls back safely when Web Worker is unavailable for a large document", async () => {
    const blocks = makeBlocks(600);
    const result = await serializeEditorContent(blocks, "cached body text");

    expect(result.bodyText).toBe("cached body text");
    expect(JSON.parse(result.bodyHtml).blocks).toHaveLength(600);
  });

  it("queries a y-sorted index with binary search and keeps an offscreen active block", () => {
    const blocks = makeBlocks(5_000).map((block) => ({
      ...block,
      height: block.id === "block-1000" ? 600 : 32,
    }));
    let boundsReadCount = 0;
    const index = new SpatialItemIndex(
      blocks,
      (block) => block.id,
      (block) => {
        boundsReadCount += 1;
        return { top: block.y, height: block.height };
      },
    );
    expect(boundsReadCount).toBe(5_000);

    boundsReadCount = 0;
    const visible = index.query(
      { top: 100_100, bottom: 100_450, overscan: 100 },
      "block-0",
    );

    expect(boundsReadCount).toBe(0);
    expect(visible.some((block) => block.id === "block-1000")).toBe(true);
    expect(visible.some((block) => block.id === "block-0")).toBe(true);
    expect(visible.length).toBeLessThan(20);
  });
});
