import Dexie, { type Table } from "dexie";

import type {
  ConflictRecord,
  LocalNotebook,
  LocalPage,
  SyncQueueItem,
} from "@/lib/offline-db/types";

class NotavaOfflineDb extends Dexie {
  notebooks!: Table<LocalNotebook, string>;
  pages!: Table<LocalPage, string>;
  queue!: Table<SyncQueueItem, number>;
  conflicts!: Table<ConflictRecord, string>;
  meta!: Table<{ key: string; value: string }, string>;

  constructor() {
    super("notava-offline");

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
  }
}

export const offlineDb = new NotavaOfflineDb();
