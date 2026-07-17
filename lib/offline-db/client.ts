import Dexie from "dexie";

import { offlineDb } from "@/lib/offline-db/db";
import {
  getQueueCoalescingState,
  planQueueRepair,
} from "@/lib/offline-db/queue-coalescing";
import type {
  ConflictRecord,
  LocalNotebook,
  LocalPage,
  SyncBootstrapPayload,
  SyncQueueItem,
  SyncPushResult,
  SyncStatus,
  SyncTombstone,
} from "@/lib/offline-db/types";
import {
  assertPrivateDataWritable,
  beginPrivateDataMutation,
} from "@/lib/private-data-epoch";

function dispatchSyncEvent(detail: Record<string, unknown>) {
  if (typeof window === "undefined") {
    return;
  }

  window.dispatchEvent(new CustomEvent("notava-sync", { detail }));
}

function metaKey(userId: string, key: string) {
  return `${userId}:${key}`;
}

export async function setLastPullAt(userId: string, value: string) {
  const finishMutation = beginPrivateDataMutation(userId);
  try {
    await offlineDb.meta.put({ key: metaKey(userId, "lastPullAt"), value });
  } finally {
    finishMutation();
  }
}

export async function getLastPullAt(userId: string) {
  return (await offlineDb.meta.get(metaKey(userId, "lastPullAt")))?.value ?? null;
}

export async function clearOfflineStateForUser(userId: string) {
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
      await offlineDb.notebooks.where("userId").equals(userId).delete();
      await offlineDb.pages.where("userId").equals(userId).delete();
      const meta = await offlineDb.meta.toArray();
      await offlineDb.queue.where("userId").equals(userId).delete();
      await offlineDb.conflicts.where("userId").equals(userId).delete();
      await Promise.all(
        meta
          .filter((item) => item.key.startsWith(`${userId}:`))
          .map((item) => offlineDb.meta.delete(item.key)),
      );
    },
  );
}

export async function seedOfflineBootstrap(
  userId: string,
  payload: SyncBootstrapPayload,
) {
  const finishMutation = beginPrivateDataMutation(userId);
  try {
    await offlineDb.transaction(
      "rw",
      offlineDb.notebooks,
      offlineDb.pages,
      offlineDb.meta,
      async () => {
        assertPrivateDataWritable(userId);
        await offlineDb.notebooks.where("userId").equals(userId).delete();
        await offlineDb.pages.where("userId").equals(userId).delete();
        await offlineDb.notebooks.bulkPut(payload.notebooks);
        await offlineDb.pages.bulkPut(payload.pages);
        if (!payload.hasMore) {
          await setLastPullAt(userId, payload.fetchedAt);
        }
      },
    );
  } finally {
    finishMutation();
  }
}

export async function hasOfflineBootstrap(userId: string) {
  const [notebookCount, pageCount] = await Promise.all([
    offlineDb.notebooks.where("userId").equals(userId).count(),
    offlineDb.pages.where("userId").equals(userId).count(),
  ]);

  return notebookCount > 0 || pageCount > 0;
}

function tombstoneRemotePayload(userId: string, tombstone: SyncTombstone) {
  return {
    id: tombstone.entityId,
    userId,
    updatedAt: tombstone.deletedAt,
    deletedAt: tombstone.deletedAt,
    isTombstone: true,
  };
}

function isRemoteTombstonePayload(
  payload: Record<string, unknown> | undefined,
) {
  return Boolean(
    payload?.isTombstone === true &&
      typeof payload.id === "string" &&
      typeof payload.userId === "string" &&
      typeof payload.updatedAt === "string" &&
      typeof payload.deletedAt === "string",
  );
}

function tombstoneConflict(
  userId: string,
  tombstone: SyncTombstone,
  localPayload: Record<string, unknown> | undefined,
): ConflictRecord {
  return {
    id: `${userId}:tombstone:${tombstone.entityType}:${tombstone.entityId}:${tombstone.deletedAt}`,
    userId,
    entityType: tombstone.entityType,
    entityId: tombstone.entityId,
    createdAt: tombstone.deletedAt,
    message: "This item was permanently deleted on another device.",
    localPayload,
    remotePayload: tombstoneRemotePayload(userId, tombstone),
  };
}

