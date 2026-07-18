import type { Prisma } from "@/generated/prisma/client";
import {
  extractFreeformPlainText,
  extractPlainText,
  parseFreeformDocument,
  sanitizeNoteHtml,
} from "@/lib/notes";
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
import type { PagePayload, SyncQueueItem } from "./validation";
import {
  DEFAULT_PAGE_TITLE,
  isStaleBase,
  nonEmptyText,
  pagePayloadMatches,
} from "./utils";

export async function inspectPageForArchive(
  context: PushProcessingContext,
  pageId: string,
  requestedNotebookId: string | undefined,
  initialNotebookId: string | undefined,
): Promise<GuardedArchiveState<Prisma.PageGetPayload<object>>> {
  let candidateNotebookId = initialNotebookId;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const result = await prisma.$transaction(async (transaction) => {
      const lockedNotebookIds = new Set(
        [requestedNotebookId, candidateNotebookId].filter(
          (id): id is string => Boolean(id),
        ),
      );
      await acquireSyncEntityLocks(transaction, context.userId, [
        ...[...lockedNotebookIds].map((entityId) => ({
          entityType: "notebook" as const,
          entityId,
        })),
        { entityType: "page", entityId: pageId },
      ]);
      const [current, tombstoneRow] = await Promise.all([
        transaction.page.findUnique({ where: { id: pageId } }),
        transaction.entityTombstone.findUnique({
          where: {
            userId_entityType_entityId: {
              userId: context.userId,
              entityType: "page",
              entityId: pageId,
            },
          },
        }),
      ]);
      if (current && current.userId !== context.userId) {
        return { status: "forbidden" } as const;
      }
      if (current && !lockedNotebookIds.has(current.notebookId)) {
        return { status: "retry", notebookId: current.notebookId } as const;
      }
      if (tombstoneRow) {
        return {
          status: "tombstone",
          tombstone: toSyncTombstone(tombstoneRow, "page"),
        } as const;
      }
      return current
        ? ({ status: "current", entity: current } as const)
        : ({ status: "missing" } as const);
    });
    if (result.status !== "retry") {
      return result;
    }
    candidateNotebookId = result.notebookId;
  }
  return { status: "retry", notebookId: candidateNotebookId ?? "" };
}

async function readPageRaceResult(
  transaction: Prisma.TransactionClient,
  item: SyncQueueItem,
  context: PushProcessingContext,
  pageId: string,
): Promise<GuardedUpsertResult<Prisma.PageGetPayload<object>>> {
  const [current, tombstoneRow] = await Promise.all([
    transaction.page.findUnique({ where: { id: pageId } }),
    transaction.entityTombstone.findUnique({
      where: {
        userId_entityType_entityId: {
          userId: context.userId,
          entityType: "page",
          entityId: pageId,
        },
      },
    }),
  ]);
  if (current && current.userId !== context.userId) {
    return { status: "forbidden" };
  }
  if (tombstoneRow) {
    return { status: "tombstone", tombstone: toSyncTombstone(tombstoneRow, "page") };
  }
  if (current) {
    return { status: "conflict", entity: current };
  }
  throw new Error(`SYNC_PAGE_DISAPPEARED:${item.entityId}`);
}

