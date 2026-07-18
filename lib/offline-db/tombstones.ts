import { offlineDb } from "@/lib/offline-db/db";
import { dispatchSyncEvent } from "@/lib/offline-db/sync-events";
import type {
  ConflictRecord,
  SyncBootstrapPayload,
  SyncQueueItem,
  SyncStatus,
  SyncTombstone,
} from "@/lib/offline-db/types";

function tombstoneRemotePayload(userId: string, tombstone: SyncTombstone) {
  return {
    id: tombstone.entityId,
    userId,
    updatedAt: tombstone.deletedAt,
    deletedAt: tombstone.deletedAt,
    isTombstone: true,
  };
}

export function isRemoteTombstonePayload(
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

export async function applyRemoteTombstones(
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
