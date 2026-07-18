import Dexie from "dexie";

import { offlineDb } from "@/lib/offline-db/db";
import {
  getQueueCoalescingState,
  planQueueRepair,
} from "@/lib/offline-db/queue-coalescing";
import { dispatchSyncEvent } from "@/lib/offline-db/sync-events";
import { metaKey } from "@/lib/offline-db/state";
import { applyRemoteTombstones } from "@/lib/offline-db/tombstones";
import type {
  LocalNotebook,
  LocalPage,
  SyncPushResult,
  SyncQueueItem,
} from "@/lib/offline-db/types";
import {
  assertPrivateDataWritable,
  beginPrivateDataMutation,
} from "@/lib/private-data-epoch";

async function coalesceQueueItem(
  nextItem: Omit<SyncQueueItem, "createdAt" | "revision" | "status">,
) {
  const existingItems = await offlineDb.queue
    .where("[userId+entityType+entityId]")
    .equals([nextItem.userId, nextItem.entityType, nextItem.entityId])
    .toArray();
  const state = getQueueCoalescingState(existingItems);
  const queueItem = {
    ...nextItem,
    baseUpdatedAt: state.itemWithBase
      ? state.itemWithBase.baseUpdatedAt
      : nextItem.baseUpdatedAt,
    revision: state.highestRevision + 1,
    createdAt: state.stableItem?.createdAt ?? new Date().toISOString(),
    status: "pending",
  } satisfies SyncQueueItem;

  if (state.stableItem?.id !== undefined) {
    await offlineDb.queue.put({ ...queueItem, id: state.stableItem.id });
    await offlineDb.queue.bulkDelete(
      state.orderedItems
        .slice(1)
        .map((item) => item.id)
        .filter((id): id is number => id !== undefined),
    );
    return;
  }

  await offlineDb.queue.add(queueItem);
}

async function repairDuplicateQueueItems(userId: string) {
  const repairKey = metaKey(userId, "queueCoalescedV4");
  if (await offlineDb.meta.get(repairKey)) {
    return;
  }

  await offlineDb.transaction("rw", [offlineDb.queue, offlineDb.meta], async () => {
    if (await offlineDb.meta.get(repairKey)) {
      return;
    }

    const queueItems = await offlineDb.queue.where("userId").equals(userId).toArray();
    const itemsByEntity = new Map<string, SyncQueueItem[]>();
    for (const item of queueItems) {
      const key = `${item.entityType}:${item.entityId}`;
      const matchingItems = itemsByEntity.get(key) ?? [];
      matchingItems.push(item);
      itemsByEntity.set(key, matchingItems);
    }

    for (const matchingItems of itemsByEntity.values()) {
      const repair = planQueueRepair(matchingItems);
      if (!repair) {
        continue;
      }

      await offlineDb.queue.put(repair.queueItem);
      await offlineDb.queue.bulkDelete(repair.duplicateIds);
    }

    await offlineDb.meta.put({ key: repairKey, value: "4" });
  });
}

export async function enqueuePageUpsert(page: LocalPage, baseUpdatedAt?: string | null) {
  const finishMutation = beginPrivateDataMutation(page.userId);
  try {
    const pendingPage: LocalPage = {
      ...page,
      lastSyncedAt: page.lastSyncedAt ?? null,
      syncStatus: "pending",
    };

    await offlineDb.transaction("rw", [offlineDb.pages, offlineDb.queue], async () => {
      const storedPage = await offlineDb.pages.get(page.id);
      assertPrivateDataWritable(page.userId);
      await offlineDb.pages.put(pendingPage);
      await coalesceQueueItem({
        userId: page.userId,
        entityType: "page",
        entityId: page.id,
        operation: "upsert",
        payload: pendingPage,
        baseUpdatedAt: storedPage?.lastSyncedAt ?? baseUpdatedAt,
      });
    });

    dispatchSyncEvent({
      type: "page",
      userId: page.userId,
      pageId: page.id,
      syncStatus: "pending",
    });
  } finally {
    finishMutation();
  }
}

