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
import { moveNotebookToTrash, movePageToTrash } from "@/lib/trash";

import {
  notebookPayloadSchema,
  pagePayloadSchema,
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
  const tombstone = context.existingTombstones.get(`notebook:${notebookId}`);

  if (existing && existing.userId !== context.userId) {
    return { message: "Forbidden notebook scope.", status: 403, item };
  }

  if (!existing && tombstone) {
    context.tombstones.set(`notebook:${notebookId}`, tombstone);
    context.applied.push(appliedOperation(item));
    return null;
  }

  if (
    existing &&
    isStaleBase(existing.updatedAt, item.baseUpdatedAt) &&
    !notebookPayloadMatches(existing, payload, item.operation)
  ) {
    const remote = toNotebookResponse(existing);
    context.notebooks.set(existing.id, remote);
    context.conflicts.push(createConflict(context.userId, item, payload, remote));
    return null;
  }

  if (item.operation === "archive") {
    if (!existing) {
      context.applied.push(appliedOperation(item));
      return null;
    }

    await moveNotebookToTrash(context.userId, existing.id);
    const archived = await prisma.notebook.findUniqueOrThrow({
      where: { id: existing.id },
    });

    context.notebooks.set(archived.id, toNotebookResponse(archived));
    context.existingNotebooks.set(archived.id, archived);
    context.applied.push(appliedOperation(item));
    return null;
  }

  const payloadGroup = payload.groupId && context.validGroupIds.has(payload.groupId)
    ? { id: payload.groupId }
    : null;

  if (payload.groupId && !payloadGroup) {
    return { message: "Invalid notebook group.", status: 400, item };
  }

  if (!context.fallbackGroupId && !payloadGroup?.id && !existing?.groupId) {
    context.fallbackGroupId = await getFallbackNotebookGroupId(context.userId);
  }
  const targetGroupId =
    payloadGroup?.id ?? existing?.groupId ?? context.fallbackGroupId!;
  const nextName = nonEmptyText(
    payload.name,
    existing?.name ?? DEFAULT_NOTEBOOK_NAME,
  );
  const nextDescription =
    payload.description === undefined
      ? (existing?.description ?? null)
      : (payload.description ?? null);
  const nextArchived = payload.archived ?? existing?.archived ?? false;

  const notebook = existing
    ? await prisma.notebook.update({
        where: { id: notebookId },
        data: {
          userId: context.userId,
          groupId: targetGroupId,
          name: nextName,
          description: nextDescription,
          archived: nextArchived,
        },
      })
    : await prisma.notebook.create({
        data: {
          id: notebookId,
          userId: context.userId,
          groupId: targetGroupId,
          name: nextName,
          description: nextDescription,
          archived: nextArchived,
        },
      });

  context.notebooks.set(notebook.id, toNotebookResponse(notebook));
  context.existingNotebooks.set(notebook.id, notebook);
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
  const tombstone = context.existingTombstones.get(`page:${pageId}`);

  if (existing && existing.userId !== context.userId) {
    return { message: "Forbidden page scope.", status: 403, item };
  }

  if (!existing && tombstone) {
    context.tombstones.set(`page:${pageId}`, tombstone);
    context.applied.push(appliedOperation(item));
    return null;
  }

  if (
    existing &&
    isStaleBase(existing.updatedAt, item.baseUpdatedAt) &&
    !pagePayloadMatches(existing, payload, item.operation)
  ) {
    const remote = toPageResponse(existing);
    context.pages.set(existing.id, remote);
    context.conflicts.push(createConflict(context.userId, item, payload, remote));
    return null;
  }

  if (item.operation === "archive" && !existing) {
    context.applied.push(appliedOperation(item));
    return null;
  }

  let targetNotebookId = payload.notebookId ?? existing?.notebookId;
  let notebook = targetNotebookId && context.validNotebookIds.has(targetNotebookId)
    ? { id: targetNotebookId }
    : null;

  if (!notebook && existing) {
    targetNotebookId = existing.notebookId;
    notebook = context.validNotebookIds.has(existing.notebookId)
      ? { id: existing.notebookId }
      : null;
  }

  if (!notebook && item.operation === "upsert") {
    if (!context.fallbackNotebookId) {
      context.fallbackNotebookId = await getFallbackPageNotebookId(context.userId);
      context.validNotebookIds.add(context.fallbackNotebookId);
    }
    targetNotebookId = context.fallbackNotebookId;
    notebook = { id: targetNotebookId };
  }

  if (!notebook || !targetNotebookId) {
    return { message: "Invalid page notebook.", status: 400, item };
  }

  const rawBodyHtml = payload.bodyHtml ?? existing?.bodyHtml ?? "";
  const freeformDocument = parseFreeformDocument(rawBodyHtml);
  const safeHtml = freeformDocument ? rawBodyHtml : sanitizeNoteHtml(rawBodyHtml);
  const bodyText = freeformDocument
    ? extractFreeformPlainText(freeformDocument)
    : extractPlainText(safeHtml);
  const nextTitle = nonEmptyText(
    payload.title,
    existing?.title ?? DEFAULT_PAGE_TITLE,
  );
  const nextArchived = payload.archived ?? existing?.archived ?? false;

  if (item.operation === "archive") {
    const moved = await movePageToTrash(context.userId, existing!.id);
    if (!moved) {
      if (existing!.deletedAt) {
        context.pages.set(existing!.id, toPageResponse(existing!));
        context.applied.push(appliedOperation(item));
        return null;
      }

      return {
        message: "Page could not be moved to trash.",
        status: 409,
        item,
      };
    }

    const archived = await prisma.page.findUniqueOrThrow({
      where: { id: existing!.id },
    });

    context.pages.set(archived.id, toPageResponse(archived));
    context.existingPages.set(archived.id, archived);
    context.applied.push(appliedOperation(item));
    return null;
  }

  const page = existing
    ? await prisma.page.update({
        where: { id: pageId },
        data: {
          userId: context.userId,
          notebookId: targetNotebookId,
          title: nextTitle,
          bodyHtml: safeHtml,
          bodyText,
          archived: nextArchived,
        },
      })
    : await prisma.page.create({
        data: {
          id: pageId,
          userId: context.userId,
          notebookId: targetNotebookId,
          title: nextTitle,
          bodyHtml: safeHtml,
          bodyText,
          archived: nextArchived,
        },
      });

  context.pages.set(page.id, toPageResponse(page));
  context.existingPages.set(page.id, page);
  context.applied.push(appliedOperation(item));
  return null;
}
