import { NextResponse } from "next/server";

import { requireUser } from "@/lib/auth";
import type {
  LocalNotebook,
  LocalPage,
  SyncPushResult,
  SyncTombstone,
} from "@/lib/offline-db/types";
import { observeRequest } from "@/lib/request-observability";
import { prisma } from "@/lib/prisma";

import {
  processNotebookOperation,
  processPageOperation,
  type PushProcessingError,
} from "./processors";
import { pushSchema, type SyncQueueItem } from "./validation";
import { getIssueSummary, getItemSummary } from "./utils";

function syncPushError(
  observation: ReturnType<typeof observeRequest>,
  message: string,
  status: number,
  item?: SyncQueueItem,
  issues?: ReturnType<typeof getIssueSummary>,
) {
  observation.log.warn("Rejected sync push operation", {
    message,
    item: item ? getItemSummary(item) : undefined,
    issues,
  });

  return observation.complete(
    NextResponse.json({ error: message, issues }, { status }),
    { rejectedOperationCount: item ? 1 : 0 },
  );
}

function processingErrorResponse(
  observation: ReturnType<typeof observeRequest>,
  error: PushProcessingError,
) {
  return syncPushError(
    observation,
    error.message,
    error.status,
    error.item,
    error.issues,
  );
}

export async function POST(request: Request) {
  const observation = observeRequest(request, "/api/sync/push");
  const user = await requireUser();
  let requestBody: unknown;
  try {
    requestBody = await request.json();
  } catch {
    return syncPushError(observation, "Invalid JSON payload.", 400);
  }
  const parsed = pushSchema.safeParse(requestBody);

  if (!parsed.success) {
    return syncPushError(
      observation,
      "Invalid sync payload.",
      400,
      undefined,
      getIssueSummary(parsed.error),
    );
  }

  const foreignQueueItem = parsed.data.operations.find(
    (item) => item.userId && item.userId !== user.id,
  );
  if (foreignQueueItem) {
    return syncPushError(
      observation,
      "Forbidden sync queue scope.",
      403,
      foreignQueueItem,
    );
  }

  const applied: SyncPushResult["applied"] = [];
  const conflicts: SyncPushResult["conflicts"] = [];
  const notebooks = new Map<string, LocalNotebook>();
  const pages = new Map<string, LocalPage>();
  const tombstones = new Map<string, SyncTombstone>();
  const notebookEntityIds = parsed.data.operations
    .filter((item) => item.entityType === "notebook")
    .map((item) => item.entityId);
  const pageEntityIds = parsed.data.operations
    .filter((item) => item.entityType === "page")
    .map((item) => item.entityId);
  const requestedGroupIds = parsed.data.operations
    .map((item) => (item.payload as { groupId?: unknown })?.groupId)
    .filter((id): id is string => typeof id === "string");
  const requestedNotebookIds = parsed.data.operations
    .map((item) => (item.payload as { notebookId?: unknown })?.notebookId)
    .filter((id): id is string => typeof id === "string");

  let existingNotebookRows;
  let existingPageRows;
  let validGroupRows;
  let tombstoneRows;
  try {
    [existingNotebookRows, existingPageRows, validGroupRows, tombstoneRows] = await Promise.all([
      prisma.notebook.findMany({ where: { id: { in: notebookEntityIds } } }),
      prisma.page.findMany({ where: { id: { in: pageEntityIds } } }),
      prisma.notebookGroup.findMany({
        where: { id: { in: requestedGroupIds }, userId: user.id },
        select: { id: true },
      }),
      prisma.entityTombstone.findMany({
        where: {
          userId: user.id,
          OR: [
            { entityType: "notebook", entityId: { in: notebookEntityIds } },
            { entityType: "page", entityId: { in: pageEntityIds } },
          ],
        },
      }),
    ]);
    const validNotebookRows = await prisma.notebook.findMany({
      where: {
        id: {
          in: [
            ...notebookEntityIds,
            ...requestedNotebookIds,
            ...existingPageRows.map((page) => page.notebookId),
          ],
        },
        userId: user.id,
      },
      select: { id: true },
    });

    const context = {
      userId: user.id,
      applied,
      conflicts,
      notebooks,
      pages,
      existingNotebooks: new Map(existingNotebookRows.map((item) => [item.id, item])),
      existingPages: new Map(existingPageRows.map((item) => [item.id, item])),
      validGroupIds: new Set(validGroupRows.map((item) => item.id)),
      validNotebookIds: new Set(validNotebookRows.map((item) => item.id)),
      existingTombstones: new Map(
        tombstoneRows
          .filter((item) => item.entityType === "notebook" || item.entityType === "page")
          .map((item) => [
            `${item.entityType}:${item.entityId}`,
            {
              id: item.id,
              entityType: item.entityType as "notebook" | "page",
              entityId: item.entityId,
              deletedAt: item.deletedAt.toISOString(),
            },
          ]),
      ),
      tombstones,
    };

    for (const item of parsed.data.operations) {
      const error =
        item.entityType === "notebook"
          ? await processNotebookOperation(item, context)
          : await processPageOperation(item, context);

      if (error) {
        return processingErrorResponse(observation, error);
      }
    }
  } catch (error) {
    return observation.failure(error, {
      userId: user.id,
      operationCount: parsed.data.operations.length,
      appliedCount: applied.length,
      conflictCount: conflicts.length,
    });
  }

  const payload: SyncPushResult = {
    applied,
    conflicts,
    notebooks: [...notebooks.values()],
    pages: [...pages.values()],
    tombstones: [...tombstones.values()],
    pulledAt: new Date().toISOString(),
  };

  const operationCount = parsed.data.operations.length;
  const conflictCount = conflicts.length;
  observation.log.metric("sync.operations", operationCount, {
    userId: user.id,
    appliedCount: applied.length,
    conflictCount,
  });
  if (conflictCount > 0) {
    observation.log.metric("sync.conflicts", conflictCount, { userId: user.id });
  }

  return observation.complete(NextResponse.json(payload), {
    userId: user.id,
    operationCount,
    appliedCount: applied.length,
    conflictCount,
    notebookCount: notebooks.size,
    pageCount: pages.size,
  });
}
