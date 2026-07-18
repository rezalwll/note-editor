import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { acquireSyncEntityLocks } from "@/lib/sync/entity-lock";

import {
  canResurrectTombstone,
  type GuardedArchiveState,
  type GuardedUpsertResult,
  isConditionalWriteMiss,
  toSyncTombstone,
} from "./processor-common";
import type { PushProcessingContext } from "./processor-types";
import type { NotebookPayload, SyncQueueItem } from "./validation";
import {
  DEFAULT_NOTEBOOK_NAME,
  isStaleBase,
  nonEmptyText,
  notebookPayloadMatches,
} from "./utils";

export async function inspectNotebookForArchive(
  context: PushProcessingContext,
  notebookId: string,
): Promise<GuardedArchiveState<Prisma.NotebookGetPayload<object>>> {
  return prisma.$transaction(async (transaction) => {
    await acquireSyncEntityLocks(transaction, context.userId, [
      { entityType: "notebook", entityId: notebookId },
    ]);
    const [current, tombstoneRow] = await Promise.all([
      transaction.notebook.findUnique({ where: { id: notebookId } }),
      transaction.entityTombstone.findUnique({
        where: {
          userId_entityType_entityId: {
            userId: context.userId,
            entityType: "notebook",
            entityId: notebookId,
          },
        },
      }),
    ]);
    if (current && current.userId !== context.userId) {
      return { status: "forbidden" };
    }
    if (tombstoneRow) {
      return {
        status: "tombstone",
        tombstone: toSyncTombstone(tombstoneRow, "notebook"),
      };
    }
    return current
      ? { status: "current", entity: current }
      : { status: "missing" };
  });
}

async function readNotebookRaceResult(
  transaction: Prisma.TransactionClient,
  item: SyncQueueItem,
  context: PushProcessingContext,
  notebookId: string,
): Promise<GuardedUpsertResult<Prisma.NotebookGetPayload<object>>> {
  const [current, tombstoneRow] = await Promise.all([
    transaction.notebook.findUnique({ where: { id: notebookId } }),
    transaction.entityTombstone.findUnique({
      where: {
        userId_entityType_entityId: {
          userId: context.userId,
          entityType: "notebook",
          entityId: notebookId,
        },
      },
    }),
  ]);
  if (current && current.userId !== context.userId) {
    return { status: "forbidden" };
  }
  if (tombstoneRow) {
    return { status: "tombstone", tombstone: toSyncTombstone(tombstoneRow, "notebook") };
  }
  if (current) {
    return { status: "conflict", entity: current };
  }
  throw new Error(`SYNC_NOTEBOOK_DISAPPEARED:${item.entityId}`);
}

export async function upsertNotebookWithHierarchyGuard(
  item: SyncQueueItem,
  context: PushProcessingContext,
  notebookId: string,
  payload: NotebookPayload,
  fallbackGroupId?: string,
): Promise<GuardedUpsertResult<Prisma.NotebookGetPayload<object>>> {
  return prisma.$transaction(async (transaction) => {
    await acquireSyncEntityLocks(transaction, context.userId, [
      { entityType: "notebook", entityId: notebookId },
    ]);

    const [current, tombstoneRow] = await Promise.all([
      transaction.notebook.findUnique({ where: { id: notebookId } }),
      transaction.entityTombstone.findUnique({
        where: {
          userId_entityType_entityId: {
            userId: context.userId,
            entityType: "notebook",
            entityId: notebookId,
          },
        },
      }),
    ]);

    if (current && current.userId !== context.userId) {
      return { status: "forbidden" };
    }

    const freshTombstone = tombstoneRow
      ? toSyncTombstone(tombstoneRow, "notebook")
      : null;
    if (freshTombstone) {
      if (current || !canResurrectTombstone(item, freshTombstone)) {
        return { status: "tombstone", tombstone: freshTombstone };
      }
    }

    if (
      current &&
      isStaleBase(current.updatedAt, item.baseUpdatedAt) &&
      !notebookPayloadMatches(current, payload, item.operation)
    ) {
      return { status: "conflict", entity: current };
    }

    const targetGroupId = payload.groupId ?? current?.groupId ?? fallbackGroupId;
    if (!targetGroupId) {
      return { status: "needs-fallback" };
    }
    const targetGroup = await transaction.notebookGroup.findFirst({
      where: { id: targetGroupId, userId: context.userId },
      select: { id: true },
    });
    if (!targetGroup) {
      return payload.groupId
        ? { status: "invalid-parent" }
        : { status: "needs-fallback" };
    }

    const data = {
      userId: context.userId,
      groupId: targetGroup.id,
      name: nonEmptyText(payload.name, current?.name ?? DEFAULT_NOTEBOOK_NAME),
      description: payload.description === undefined
        ? (current?.description ?? null)
        : (payload.description ?? null),
      archived: payload.archived ?? current?.archived ?? false,
      deletedAt: null,
    };

    if (!current) {
      if (freshTombstone) {
        const removed = await transaction.entityTombstone.deleteMany({
          where: {
            id: freshTombstone.id,
            userId: context.userId,
            entityType: "notebook",
            entityId: notebookId,
            deletedAt: new Date(freshTombstone.deletedAt),
          },
        });
        if (removed.count !== 1) {
          return { status: "tombstone", tombstone: freshTombstone };
        }
      }
      const notebook = await transaction.notebook.create({
        data: { id: notebookId, ...data },
      });
      return { status: "applied", entity: notebook };
    }

    try {
      const notebook = await transaction.notebook.update({
        where: {
          id: notebookId,
          userId: context.userId,
          updatedAt: current.updatedAt,
        },
        data,
      });
      return { status: "applied", entity: notebook };
    } catch (error) {
      if (!isConditionalWriteMiss(error)) {
        throw error;
      }
      return readNotebookRaceResult(transaction, item, context, notebookId);
    }
  });
}