export async function enqueueNotebookUpsert(
  notebook: LocalNotebook,
  baseUpdatedAt?: string | null,
) {
  const finishMutation = beginPrivateDataMutation(notebook.userId);
  try {
    const pendingNotebook: LocalNotebook = {
      ...notebook,
      lastSyncedAt: notebook.lastSyncedAt ?? null,
      syncStatus: "pending",
    };

    await offlineDb.transaction(
      "rw",
      [offlineDb.notebooks, offlineDb.queue],
      async () => {
        const storedNotebook = await offlineDb.notebooks.get(notebook.id);
        assertPrivateDataWritable(notebook.userId);
        await offlineDb.notebooks.put(pendingNotebook);
        await coalesceQueueItem({
          userId: notebook.userId,
          entityType: "notebook",
          entityId: notebook.id,
          operation: "upsert",
          payload: pendingNotebook,
          baseUpdatedAt: storedNotebook?.lastSyncedAt ?? baseUpdatedAt,
        });
      },
    );
  } finally {
    finishMutation();
  }
}

export async function enqueuePageArchive(page: LocalPage, baseUpdatedAt?: string | null) {
  const finishMutation = beginPrivateDataMutation(page.userId);
  try {
    const pendingPage: LocalPage = {
      ...page,
      lastSyncedAt: page.lastSyncedAt ?? null,
      syncStatus: "pending",
    };

    await offlineDb.transaction("rw", [offlineDb.pages, offlineDb.queue], async () => {
      const storedPage = await offlineDb.pages.get(page.id);
      assertPrivateDataWritable(page.userId);
      await offlineDb.pages.put(pendingPage);
      await coalesceQueueItem({
        userId: page.userId,
        entityType: "page",
        entityId: page.id,
        operation: "archive",
        payload: pendingPage,
        baseUpdatedAt: storedPage?.lastSyncedAt ?? baseUpdatedAt,
      });
    });

    dispatchSyncEvent({
      type: "page",
      userId: page.userId,
      pageId: page.id,
      syncStatus: "pending",
    });
  } finally {
    finishMutation();
  }
}

export async function enqueueNotebookArchive(
  notebook: LocalNotebook,
  baseUpdatedAt?: string | null,
) {
  const finishMutation = beginPrivateDataMutation(notebook.userId);
  try {
    const pendingNotebook: LocalNotebook = {
      ...notebook,
      lastSyncedAt: notebook.lastSyncedAt ?? null,
      syncStatus: "pending",
    };

    await offlineDb.transaction(
      "rw",
      [offlineDb.notebooks, offlineDb.queue],
      async () => {
        const storedNotebook = await offlineDb.notebooks.get(notebook.id);
        assertPrivateDataWritable(notebook.userId);
        await offlineDb.notebooks.put(pendingNotebook);
        await coalesceQueueItem({
          userId: notebook.userId,
          entityType: "notebook",
          entityId: notebook.id,
          operation: "archive",
          payload: pendingNotebook,
          baseUpdatedAt: storedNotebook?.lastSyncedAt ?? baseUpdatedAt,
        });
      },
    );
  } finally {
    finishMutation();
  }
}

export async function listPendingQueue(userId: string, limit = 50) {
  await repairDuplicateQueueItems(userId);
  const queue = (
    await Promise.all(
      (["pending", "failed"] as const).map((status) =>
        offlineDb.queue
          .where("[userId+status+createdAt]")
          .between(
            [userId, status, Dexie.minKey],
            [userId, status, Dexie.maxKey],
          )
          .limit(limit)
          .toArray(),
      ),
    )
  ).flat();
  return queue
    .sort((left, right) => {
      const createdAtOrder = left.createdAt.localeCompare(right.createdAt);
      if (createdAtOrder !== 0) {
        return createdAtOrder;
      }
      return left.entityType === right.entityType
        ? 0
        : left.entityType === "notebook"
          ? -1
          : 1;
    })
    .slice(0, limit);
}

function queueEntityKey(item: Pick<SyncQueueItem, "entityType" | "entityId">) {
  return `${item.entityType}:${item.entityId}`;
}

function isSameQueueRevision(current: SyncQueueItem | undefined, submitted: SyncQueueItem) {
  return Boolean(
    current &&
      current.id === submitted.id &&
      (current.revision ?? 0) === (submitted.revision ?? 0),
  );
}

