import type { FreeformBlock } from "@/lib/notes";

export type MobileDraft = {
  id: string;
  insertIndex: number;
  x: number;
  y: number;
  width: number;
  gapBefore: number;
  nextBlockId?: string;
  nextGapBefore?: number;
  text: string;
};

export type MobileDraftAction =
  | { type: "place"; draft: MobileDraft }
  | { type: "update-text"; text: string }
  | { type: "clear" };

export function mobileDraftReducer(
  state: MobileDraft | null,
  action: MobileDraftAction,
): MobileDraft | null {
  switch (action.type) {
    case "place":
      return action.draft;
    case "update-text":
      return state ? { ...state, text: action.text } : state;
    case "clear":
      return null;
  }
}

export function findMobileInsertIndex(
  clientY: number,
  blockRects: Array<{ top: number; bottom: number }>,
) {
  const index = blockRects.findIndex((rect) => {
    const midpoint = rect.top + (rect.bottom - rect.top) / 2;
    return clientY < midpoint;
  });

  return index === -1 ? blockRects.length : index;
}

export function commitMobileDraft(
  blocks: FreeformBlock[],
  draft: MobileDraft,
) {
  if (!draft.text.trim()) {
    return blocks;
  }

  const nextBlock: FreeformBlock = {
    id: draft.id,
    x: draft.x,
    y: draft.y,
    width: draft.width,
    mobileGapBefore: draft.gapBefore,
    text: draft.text,
    align: "right",
  };

  return [
    ...blocks.map((block) =>
      block.id === draft.nextBlockId
        ? { ...block, mobileGapBefore: draft.nextGapBefore }
        : block,
    ),
    nextBlock,
  ];
}

export function removeMobileBlockPreservingGap(
  blocks: FreeformBlock[],
  blockId: string,
  blockHeight: number,
  defaultGap: number,
) {
  const ordered = [...blocks].sort(
    (left, right) =>
      left.y - right.y || left.x - right.x || left.id.localeCompare(right.id),
  );
  const targetIndex = ordered.findIndex((block) => block.id === blockId);
  const target = ordered[targetIndex];
  const nextBlock = ordered[targetIndex + 1];

  if (!target) {
    return blocks;
  }

  const targetGap =
    target.mobileGapBefore ?? (targetIndex === 0 ? 0 : defaultGap);
  const nextGap = nextBlock?.mobileGapBefore ?? defaultGap;
  const mergedGap = targetGap + blockHeight + nextGap;

  return blocks
    .filter((block) => block.id !== blockId)
    .map((block) =>
      block.id === nextBlock?.id
        ? { ...block, mobileGapBefore: mergedGap }
        : block,
    );
}