function hasLocalContentIntent(
  syncStatus: SyncStatus,
  queueItems: SyncQueueItem[],
  conflictItems: ConflictRecord[],
) {
  const hasUpsert = queueItems.some((item) => item.operation === "upsert");
  const hasOnlyArchiveOperations =
    queueItems.length > 0 &&
    queueItems.every((item) => item.operation === "archive");
  return (
    hasUpsert ||
    conflictItems.length > 0 ||
    (!hasOnlyArchiveOperations && syncStatus !== "synced")
  );
}

async function applyRemoteTombstones(
  userId: string,
  tombstones: NonNullable<SyncBootstrapPayload["tombstones"]>,
) {
  const protectedEntities = new Set<string>();
  for (const tombstone of tombstones) {
    const entityKey = [userId, tombstone.entityType, tombstone.entityId];
    const [queueItems, conflictItems] = await Promise.all([
      offlineDb.queue
        .where("[userId+entityType+entityId]")
        .equals(entityKey)
        .toArray(),
      offlineDb.conflicts
        .where("[userId+entityType+entityId]")
        .equals(entityKey)
        .toArray(),
    ]);

    if (tombstone.entityType === "page") {
      const localPage = await offlineDb.pages.get(tombstone.entityId);
      const shouldProtect = Boolean(
        localPage?.userId === userId &&
          hasLocalContentIntent(localPage.syncStatus, queueItems, conflictItems),
      );

      if (shouldProtect && localPage) {
        protectedEntities.add(`page:${localPage.id}`);
        await offlineDb.pages.update(localPage.id, { syncStatus: "conflict" });
        await Promise.all(
          queueItems.map((item) =>
            offlineDb.queue.update(item.id!, { status: "conflict" }),
          ),
        );
        await offlineDb.conflicts.bulkDelete(conflictItems.map((item) => item.id));
        const queuedLocalPayload = queueItems.find(
          (item) => item.operation === "upsert",
        )?.payload;
        await offlineDb.conflicts.put(
          tombstoneConflict(
            userId,
            tombstone,
            queuedLocalPayload ?? { ...localPage },
          ),
        );
      } else {
        if (localPage?.userId === userId) {
          await offlineDb.pages.delete(localPage.id);
        }
        await offlineDb.queue.bulkDelete(queueItems.map((item) => item.id!));
        await offlineDb.conflicts.bulkDelete(conflictItems.map((item) => item.id));
      }
    } else {
      const localNotebook = await offlineDb.notebooks.get(tombstone.entityId);
      const childPages = await offlineDb.pages
        .where("[userId+notebookId]")
        .equals([userId, tombstone.entityId])
        .toArray();
      const childPageIds = childPages.map((page) => page.id);
      const childEntityKeys = childPageIds.map((pageId) => [userId, "page", pageId]);
      const [childQueueItems, childConflictItems] = childEntityKeys.length > 0
        ? await Promise.all([
            offlineDb.queue
              .where("[userId+entityType+entityId]")
              .anyOf(childEntityKeys)
              .toArray(),
            offlineDb.conflicts
              .where("[userId+entityType+entityId]")
              .anyOf(childEntityKeys)
              .toArray(),
          ])
        : [[], []];
      const protectedChildPageIds = new Set(
        childPages
          .filter((page) => {
            const pageQueueItems = childQueueItems.filter(
              (item) => item.entityId === page.id,
            );
            const pageConflictItems = childConflictItems.filter(
              (item) => item.entityId === page.id,
            );
            return hasLocalContentIntent(
              page.syncStatus,
              pageQueueItems,
              pageConflictItems,
            );
          })
          .map((page) => page.id),
      );
      const notebookHasLocalIntent = Boolean(
        localNotebook?.userId === userId &&
          hasLocalContentIntent(
            localNotebook.syncStatus,
            queueItems,
            conflictItems,
          ),
      );
      const shouldProtectNotebook = Boolean(
        localNotebook?.userId === userId &&
          (notebookHasLocalIntent || protectedChildPageIds.size > 0),
      );

      if (shouldProtectNotebook && localNotebook) {
        protectedEntities.add(`notebook:${localNotebook.id}`);
        await offlineDb.notebooks.update(localNotebook.id, {
          syncStatus: "conflict",
        });
        await Promise.all([
          ...queueItems.map((item) =>
            offlineDb.queue.update(item.id!, { status: "conflict" }),
          ),
          ...childPages
            .filter((page) => protectedChildPageIds.has(page.id))
            .map((page) =>
              offlineDb.pages.update(page.id, { syncStatus: "conflict" }),
            ),
          ...childQueueItems
            .filter((item) => protectedChildPageIds.has(item.entityId))
            .map((item) =>
              offlineDb.queue.update(item.id!, { status: "conflict" }),
            ),
        ]);
        await offlineDb.conflicts.bulkDelete(conflictItems.map((item) => item.id));
        const queuedLocalPayload = queueItems.find(
          (item) => item.operation === "upsert",
        )?.payload;
        await offlineDb.conflicts.put(
          tombstoneConflict(
            userId,
            tombstone,
            queuedLocalPayload ?? { ...localNotebook },
          ),
        );
        await offlineDb.pages.bulkDelete(
          childPageIds.filter((pageId) => !protectedChildPageIds.has(pageId)),
        );
        await offlineDb.queue.bulkDelete(
          childQueueItems
            .filter((item) => !protectedChildPageIds.has(item.entityId))
            .map((item) => item.id!),
        );
        await offlineDb.conflicts.bulkDelete(
          childConflictItems
            .filter((item) => !protectedChildPageIds.has(item.entityId))
            .map((item) => item.id),
        );
      } else {
        if (localNotebook?.userId === userId) {
          await offlineDb.notebooks.delete(localNotebook.id);
        }
        await offlineDb.pages.bulkDelete(childPageIds);
        await offlineDb.queue.bulkDelete([
          ...queueItems.map((item) => item.id!),
          ...childQueueItems.map((item) => item.id!),
        ]);
        await offlineDb.conflicts.bulkDelete([
          ...conflictItems.map((item) => item.id),
          ...childConflictItems.map((item) => item.id),
        ]);
      }
    }

    dispatchSyncEvent({
      type: "tombstone",
      userId,
      entityType: tombstone.entityType,
      entityId: tombstone.entityId,
      pageId:
        tombstone.entityType === "page" ? tombstone.entityId : undefined,
      syncStatus: protectedEntities.has(
        `${tombstone.entityType}:${tombstone.entityId}`,
      )
        ? "conflict"
        : "synced",
    });
  }
  return protectedEntities;
}

