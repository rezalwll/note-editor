import type {
  LocalNotebook,
  LocalPage,
  SyncPushResult,
  SyncTombstone,
} from "@/lib/offline-db/types";
import type { Prisma } from "@/generated/prisma/client";
import {
  extractFreeformPlainText,
  extractPlainText,
  parseFreeformDocument,
  sanitizeNoteHtml,
} from "@/lib/notes";
import { prisma } from "@/lib/prisma";
import { acquireSyncEntityLocks } from "@/lib/sync/entity-lock";
import { moveNotebookToTrash, movePageToTrash } from "@/lib/trash";

import {
  notebookPayloadSchema,
  pagePayloadSchema,
  type NotebookPayload,
  type PagePayload,
  type SyncQueueItem,
} from "./validation";
import {
  createConflict,
  DEFAULT_NOTEBOOK_NAME,
  DEFAULT_PAGE_TITLE,
  getFallbackNotebookGroupId,
  getFallbackPageNotebookId,
  getIssueSummary,
  isStaleBase,
  nonEmptyText,
  notebookPayloadMatches,
  pagePayloadMatches,
  toNotebookResponse,
  toPageResponse,
} from "./utils";

export type PushProcessingContext = {
  userId: string;
  applied: SyncPushResult["applied"];
  conflicts: SyncPushResult["conflicts"];
  notebooks: Map<string, LocalNotebook>;
  pages: Map<string, LocalPage>;
  existingNotebooks: Map<string, Prisma.NotebookGetPayload<object>>;
  existingPages: Map<string, Prisma.PageGetPayload<object>>;
  validGroupIds: Set<string>;
  validNotebookIds: Set<string>;
  fallbackGroupId?: string;
  fallbackNotebookId?: string;
  existingTombstones: Map<string, SyncTombstone>;
  tombstones: Map<string, SyncTombstone>;
};

export type PushProcessingError = {
  message: string;
  status: number;
  item: SyncQueueItem;
  issues?: ReturnType<typeof getIssueSummary>;
};

