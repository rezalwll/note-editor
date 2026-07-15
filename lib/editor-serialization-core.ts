import type { FreeformBlock } from "@/lib/notes";

export type SerializedEditorContent = {
  bodyHtml: string;
  bodyText: string;
};

export function getSerializableBlocks(blocks: readonly FreeformBlock[]) {
  return blocks.filter(
    (block) => block.type === "image" || Boolean(block.text.trim()),
  );
}

export function serializeEditorContentSync(
  blocks: readonly FreeformBlock[],
  cachedBodyText?: string,
): SerializedEditorContent {
  const persistableBlocks = getSerializableBlocks(blocks);
  return {
    bodyHtml: JSON.stringify({
      type: "freeform-v1",
      blocks: persistableBlocks,
    }),
    bodyText:
      cachedBodyText ??
      persistableBlocks
        .map((block) => block.text.trim())
        .filter(Boolean)
        .join(" "),
  };
}