export async function applySyncPushResult(
  userId: string,
  result: SyncPushResult,
  submittedQueue: SyncQueueItem[] = [],
) {
  const finishMutation = beginPrivateDataMutation(userId);
  try {
    await offlineDb.transaction(
      "rw",
      [
        offlineDb.notebooks,
        offlineDb.pages,
        offlineDb.queue,
        offlineDb.conflicts,
        offlineDb.meta,
      ],
      async () => {
        assertPrivateDataWritable(userId);
      const submittedByEntity = new Map(
        submittedQueue.map((item) => [queueEntityKey(item), item]),
      );
      const currentQueue = await offlineDb.queue.where("userId").equals(userId).toArray();
      const currentByEntity = new Map(
        currentQueue.map((item) => [queueEntityKey(item), item]),
      );
      const supersededEntities = new Set(
        submittedQueue
          .filter((submitted) =>
            !isSameQueueRevision(
              currentByEntity.get(queueEntityKey(submitted)),
              submitted,
            ),
          )
          .map(queueEntityKey),
      );
      const conflictedNotebookIds = new Set(
        result.conflicts
          .filter((item) => item.entityType === "notebook")
          .map((item) => item.entityId),
      );
      const conflictedPageIds = new Set(
        result.conflicts
          .filter((item) => item.entityType === "page")
          .map((item) => item.entityId),
      );
      const notebooksToApply = result.notebooks.filter(
        (item) =>
          !conflictedNotebookIds.has(item.id) &&
          !supersededEntities.has(`notebook:${item.id}`),
      );
      const pagesToApply = result.pages.filter(
        (item) =>
          !conflictedPageIds.has(item.id) &&
          !supersededEntities.has(`page:${item.id}`),
      );

      if (notebooksToApply.length > 0) {
        await offlineDb.notebooks.bulkPut(notebooksToApply);
      }

      if (pagesToApply.length > 0) {
        await offlineDb.pages.bulkPut(pagesToApply);
      }

      const tombstoneConflicts = await applyRemoteTombstones(
        userId,
        result.tombstones ?? [],
      );

      for (const applied of result.applied) {
        const entityKey = `${applied.entityType}:${applied.entityId}`;
        if (tombstoneConflicts.has(entityKey)) {
          continue;
        }
        const submitted = submittedByEntity.get(entityKey);
        const current = currentByEntity.get(entityKey);
        if (!submitted || !supersededEntities.has(entityKey)) {
          if (applied.queueId !== undefined) {
            await offlineDb.queue.delete(applied.queueId);
          }
          continue;
        }

        if (current?.id === undefined) {
          continue;
        }

        const remote =
          applied.entityType === "page"
            ? result.pages.find((item) => item.id === applied.entityId)
            : result.notebooks.find((item) => item.id === applied.entityId);
        await offlineDb.queue.update(current.id, {
          baseUpdatedAt: remote?.updatedAt ?? current.baseUpdatedAt,
          status: "pending",
        });
        if (remote) {
          const table =
            applied.entityType === "page" ? offlineDb.pages : offlineDb.notebooks;
          await table.update(applied.entityId, {
            lastSyncedAt: remote.updatedAt,
            syncStatus: "pending",
          });
        }
      }

      for (const conflict of result.conflicts) {
        const entityKey = `${conflict.entityType}:${conflict.entityId}`;
        const current = currentByEntity.get(entityKey);
        const effectiveConflict = supersededEntities.has(entityKey) && current
          ? { ...conflict, localPayload: current.payload }
          : conflict;
        if (conflict.entityType === "page") {
          await offlineDb.pages.update(conflict.entityId, { syncStatus: "conflict" });
        } else {
          await offlineDb.notebooks.update(conflict.entityId, { syncStatus: "conflict" });
        }

        await offlineDb.conflicts.put({
          ...effectiveConflict,
          userId,
          id: `${userId}:${conflict.id}`,
        });
        dispatchSyncEvent({
          type: "page",
          userId,
          pageId: conflict.entityId,
          syncStatus: "conflict",
          conflict: effectiveConflict,
        });

        const queuedItems = current
          ? [current]
          : await offlineDb.queue
              .where("[userId+entityType+entityId]")
              .equals([userId, conflict.entityType, conflict.entityId])
              .toArray();
        await Promise.all(
          queuedItems.map((item) =>
            offlineDb.queue.update(item.id!, { status: "conflict" }),
          ),
        );
      }
      },
    );
  } finally {
    finishMutation();
  }
}
