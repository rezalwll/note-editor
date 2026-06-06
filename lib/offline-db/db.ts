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

    this.version(1).stores({
      notebooks: "id, updatedAt, syncStatus, lastSyncedAt, deletedAt",
      pages: "id, notebookId, updatedAt, syncStatus, lastSyncedAt, deletedAt",
      queue: "++id, entityType, entityId, createdAt, status",
      conflicts: "id, entityType, entityId, createdAt",
      meta: "key",
    });
  }
}

export const offlineDb = new NotavaOfflineDb();
