import { NextResponse } from "next/server";

import { requireUser } from "@/lib/auth";
import type {
  LocalNotebook,
  LocalPage,
  SyncPushResult,
} from "@/lib/offline-db/types";
import { observeRequest } from "@/lib/request-observability";

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

  const applied: SyncPushResult["applied"] = [];
  const conflicts: SyncPushResult["conflicts"] = [];
  const notebooks = new Map<string, LocalNotebook>();
  const pages = new Map<string, LocalPage>();
  const context = { userId: user.id, applied, conflicts, notebooks, pages };

  try {
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
