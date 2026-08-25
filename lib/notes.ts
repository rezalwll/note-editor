import sanitizeHtml from "sanitize-html";
import { z } from "zod";

const allowedTags = [
  "p",
  "br",
  "strong",
  "em",
  "u",
  "s",
  "blockquote",
  "code",
  "pre",
  "h1",
  "h2",
  "h3",
  "ul",
  "ol",
  "li",
  "a",
  "img",
  "hr",
  "mark",
];

const allowedAttributes = {
  a: ["href", "target", "rel"],
  img: ["src", "alt"],
};

export function sanitizeNoteHtml(input: string) {
  return sanitizeHtml(input, {
    allowedTags,
    allowedAttributes,
    allowedSchemes: ["http", "https", "data"],
  });
}

export function extractPlainText(html: string) {
  return sanitizeHtml(html, {
    allowedTags: [],
    allowedAttributes: {},
  })
    .replace(/\s+/g, " ")
    .trim();
}

export function parseTags(raw: string) {
  return [
    ...new Set(
      raw
        .split(/[,،]/)
        .map((item) => item.trim().replace(/\s+/g, " "))
        .filter(Boolean),
    ),
  ].slice(0, 12);
}

const freeformBlockSchema = z.object({
  id: z.string(),
  x: z.number(),
  y: z.number(),
  width: z.number().optional(),
  manualWidth: z.boolean().optional(),
  horizontalAnchor: z.number().min(0).max(1).optional(),
  text: z.string(),
  richText: z.string().optional(),
  type: z.enum(["text", "image"]).optional(),
  attachmentId: z.string().trim().min(1).optional(),
  fileName: z.string().trim().max(255).optional(),
  aspectRatio: z.number().positive().max(20).optional(),
  align: z.enum(["right", "center", "justify"]).optional(),
  direction: z.enum(["rtl", "ltr"]).optional(),
  bold: z.boolean().optional(),
  italic: z.boolean().optional(),
  textColor: z.string().trim().max(24).optional(),
  fontSize: z.number().int().min(13).max(32).optional(),
});

const freeformDocumentSchema = z.object({
  type: z.literal("freeform-v1"),
  blocks: z.array(freeformBlockSchema),
});

export type FreeformBlock = z.infer<typeof freeformBlockSchema>;
export type FreeformDocument = z.infer<typeof freeformDocumentSchema>;

export function parseFreeformDocument(input: string) {
  const parsed = z.string().trim().safeParse(input);

  if (!parsed.success || !parsed.data.startsWith("{")) {
    return null;
  }

  try {
    return freeformDocumentSchema.parse(JSON.parse(parsed.data));
  } catch {
    return null;
  }
}

export function serializeFreeformDocument(document: FreeformDocument) {
  return JSON.stringify(document);
}

export function extractFreeformPlainText(document: FreeformDocument) {
  return document.blocks
    .map((block) => block.text.trim())
    .filter(Boolean)
    .join(" ");
}
