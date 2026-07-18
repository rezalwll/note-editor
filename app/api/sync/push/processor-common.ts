import type { SyncTombstone } from "@/lib/offline-db/types";
import { prisma } from "@/lib/prisma";

import type { PushProcessingContext } from "./processor-types";
import type { SyncQueueItem } from "./validation";

export function appliedOperation(item: SyncQueueItem) {
  return {
    queueId: item.id,
    entityType: item.entityType,
    entityId: item.entityId,
    operation: item.operation,
  };
}

function tombstoneRemotePayload(
  context: PushProcessingContext,
  item: SyncQueueItem,
  tombstone: SyncTombstone,
) {
  return {
    id: item.entityId,
    userId: context.userId,
    updatedAt: tombstone.deletedAt,
    deletedAt: tombstone.deletedAt,
    isTombstone: true,
  };
}

export function recordTombstoneConflict(
  context: PushProcessingContext,
  item: SyncQueueItem,
  tombstone: SyncTombstone,
  localPayload: Record<string, unknown>,
) {
  context.conflicts.push({
    id: `${item.entityType}:${item.entityId}:tombstone:${tombstone.deletedAt}`,
    userId: context.userId,
    entityType: item.entityType,
    entityId: item.entityId,
    createdAt: new Date().toISOString(),
    message: "Remote data was permanently deleted after this edit started.",
    localPayload,
    remotePayload: tombstoneRemotePayload(context, item, tombstone),
  });
}

export function canResurrectTombstone(item: SyncQueueItem, tombstone: SyncTombstone) {
  return item.baseUpdatedAt === tombstone.deletedAt;
}

export type GuardedUpsertResult<T> =
  | { status: "applied"; entity: T }
  | { status: "conflict"; entity: T }
  | { status: "forbidden" }
  | { status: "invalid-parent" }
  | { status: "needs-fallback" }
  | { status: "retry"; notebookId?: string }
  | { status: "tombstone"; tombstone: SyncTombstone };

export type GuardedArchiveState<T> =
  | { status: "current"; entity: T }
  | { status: "missing" }
  | { status: "forbidden" }
  | { status: "retry"; notebookId: string }
  | { status: "tombstone"; tombstone: SyncTombstone };

export function toSyncTombstone(
  row: { id: string; entityId: string; deletedAt: Date },
  entityType: SyncTombstone["entityType"],
): SyncTombstone {
  return {
    id: row.id,
    entityType,
    entityId: row.entityId,
    deletedAt: row.deletedAt.toISOString(),
  };
}

export async function findCurrentTombstone(
  userId: string,
  entityType: "notebook" | "page",
  entityId: string,
) {
  const row = await prisma.entityTombstone.findUnique({
    where: {
      userId_entityType_entityId: { userId, entityType, entityId },
    },
  });
  return row ? toSyncTombstone(row, entityType) : null;
}

export function isConditionalWriteMiss(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "P2025"
  );
}