export async function applyPullChanges(
  userId: string,
  payload: SyncBootstrapPayload,
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
      const [localNotebooks, localPages] = await Promise.all([
        offlineDb.notebooks.bulkGet(payload.notebooks.map((item) => item.id)),
        offlineDb.pages.bulkGet(payload.pages.map((item) => item.id)),
      ]);
      const canApplyRemote = (local: { syncStatus: SyncStatus } | undefined) =>
        !local || local.syncStatus === "synced";
      const notebooksToApply = payload.notebooks.filter((_, index) =>
        canApplyRemote(localNotebooks[index]),
      );
      const pagesToApply = payload.pages.filter((_, index) =>
        canApplyRemote(localPages[index]),
      );

      if (notebooksToApply.length > 0) {
        await offlineDb.notebooks.bulkPut(notebooksToApply);
      }

      if (pagesToApply.length > 0) {
        await offlineDb.pages.bulkPut(pagesToApply);
      }

      await applyRemoteTombstones(userId, payload.tombstones ?? []);

      if (!payload.hasMore) {
        await setLastPullAt(userId, payload.fetchedAt);
      }
      },
    );
  } finally {
    finishMutation();
  }
}

export async function upsertLocalPage(page: LocalPage) {
  const finishMutation = beginPrivateDataMutation(page.userId);
  try {
    await offlineDb.pages.put(page);
    dispatchSyncEvent({
      type: "page",
      userId: page.userId,
      pageId: page.id,
      syncStatus: page.syncStatus,
    });
  } finally {
    finishMutation();
  }
}