function appliedOperation(item: SyncQueueItem) {
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

function recordTombstoneConflict(
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

function canResurrectTombstone(item: SyncQueueItem, tombstone: SyncTombstone) {
  return item.baseUpdatedAt === tombstone.deletedAt;
}

type GuardedUpsertResult<T> =
  | { status: "applied"; entity: T }
  | { status: "conflict"; entity: T }
  | { status: "forbidden" }
  | { status: "invalid-parent" }
  | { status: "needs-fallback" }
  | { status: "retry"; notebookId?: string }
  | { status: "tombstone"; tombstone: SyncTombstone };

type GuardedArchiveState<T> =
  | { status: "current"; entity: T }
  | { status: "missing" }
  | { status: "forbidden" }
  | { status: "retry"; notebookId: string }
  | { status: "tombstone"; tombstone: SyncTombstone };

function toSyncTombstone(
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

async function findCurrentTombstone(
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

async function inspectNotebookForArchive(
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

async function inspectPageForArchive(
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

function isConditionalWriteMiss(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "P2025"
  );
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

async function upsertNotebookWithHierarchyGuard(
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

async function upsertPageWithHierarchyGuard(
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

export async function processNotebookOperation(
  item: SyncQueueItem,
  context: PushProcessingContext,
): Promise<PushProcessingError | null> {
  const parsedNotebook = notebookPayloadSchema.safeParse(item.payload);

  if (!parsedNotebook.success) {
    return {
      message: "Invalid notebook sync payload.",
      status: 400,
      item,
      issues: getIssueSummary(parsedNotebook.error),
    };
  }

  const payload = parsedNotebook.data;
  const notebookId = payload.id ?? item.entityId;
  if (notebookId !== item.entityId) {
    return { message: "Notebook identity mismatch.", status: 400, item };
  }
  const existing = context.existingNotebooks.get(notebookId) ?? null;

  if (existing && existing.userId !== context.userId) {
    return { message: "Forbidden notebook scope.", status: 403, item };
  }

  if (item.operation === "archive") {
    const inspected = await inspectNotebookForArchive(context, notebookId);
    if (inspected.status === "forbidden") {
      return { message: "Forbidden notebook scope.", status: 403, item };
    }
    if (inspected.status === "tombstone") {
      context.tombstones.set(`notebook:${notebookId}`, inspected.tombstone);
      context.applied.push(appliedOperation(item));
      return null;
    }
    if (inspected.status === "missing") {
      context.applied.push(appliedOperation(item));
      return null;
    }
    if (inspected.status === "retry") {
      return { message: "Notebook changed while syncing.", status: 409, item };
    }
    const fresh = inspected.entity;
    if (fresh.deletedAt) {
      context.notebooks.set(fresh.id, toNotebookResponse(fresh));
      context.existingNotebooks.set(fresh.id, fresh);
      context.applied.push(appliedOperation(item));
      return null;
    }
    if (
      isStaleBase(fresh.updatedAt, item.baseUpdatedAt) &&
      !notebookPayloadMatches(fresh, payload, item.operation)
    ) {
      const remote = toNotebookResponse(fresh);
      context.notebooks.set(fresh.id, remote);
      context.conflicts.push(createConflict(context.userId, item, payload, remote));
      return null;
    }

    const moved = await moveNotebookToTrash(
      context.userId,
      fresh.id,
      fresh.updatedAt,
    );
    const archived = await prisma.notebook.findUnique({
      where: { id: fresh.id },
    });

    if (!archived) {
      const freshTombstone = await findCurrentTombstone(
        context.userId,
        "notebook",
        fresh.id,
      );
      if (freshTombstone) {
        context.tombstones.set(`notebook:${fresh.id}`, freshTombstone);
      }
      context.applied.push(appliedOperation(item));
      return null;
    }
    if (!moved && !archived.deletedAt) {
      if (archived.userId !== context.userId) {
        return { message: "Forbidden notebook scope.", status: 403, item };
      }
      const remote = toNotebookResponse(archived);
      context.notebooks.set(archived.id, remote);
      context.existingNotebooks.set(archived.id, archived);
      context.conflicts.push(createConflict(context.userId, item, payload, remote));
      return null;
    }

    context.notebooks.set(archived.id, toNotebookResponse(archived));
    context.existingNotebooks.set(archived.id, archived);
    context.validNotebookIds.delete(archived.id);
    context.applied.push(appliedOperation(item));
    return null;
  }

  if (payload.groupId && !context.validGroupIds.has(payload.groupId)) {
    return { message: "Invalid notebook group.", status: 400, item };
  }

  let result = await upsertNotebookWithHierarchyGuard(
    item,
    context,
    notebookId,
    payload,
    context.fallbackGroupId,
  );
  if (result.status === "needs-fallback") {
    context.fallbackGroupId ??= await getFallbackNotebookGroupId(context.userId);
    result = await upsertNotebookWithHierarchyGuard(
      item,
      context,
      notebookId,
      payload,
      context.fallbackGroupId,
    );
  }
  if (result.status === "forbidden") {
    return { message: "Forbidden notebook scope.", status: 403, item };
  }
  if (result.status === "invalid-parent" || result.status === "needs-fallback") {
    return { message: "Invalid notebook group.", status: 400, item };
  }
  if (result.status === "tombstone") {
    recordTombstoneConflict(context, item, result.tombstone, payload);
    return null;
  }
  if (result.status === "conflict" || result.status === "retry") {
    if (result.status === "retry") {
      return { message: "Notebook changed while syncing.", status: 409, item };
    }
    const remote = toNotebookResponse(result.entity);
    context.notebooks.set(result.entity.id, remote);
    context.existingNotebooks.set(result.entity.id, result.entity);
    context.conflicts.push(createConflict(context.userId, item, payload, remote));
    return null;
  }
  const notebook = result.entity;

  context.notebooks.set(notebook.id, toNotebookResponse(notebook));
  context.existingNotebooks.set(notebook.id, notebook);
  context.existingTombstones.delete(`notebook:${notebook.id}`);
  context.validNotebookIds.add(notebook.id);
  context.applied.push(appliedOperation(item));
  return null;
}

export async function processPageOperation(
  item: SyncQueueItem,
  context: PushProcessingContext,
): Promise<PushProcessingError | null> {
  const parsedPage = pagePayloadSchema.safeParse(item.payload);

  if (!parsedPage.success) {
    return {
      message: "Invalid page sync payload.",
      status: 400,
      item,
      issues: getIssueSummary(parsedPage.error),
    };
  }

  const payload = parsedPage.data;
  const pageId = payload.id ?? item.entityId;
  if (pageId !== item.entityId) {
    return { message: "Page identity mismatch.", status: 400, item };
  }
  const existing = context.existingPages.get(pageId) ?? null;

  if (existing && existing.userId !== context.userId) {
    return { message: "Forbidden page scope.", status: 403, item };
  }

  if (item.operation === "archive") {
    const inspected = await inspectPageForArchive(
      context,
      pageId,
      payload.notebookId,
      existing?.notebookId,
    );
    if (inspected.status === "forbidden") {
      return { message: "Forbidden page scope.", status: 403, item };
    }
    if (inspected.status === "tombstone") {
      context.tombstones.set(`page:${pageId}`, inspected.tombstone);
      context.applied.push(appliedOperation(item));
      return null;
    }
    if (inspected.status === "missing") {
      context.applied.push(appliedOperation(item));
      return null;
    }
    if (inspected.status === "retry") {
      return { message: "Page changed while syncing.", status: 409, item };
    }
    const fresh = inspected.entity;
    if (fresh.deletedAt) {
      context.pages.set(fresh.id, toPageResponse(fresh));
      context.existingPages.set(fresh.id, fresh);
      context.applied.push(appliedOperation(item));
      return null;
    }
    if (
      isStaleBase(fresh.updatedAt, item.baseUpdatedAt) &&
      !pagePayloadMatches(fresh, payload, item.operation)
    ) {
      const remote = toPageResponse(fresh);
      context.pages.set(fresh.id, remote);
      context.conflicts.push(createConflict(context.userId, item, payload, remote));
      return null;
    }
    const moved = await movePageToTrash(
      context.userId,
      fresh.id,
      fresh.updatedAt,
    );
    if (!moved) {
      const changed = await prisma.page.findUnique({ where: { id: fresh.id } });
      if (!changed) {
        const freshTombstone = await findCurrentTombstone(
          context.userId,
          "page",
          fresh.id,
        );
        if (freshTombstone) {
          context.tombstones.set(`page:${fresh.id}`, freshTombstone);
        }
        context.applied.push(appliedOperation(item));
        return null;
      }
      if (changed.userId !== context.userId) {
        return { message: "Forbidden page scope.", status: 403, item };
      }
      if (changed.deletedAt) {
        context.pages.set(changed.id, toPageResponse(changed));
        context.existingPages.set(changed.id, changed);
        context.applied.push(appliedOperation(item));
        return null;
      }
      const remote = toPageResponse(changed);
      context.pages.set(changed.id, remote);
      context.existingPages.set(changed.id, changed);
      context.conflicts.push(createConflict(context.userId, item, payload, remote));
      return null;
    }

    const archived = await prisma.page.findUnique({
      where: { id: fresh.id },
    });

    if (!archived) {
      const freshTombstone = await findCurrentTombstone(
        context.userId,
        "page",
        fresh.id,
      );
      if (freshTombstone) {
        context.tombstones.set(`page:${fresh.id}`, freshTombstone);
      }
      context.applied.push(appliedOperation(item));
      return null;
    }

    context.pages.set(archived.id, toPageResponse(archived));
    context.existingPages.set(archived.id, archived);
    context.applied.push(appliedOperation(item));
    return null;
  }

  let candidateNotebookId = existing?.notebookId;
  let result: GuardedUpsertResult<Prisma.PageGetPayload<object>> | undefined;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    result = await upsertPageWithHierarchyGuard(
      item,
      context,
      pageId,
      payload,
      candidateNotebookId,
      context.fallbackNotebookId,
    );
    if (result.status === "retry") {
      candidateNotebookId = result.notebookId ?? candidateNotebookId;
      continue;
    }
    if (result.status === "needs-fallback") {
      context.fallbackNotebookId ??= await getFallbackPageNotebookId(context.userId);
      context.validNotebookIds.add(context.fallbackNotebookId);
      continue;
    }
    break;
  }
  if (!result || result.status === "retry" || result.status === "needs-fallback") {
    return { message: "Page changed while syncing.", status: 409, item };
  }
  if (result.status === "forbidden") {
    return { message: "Forbidden page scope.", status: 403, item };
  }
  if (result.status === "invalid-parent") {
    return { message: "Invalid page notebook.", status: 400, item };
  }
  if (result.status === "tombstone") {
    recordTombstoneConflict(context, item, result.tombstone, payload);
    return null;
  }
  if (result.status === "conflict") {
    const remote = toPageResponse(result.entity);
    context.pages.set(result.entity.id, remote);
    context.existingPages.set(result.entity.id, result.entity);
    context.conflicts.push(createConflict(context.userId, item, payload, remote));
    return null;
  }
  const page = result.entity;

  context.pages.set(page.id, toPageResponse(page));
  context.existingPages.set(page.id, page);
  context.existingTombstones.delete(`page:${page.id}`);
  context.applied.push(appliedOperation(item));
  return null;
}
