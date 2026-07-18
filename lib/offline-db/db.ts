import Dexie, { type Table } from "dexie";

import type {
  ConflictRecord,
  LocalNotebook,
  LocalPage,
  SyncQueueItem,
} from "@/lib/offline-db/types";
import { planQueueRepair } from "@/lib/offline-db/queue-coalescing";

export class NotavaOfflineDb extends Dexie {
  notebooks!: Table<LocalNotebook, string>;
  pages!: Table<LocalPage, string>;
  queue!: Table<SyncQueueItem, number>;
  conflicts!: Table<ConflictRecord, string>;
  meta!: Table<{ key: string; value: string }, string>;

  constructor(name = "notava-offline") {
    super(name);

    this.version(2).stores({
      notebooks: "id, userId, [userId+updatedAt], syncStatus, lastSyncedAt, deletedAt",
      pages: "id, userId, notebookId, [userId+notebookId], [userId+updatedAt], syncStatus, lastSyncedAt, deletedAt",
      queue: "++id, entityType, entityId, createdAt, status",
      conflicts: "id, entityType, entityId, createdAt",
      meta: "key",
    });

    this.version(3)
      .stores({
        notebooks: "id, userId, [userId+updatedAt], syncStatus, lastSyncedAt, deletedAt",
        pages: "id, userId, notebookId, [userId+notebookId], [userId+updatedAt], syncStatus, lastSyncedAt, deletedAt",
        queue: "++id, userId, [userId+status], [userId+status+createdAt], [userId+entityType+entityId], createdAt, status",
        conflicts: "id, userId, [userId+createdAt], [userId+entityType+entityId], createdAt",
        meta: "key",
      })
      .upgrade(async (transaction) => {
        await transaction.table("queue").toCollection().modify((item) => {
          item.userId = item.userId ?? item.payload?.userId;
        });
        await transaction.table("conflicts").toCollection().modify((item) => {
          item.userId = item.userId ?? String(item.id).split(":", 1)[0];
        });
      });

    this.version(4)
      .stores({
        notebooks: "id, userId, [userId+updatedAt], syncStatus, lastSyncedAt, deletedAt",
        pages: "id, userId, notebookId, [userId+notebookId], [userId+updatedAt], syncStatus, lastSyncedAt, deletedAt",
        queue: "++id, userId, [userId+status], [userId+status+createdAt], [userId+entityType+entityId], createdAt, status",
        conflicts: "id, userId, [userId+createdAt], [userId+entityType+entityId], createdAt",
        meta: "key",
      })
      .upgrade(async (transaction) => {
        const queue = transaction.table<SyncQueueItem, number>("queue");
        const meta = transaction.table<{ key: string; value: string }, string>(
          "meta",
        );
        const queueItems = await queue.toArray();
        const itemsByEntity = new Map<string, SyncQueueItem[]>();
        for (const item of queueItems) {
          const key = JSON.stringify([
            item.userId,
            item.entityType,
            item.entityId,
          ]);
          const matchingItems = itemsByEntity.get(key) ?? [];
          matchingItems.push(item);
          itemsByEntity.set(key, matchingItems);
        }

        for (const matchingItems of itemsByEntity.values()) {
          const repair = planQueueRepair(matchingItems);
          if (!repair) {
            continue;
          }

          await queue.put(repair.queueItem);
          await queue.bulkDelete(repair.duplicateIds);
        }

        await meta.bulkPut(
          [...new Set(queueItems.map((item) => item.userId))]
            .filter((userId): userId is string => typeof userId === "string")
            .map((userId) => ({
              key: `${userId}:queueCoalescedV4`,
              value: "4",
            })),
        );
      });

    this.version(5)
      .stores({
        notebooks: "id, userId, [userId+updatedAt], syncStatus, lastSyncedAt, deletedAt",
        pages: "id, userId, notebookId, [userId+notebookId], [userId+updatedAt], syncStatus, lastSyncedAt, deletedAt",
        queue: "++id, userId, [userId+status], [userId+status+createdAt], [userId+entityType+entityId], createdAt, status",
        conflicts: "id, userId, [userId+createdAt], [userId+entityType+entityId], createdAt",
        meta: "key",
      })
      .upgrade(async (transaction) => {
        const conflicts = transaction.table<ConflictRecord, string>("conflicts");
        const queue = transaction.table<SyncQueueItem, number>("queue");
        const pages = transaction.table<LocalPage, string>("pages");
        const notebooks = transaction.table<LocalNotebook, string>("notebooks");
        const obsoleteConflicts = await conflicts.toArray();
        if (obsoleteConflicts.length === 0) {
          return;
        }

        const obsoleteEntityKeys = new Set(
          obsoleteConflicts.map((conflict) =>
            JSON.stringify([
              conflict.userId,
              conflict.entityType,
              conflict.entityId,
            ]),
          ),
        );
        const queueItems = await queue.toArray();
        const blockedQueueIds = queueItems
          .filter(
            (item) =>
              item.status === "conflict" &&
              obsoleteEntityKeys.has(
                JSON.stringify([item.userId, item.entityType, item.entityId]),
              ),
          )
          .map((item) => item.id)
          .filter((id): id is number => typeof id === "number");
        const remainingStatus = new Map<string, "pending" | "failed">();
        for (const item of queueItems) {
          const key = JSON.stringify([
            item.userId,
            item.entityType,
            item.entityId,
          ]);
          if (
            item.status === "conflict" ||
            !obsoleteEntityKeys.has(key)
          ) {
            continue;
          }
          if (item.status === "pending" || !remainingStatus.has(key)) {
            remainingStatus.set(key, item.status);
          }
        }

        await conflicts.clear();
        await queue.bulkDelete(blockedQueueIds);
        await pages.toCollection().modify((page) => {
          const key = JSON.stringify([page.userId, "page", page.id]);
          if (page.syncStatus === "conflict" && obsoleteEntityKeys.has(key)) {
            page.syncStatus = remainingStatus.get(key) ?? "synced";
          }
        });
        await notebooks.toCollection().modify((notebook) => {
          const key = JSON.stringify([
            notebook.userId,
            "notebook",
            notebook.id,
          ]);
          if (
            notebook.syncStatus === "conflict" &&
            obsoleteEntityKeys.has(key)
          ) {
            notebook.syncStatus = remainingStatus.get(key) ?? "synced";
          }
        });
      });
  }
}

export const offlineDb = new NotavaOfflineDb();
