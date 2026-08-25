import { describe, expect, it } from "vitest";

import {
  extractFreeformPlainText,
  extractPlainText,
  parseFreeformDocument,
  parseTags,
  sanitizeNoteHtml,
  serializeFreeformDocument,
} from "@/lib/notes";

describe("note content", () => {
  it("round-trips a freeform document without losing content", () => {
    const serialized = serializeFreeformDocument({
      type: "freeform-v1",
      blocks: [
        { id: "block-1", x: 10, y: 20, text: "خط اول", align: "right" },
        { id: "block-2", x: 30, y: 50, text: "خط دوم", align: "center" },
      ],
    });

    const parsed = parseFreeformDocument(serialized);

    expect(parsed).not.toBeNull();
    expect(parsed?.blocks).toHaveLength(2);
    expect(parsed && extractFreeformPlainText(parsed)).toBe("خط اول خط دوم");
  });

  it("ignores legacy mobile gap fields while still parsing the document", () => {
    const serialized = JSON.stringify({
      type: "freeform-v1",
      blocks: [
        {
          id: "mobile-block",
          x: 16,
          y: 24,
          mobileGapBefore: 180,
          text: "Mobile note",
        },
      ],
    });

    expect(parseFreeformDocument(serialized)?.blocks[0]).toEqual({
      id: "mobile-block",
      x: 16,
      y: 24,
      text: "Mobile note",
    });
  });

  it("round-trips text direction independently from alignment", () => {
    const serialized = serializeFreeformDocument({
      type: "freeform-v1",
      blocks: [
        {
          id: "mixed-language",
          x: 48,
          y: 72,
          text: "English متن فارسی",
          align: "right",
          direction: "ltr",
        },
      ],
    });

    expect(parseFreeformDocument(serialized)?.blocks[0]).toEqual(
      expect.objectContaining({
        align: "right",
        direction: "ltr",
      }),
    );
  });

  it("round-trips inline rich-text styles", () => {
    const richText =
      '<p><span style="color: #ff3366; font-size: 24px">styled</span> text</p>';
    const serialized = serializeFreeformDocument({
      type: "freeform-v1",
      blocks: [
        {
          id: "rich-text",
          x: 48,
          y: 72,
          text: "styled text",
          richText,
        },
      ],
    });

    expect(parseFreeformDocument(serialized)?.blocks[0]).toEqual(
      expect.objectContaining({ richText }),
    );
  });

  it("round-trips image blocks with their attachment and layout metadata", () => {
    const serialized = serializeFreeformDocument({
      type: "freeform-v1",
      blocks: [
        {
          id: "image-block",
          type: "image",
          attachmentId: "attachment-1",
          fileName: "clipboard.png",
          aspectRatio: 1.5,
          x: 48,
          y: 120,
          width: 420,
          text: "",
        },
      ],
    });

    expect(parseFreeformDocument(serialized)?.blocks[0]).toEqual({
      id: "image-block",
      type: "image",
      attachmentId: "attachment-1",
      fileName: "clipboard.png",
      aspectRatio: 1.5,
      x: 48,
      y: 120,
      width: 420,
      text: "",
    });
  });

  it("round-trips a viewport-independent horizontal block anchor", () => {
    const document = {
      type: "freeform-v1" as const,
      blocks: [
        {
          id: "mobile-positioned",
          x: 92,
          y: 120,
          width: 240,
          manualWidth: true,
          horizontalAnchor: 0.65,
          text: "متن موبایل",
        },
      ],
    };

    expect(parseFreeformDocument(serializeFreeformDocument(document))).toEqual(
      document,
    );
  });

  it("sanitizes executable markup while preserving note text", () => {
    const html = sanitizeNoteHtml(
      '<p>متن امن</p><script>alert(1)</script><img src="x" onerror="alert(2)">',
    );

    expect(html).not.toContain("script");
    expect(html).not.toContain("onerror");
    expect(extractPlainText(html)).toContain("متن امن");
  });

  it("normalizes and de-duplicates tags", () => {
    expect(parseTags("کار، مهم, کار, پروژه  شخصی")).toEqual([
      "کار",
      "مهم",
      "پروژه شخصی",
    ]);
  });
});