export async function getLocalPage(userId: string, pageId: string) {
  const page = await offlineDb.pages.get(pageId);
  return page?.userId === userId ? page : undefined;
}

export async function getLocalNotebooks(userId: string) {
  const notebooks = await offlineDb.notebooks.where("userId").equals(userId).toArray();
  const pages = await offlineDb.pages.where("userId").equals(userId).toArray();

  return notebooks
    .filter((notebook) => !notebook.archived)
    .map((notebook) => ({
      ...notebook,
      pages: pages
        .filter((page) => page.notebookId === notebook.id && !page.archived)
        .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt)),
    }))
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

export async function updateLocalSyncStatus(
  userId: string,
  pageId: string,
  syncStatus: SyncStatus,
  lastSyncedAt?: string | null,
) {
  const finishMutation = beginPrivateDataMutation(userId);
  try {
    const page = await getLocalPage(userId, pageId);

    if (!page) {
      return;
    }

    assertPrivateDataWritable(userId);
    await offlineDb.pages.update(pageId, {
      syncStatus,
      lastSyncedAt: lastSyncedAt ?? page.lastSyncedAt ?? null,
    });
    dispatchSyncEvent({ type: "page", userId, pageId, syncStatus, lastSyncedAt });
  } finally {
    finishMutation();
  }
}

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

export async function fetchBootstrap(
  cursor?: string | null,
  signal?: AbortSignal,
) {
  const response = await fetch(
    `/api/sync/bootstrap${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`,
    {
      credentials: "same-origin",
      cache: "no-store",
      signal,
    },
  );

  if (!response.ok) {
    throw new Error("BOOTSTRAP_FAILED");
  }

  return (await response.json()) as SyncBootstrapPayload;
}

export async function fetchPullChanges(
  userId: string,
  cursor?: string | null,
  signal?: AbortSignal,
) {
  const since = cursor ? null : await getLastPullAt(userId);
  const query = cursor
    ? `?cursor=${encodeURIComponent(cursor)}`
    : since
      ? `?since=${encodeURIComponent(since)}`
      : "";
  const response = await fetch(
    `/api/sync/pull${query}`,
    {
      credentials: "same-origin",
      cache: "no-store",
      signal,
    },
  );

  if (!response.ok) {
    throw new Error("PULL_FAILED");
  }

  return (await response.json()) as SyncBootstrapPayload;
}

export async function pushQueue(items: SyncQueueItem[], signal?: AbortSignal) {
  const response = await fetch("/api/sync/push", {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ operations: items }),
    signal,
  });

  if (!response.ok) {
    let detail = "";

    try {
      const payload = (await response.json()) as {
        error?: string;
        issues?: Array<{ path?: string; message?: string }>;
      };
      const issueText = payload.issues
        ?.map((issue) => [issue.path, issue.message].filter(Boolean).join(": "))
        .filter(Boolean)
        .join("; ");

      detail = [payload.error, issueText].filter(Boolean).join(" - ");
    } catch {
      detail = await response.text().catch(() => "");
    }

    throw new Error(
      ["PUSH_FAILED", response.status, detail].filter(Boolean).join(" "),
    );
  }

  return (await response.json()) as SyncPushResult;
}

export async function upsertConflictRecords(userId: string, conflicts: ConflictRecord[]) {
  const finishMutation = beginPrivateDataMutation(userId);
  try {
    if (conflicts.length === 0) {
      return;
    }

    await offlineDb.conflicts.bulkPut(
      conflicts.map((conflict) => ({
        ...conflict,
        userId,
        id: `${userId}:${conflict.id}`,
      })),
    );
  } finally {
    finishMutation();
  }
}

export async function listConflictRecords(userId: string) {
  const conflicts = await offlineDb.conflicts
    .where("userId")
    .equals(userId)
    .sortBy("createdAt");
  return conflicts.reverse();
}

