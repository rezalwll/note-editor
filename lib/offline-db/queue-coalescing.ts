import type { SyncQueueItem } from "@/lib/offline-db/types";

export function compareQueueItemAge(
  left: SyncQueueItem,
  right: SyncQueueItem,
) {
  const createdAtOrder = left.createdAt.localeCompare(right.createdAt);
  if (createdAtOrder !== 0) {
    return createdAtOrder;
  }

  return (left.id ?? Number.MAX_SAFE_INTEGER) -
    (right.id ?? Number.MAX_SAFE_INTEGER);
}

function compareQueueItemRecency(
  left: SyncQueueItem,
  right: SyncQueueItem,
) {
  const createdAtOrder = right.createdAt.localeCompare(left.createdAt);
  if (createdAtOrder !== 0) {
    return createdAtOrder;
  }

  const revisionOrder = (right.revision ?? 0) - (left.revision ?? 0);
  if (revisionOrder !== 0) {
    return revisionOrder;
  }

  return (right.id ?? Number.MIN_SAFE_INTEGER) -
    (left.id ?? Number.MIN_SAFE_INTEGER);
}

export function getQueueCoalescingState(existingItems: SyncQueueItem[]) {
  const orderedItems = [...existingItems].sort(compareQueueItemAge);
  const stableItem = orderedItems[0];
  const itemWithBase = orderedItems.find(
    (item) => item.baseUpdatedAt !== undefined,
  );

  return {
    orderedItems,
    stableItem,
    itemWithBase,
    highestRevision: existingItems.reduce(
      (highest, item) => Math.max(highest, item.revision ?? 0),
      0,
    ),
  };
}

export function planQueueRepair(existingItems: SyncQueueItem[]) {
  if (existingItems.length < 2) {
    return null;
  }

  const state = getQueueCoalescingState(existingItems);
  const latestItem = [...existingItems].sort(compareQueueItemRecency)[0];
  if (state.stableItem?.id === undefined || !latestItem) {
    return null;
  }

  return {
    queueItem: {
      ...latestItem,
      id: state.stableItem.id,
      baseUpdatedAt: state.itemWithBase?.baseUpdatedAt,
      revision: state.highestRevision || latestItem.revision,
      createdAt: state.stableItem.createdAt,
    } satisfies SyncQueueItem,
    duplicateIds: state.orderedItems
      .slice(1)
      .map((item) => item.id)
      .filter((id): id is number => id !== undefined),
  };
}
