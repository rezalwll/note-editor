import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { movePageToTrash } from "@/lib/trash";

import {
  appliedOperation,
  findCurrentTombstone,
  type GuardedUpsertResult,
  recordTombstoneConflict,
} from "./processor-common";
import {
  inspectPageForArchive,
  upsertPageWithHierarchyGuard,
} from "./page-guards";
import type {
  PushProcessingContext,
  PushProcessingError,
} from "./processor-types";
import { pagePayloadSchema, type SyncQueueItem } from "./validation";
import {
  createConflict,
  getFallbackPageNotebookId,
  getIssueSummary,
  isStaleBase,
  pagePayloadMatches,
  toPageResponse,
} from "./utils";

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