function isRemotePagePayload(
  payload: Record<string, unknown> | undefined,
): payload is LocalPage {
  return Boolean(
    payload &&
      typeof payload.id === "string" &&
      typeof payload.userId === "string" &&
      typeof payload.notebookId === "string" &&
      typeof payload.title === "string" &&
      typeof payload.bodyHtml === "string" &&
      typeof payload.bodyText === "string" &&
      typeof payload.updatedAt === "string",
  );
}

function isRemoteNotebookPayload(
  payload: Record<string, unknown> | undefined,
): payload is LocalNotebook {
  return Boolean(
    payload &&
      typeof payload.id === "string" &&
      typeof payload.userId === "string" &&
      typeof payload.groupId === "string" &&
      typeof payload.name === "string" &&
      typeof payload.updatedAt === "string",
  );
}

async function deleteEntityConflictState(conflict: ConflictRecord) {
  const [conflicts, queue] = await Promise.all([
    offlineDb.conflicts
      .where("[userId+entityType+entityId]")
      .equals([conflict.userId, conflict.entityType, conflict.entityId])
      .toArray(),
    offlineDb.queue
      .where("[userId+entityType+entityId]")
      .equals([conflict.userId, conflict.entityType, conflict.entityId])
      .toArray(),
  ]);

  await Promise.all([
    ...conflicts.map((item) => offlineDb.conflicts.delete(item.id)),
    ...queue.map((item) => offlineDb.queue.delete(item.id!)),
  ]);
}

export async function resolveConflictWithRemote(userId: string, conflictId: string) {
  const finishMutation = beginPrivateDataMutation(userId);
  try {
    const conflict = await offlineDb.conflicts.get(conflictId);
    if (!conflict || conflict.userId !== userId) {
      throw new Error("CONFLICT_NOT_FOUND");
    }

    assertPrivateDataWritable(userId);
    await offlineDb.transaction(
    "rw",
    offlineDb.notebooks,
    offlineDb.pages,
    offlineDb.queue,
    offlineDb.conflicts,
    async () => {
      assertPrivateDataWritable(userId);
      if (isRemoteTombstonePayload(conflict.remotePayload)) {
        if (conflict.entityType === "page") {
          const localPage = await offlineDb.pages.get(conflict.entityId);
          if (localPage?.userId === userId) {
            await offlineDb.pages.delete(conflict.entityId);
          }
        } else {
          const localNotebook = await offlineDb.notebooks.get(conflict.entityId);
          const childPages = await offlineDb.pages
            .where("[userId+notebookId]")
            .equals([userId, conflict.entityId])
            .toArray();
          const childEntityKeys = childPages.map((page) => [
            userId,
            "page",
            page.id,
          ]);
          if (childEntityKeys.length > 0) {
            const [childQueue, childConflicts] = await Promise.all([
              offlineDb.queue
                .where("[userId+entityType+entityId]")
                .anyOf(childEntityKeys)
                .toArray(),
              offlineDb.conflicts
                .where("[userId+entityType+entityId]")
                .anyOf(childEntityKeys)
                .toArray(),
            ]);
            await offlineDb.pages.bulkDelete(childPages.map((page) => page.id));
            await offlineDb.queue.bulkDelete(childQueue.map((item) => item.id!));
            await offlineDb.conflicts.bulkDelete(
              childConflicts.map((item) => item.id),
            );
          }
          if (localNotebook?.userId === userId) {
            await offlineDb.notebooks.delete(conflict.entityId);
          }
        }
      } else if (conflict.entityType === "page") {
        if (!isRemotePagePayload(conflict.remotePayload)) {
          throw new Error("INVALID_REMOTE_CONFLICT_PAYLOAD");
        }
        await offlineDb.pages.put({
          ...conflict.remotePayload,
          syncStatus: "synced",
          lastSyncedAt: conflict.remotePayload.updatedAt,
        });
      } else {
        if (!isRemoteNotebookPayload(conflict.remotePayload)) {
          throw new Error("INVALID_REMOTE_CONFLICT_PAYLOAD");
        }
        await offlineDb.notebooks.put({
          ...conflict.remotePayload,
          syncStatus: "synced",
          lastSyncedAt: conflict.remotePayload.updatedAt,
        });
      }

      await deleteEntityConflictState(conflict);
    },
  );

    dispatchSyncEvent({
      type: "conflict-resolved",
      userId,
      pageId: conflict.entityType === "page" ? conflict.entityId : undefined,
      entityType: conflict.entityType,
      entityId: conflict.entityId,
      syncStatus: "synced",
    });
  } finally {
    finishMutation();
  }
}