export async function upsertPageWithHierarchyGuard(
  item: SyncQueueItem,
  context: PushProcessingContext,
  pageId: string,
  payload: PagePayload,
  candidateNotebookId?: string,
  fallbackNotebookId?: string,
): Promise<GuardedUpsertResult<Prisma.PageGetPayload<object>>> {
  return prisma.$transaction(async (transaction) => {
    const lockedNotebookIds = new Set(
      [candidateNotebookId, payload.notebookId, fallbackNotebookId].filter(
        (id): id is string => Boolean(id),
      ),
    );
    await acquireSyncEntityLocks(transaction, context.userId, [
      ...[...lockedNotebookIds].map((entityId) => ({
        entityType: "notebook" as const,
        entityId,
      })),
      { entityType: "page", entityId: pageId },
    ]);

    const [current, tombstoneRow] = await Promise.all([
      transaction.page.findUnique({ where: { id: pageId } }),
      transaction.entityTombstone.findUnique({
        where: {
          userId_entityType_entityId: {
            userId: context.userId,
            entityType: "page",
            entityId: pageId,
          },
        },
      }),
    ]);

    if (current && current.userId !== context.userId) {
      return { status: "forbidden" };
    }
    if (current && !lockedNotebookIds.has(current.notebookId)) {
      return { status: "retry", notebookId: current.notebookId };
    }

    const freshTombstone = tombstoneRow
      ? toSyncTombstone(tombstoneRow, "page")
      : null;
    if (freshTombstone) {
      if (current || !canResurrectTombstone(item, freshTombstone)) {
        return { status: "tombstone", tombstone: freshTombstone };
      }
    }

    if (
      current &&
      isStaleBase(current.updatedAt, item.baseUpdatedAt) &&
      !pagePayloadMatches(current, payload, item.operation)
    ) {
      return { status: "conflict", entity: current };
    }

    let targetNotebookId: string | undefined;
    const requestedNotebookId = payload.notebookId;
    if (requestedNotebookId) {
      const requestedNotebook = await transaction.notebook.findFirst({
        where: {
          id: requestedNotebookId,
          userId: context.userId,
          archived: false,
          deletedAt: null,
        },
        select: { id: true },
      });
      targetNotebookId = requestedNotebook?.id;
      if (
        !targetNotebookId &&
        context.validNotebookIds.has(requestedNotebookId)
      ) {
        return { status: "invalid-parent" };
      }
    }
    const fallbackTargetIds = [current?.notebookId, fallbackNotebookId]
      .filter((id, index, all): id is string => (
        Boolean(id) &&
        id !== requestedNotebookId &&
        all.indexOf(id) === index
      ));
    for (const notebookId of fallbackTargetIds) {
      if (targetNotebookId) {
        break;
      }
      const targetNotebook = await transaction.notebook.findFirst({
        where: {
          id: notebookId,
          userId: context.userId,
          archived: false,
          deletedAt: null,
        },
        select: { id: true },
      });
      if (targetNotebook) {
        targetNotebookId = targetNotebook.id;
      }
    }
    if (!targetNotebookId) {
      return { status: "needs-fallback" };
    }
    if (!lockedNotebookIds.has(targetNotebookId)) {
      return { status: "retry", notebookId: current?.notebookId };
    }

    const rawBodyHtml = payload.bodyHtml ?? current?.bodyHtml ?? "";
    const freeformDocument = parseFreeformDocument(rawBodyHtml);
    const safeHtml = freeformDocument ? rawBodyHtml : sanitizeNoteHtml(rawBodyHtml);
    const bodyText = freeformDocument
      ? extractFreeformPlainText(freeformDocument)
      : extractPlainText(safeHtml);
    const data = {
      userId: context.userId,
      notebookId: targetNotebookId,
      title: nonEmptyText(payload.title, current?.title ?? DEFAULT_PAGE_TITLE),
      bodyHtml: safeHtml,
      bodyText,
      archived: payload.archived ?? current?.archived ?? false,
      deletedAt: null,
      originalNotebookId: null,
    };

    if (!current) {
      if (freshTombstone) {
        const removed = await transaction.entityTombstone.deleteMany({
          where: {
            id: freshTombstone.id,
            userId: context.userId,
            entityType: "page",
            entityId: pageId,
            deletedAt: new Date(freshTombstone.deletedAt),
          },
        });
        if (removed.count !== 1) {
          return { status: "tombstone", tombstone: freshTombstone };
        }
      }
      const page = await transaction.page.create({
        data: { id: pageId, ...data },
      });
      return { status: "applied", entity: page };
    }

    try {
      const page = await transaction.page.update({
        where: {
          id: pageId,
          userId: context.userId,
          notebookId: current.notebookId,
          updatedAt: current.updatedAt,
        },
        data,
      });
      return { status: "applied", entity: page };
    } catch (error) {
      if (!isConditionalWriteMiss(error)) {
        throw error;
      }
      return readPageRaceResult(transaction, item, context, pageId);
    }
  });
}
