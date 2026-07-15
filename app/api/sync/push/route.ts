import { NextResponse } from "next/server";

import { requireUser } from "@/lib/auth";
import type {
  LocalNotebook,
  LocalPage,
  SyncPushResult,
} from "@/lib/offline-db/types";
import { logger } from "@/lib/logger";

import {
  processNotebookOperation,
  processPageOperation,
  type PushProcessingError,
} from "./processors";
import { pushSchema, type SyncQueueItem } from "./validation";
import { getIssueSummary, getItemSummary } from "./utils";

function syncPushError(
  message: string,
  status: number,
  item?: SyncQueueItem,
  issues?: ReturnType<typeof getIssueSummary>,
) {
  logger.warn("Rejected sync push operation", {
    message,
    item: item ? getItemSummary(item) : undefined,
    issues,
  });

  return NextResponse.json({ error: message, issues }, { status });
}

function processingErrorResponse(error: PushProcessingError) {
  return syncPushError(error.message, error.status, error.item, error.issues);
}

export async function POST(request: Request) {
  const user = await requireUser();
  const parsed = pushSchema.safeParse(await request.json());

  if (!parsed.success) {
    return syncPushError(
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

  for (const item of parsed.data.operations) {
    const error =
      item.entityType === "notebook"
        ? await processNotebookOperation(item, context)
        : await processPageOperation(item, context);

    if (error) {
      return processingErrorResponse(error);
    }
  }

  const payload: SyncPushResult = {
    applied,
    conflicts,
    notebooks: [...notebooks.values()],
    pages: [...pages.values()],
    pulledAt: new Date().toISOString(),
  };

  return NextResponse.json(payload);
}
