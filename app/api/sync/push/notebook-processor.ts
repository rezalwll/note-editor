import { prisma } from "@/lib/prisma";
import { moveNotebookToTrash } from "@/lib/trash";

import {
  appliedOperation,
  findCurrentTombstone,
  recordTombstoneConflict,
} from "./processor-common";
import {
  inspectNotebookForArchive,
  upsertNotebookWithHierarchyGuard,
} from "./notebook-guards";
import type {
  PushProcessingContext,
  PushProcessingError,
} from "./processor-types";
import { notebookPayloadSchema, type SyncQueueItem } from "./validation";
import {
  createConflict,
  getFallbackNotebookGroupId,
  getIssueSummary,
  isStaleBase,
  notebookPayloadMatches,
  toNotebookResponse,
} from "./utils";

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