export async function resolveConflictWithLocal(userId: string, conflictId: string) {
  const finishMutation = beginPrivateDataMutation(userId);
  try {
    const conflict = await offlineDb.conflicts.get(conflictId);
    if (!conflict || conflict.userId !== userId) {
      throw new Error("CONFLICT_NOT_FOUND");
    }

    assertPrivateDataWritable(userId);

  const remoteUpdatedAt =
    typeof conflict.remotePayload?.updatedAt === "string"
      ? conflict.remotePayload.updatedAt
      : null;
  if (!remoteUpdatedAt) {
    throw new Error("INVALID_REMOTE_CONFLICT_PAYLOAD");
  }

  await offlineDb.transaction(
    "rw",
    offlineDb.notebooks,
    offlineDb.pages,
    offlineDb.queue,
    offlineDb.conflicts,
    async () => {
      assertPrivateDataWritable(userId);
      const local =
        conflict.entityType === "page"
          ? await offlineDb.pages.get(conflict.entityId)
          : await offlineDb.notebooks.get(conflict.entityId);
      if (!local || local.userId !== userId) {
        throw new Error("LOCAL_CONFLICT_ENTITY_NOT_FOUND");
      }

      await deleteEntityConflictState(conflict);
      const createdAt = new Date().toISOString();
      if (conflict.entityType === "page") {
        const page = { ...(local as LocalPage), syncStatus: "pending" as const };
        await offlineDb.pages.put(page);
        await offlineDb.queue.add({
          userId,
          entityType: "page",
          entityId: page.id,
          operation: "upsert",
          payload: page,
          baseUpdatedAt: remoteUpdatedAt,
          revision: 1,
          createdAt,
          status: "pending",
        });
      } else {
        const notebook = {
          ...(local as LocalNotebook),
          syncStatus: "pending" as const,
        };
        await offlineDb.notebooks.put(notebook);
        await offlineDb.queue.add({
          userId,
          entityType: "notebook",
          entityId: notebook.id,
          operation: "upsert",
          payload: notebook,
          baseUpdatedAt: remoteUpdatedAt,
          revision: 1,
          createdAt,
          status: "pending",
        });

        if (isRemoteTombstonePayload(conflict.remotePayload)) {
          const childPages = await offlineDb.pages
            .where("[userId+notebookId]")
            .equals([userId, notebook.id])
            .toArray();
          const childEntityKeys = childPages.map((page) => [
            userId,
            "page",
            page.id,
          ]);
          if (childEntityKeys.length > 0) {
            const [childQueueItems, childConflictItems] = await Promise.all([
              offlineDb.queue
                .where("[userId+entityType+entityId]")
                .anyOf(childEntityKeys)
                .toArray(),
              offlineDb.conflicts
                .where("[userId+entityType+entityId]")
                .anyOf(childEntityKeys)
                .toArray(),
            ]);
            const childPageIdsWithConflict = new Set(
              childConflictItems.map((item) => item.entityId),
            );
            const recoverableQueueItems = childQueueItems.filter(
              (item) => !childPageIdsWithConflict.has(item.entityId),
            );
            await Promise.all([
              ...recoverableQueueItems.map((item) =>
                offlineDb.queue.update(item.id!, {
                  createdAt,
                  status: "pending",
                }),
              ),
              ...recoverableQueueItems.map((item) =>
                offlineDb.pages.update(item.entityId, {
                  syncStatus: "pending",
                }),
              ),
            ]);
          }
        }
      }
    },
  );

    dispatchSyncEvent({
      type: "conflict-resolved",
      userId,
      pageId: conflict.entityType === "page" ? conflict.entityId : undefined,
      entityType: conflict.entityType,
      entityId: conflict.entityId,
      syncStatus: "pending",
    });
  } finally {
    finishMutation();
  }
}
