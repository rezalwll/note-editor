export type SyncStatus = "synced" | "pending" | "failed" | "conflict";

export type LocalNotebook = {
  id: string;
  userId: string;
  groupId: string;
  name: string;
  description?: string | null;
  archived: boolean;
  updatedAt: string;
  lastSyncedAt?: string | null;
  deletedAt?: string | null;
  syncStatus: SyncStatus;
};

export type LocalPage = {
  id: string;
  userId: string;
  notebookId: string;
  title: string;
  bodyHtml: string;
  bodyText: string;
  archived: boolean;
  updatedAt: string;
  lastSyncedAt?: string | null;
  deletedAt?: string | null;
  syncStatus: SyncStatus;
};

export type QueueEntityType = "notebook" | "page";
export type QueueOperationType = "upsert" | "archive";

export type SyncQueueItem = {
  id?: number;
  userId: string;
  entityType: QueueEntityType;
  entityId: string;
  operation: QueueOperationType;
  payload: Record<string, unknown>;
  baseUpdatedAt?: string | null;
  revision?: number;
  createdAt: string;
  status: Extract<SyncStatus, "pending" | "failed" | "conflict">;
};

export type ConflictRecord = {
  id: string;
  userId: string;
  entityType: QueueEntityType;
  entityId: string;
  createdAt: string;
  message: string;
  localPayload?: Record<string, unknown>;
  remotePayload?: Record<string, unknown>;
};

export type SyncTombstone = {
  id: string;
  entityType: QueueEntityType;
  entityId: string;
  deletedAt: string;
};

export type SyncBootstrapPayload = {
  fetchedAt: string;
  notebooks: LocalNotebook[];
  pages: LocalPage[];
  tombstones?: SyncTombstone[];
  hasMore?: boolean;
  nextCursor?: string | null;
};

export type SyncPushResult = {
  applied: Array<{
    queueId?: number;
    entityType: QueueEntityType;
    entityId: string;
    operation: QueueOperationType;
  }>;
  conflicts: ConflictRecord[];
  notebooks: LocalNotebook[];
  pages: LocalPage[];
  tombstones?: SyncTombstone[];
  pulledAt: string;
};
