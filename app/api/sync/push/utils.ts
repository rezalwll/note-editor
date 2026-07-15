import type { z } from "zod";

import type {
  LocalNotebook,
  LocalPage,
  SyncPushResult,
} from "@/lib/offline-db/types";
import { prisma } from "@/lib/prisma";
import { TRASH_GROUP_SYSTEM_KEY } from "@/lib/trash";

import type {
  NotebookPayload,
  PagePayload,
  SyncQueueItem,
} from "./validation";

export const DEFAULT_NOTEBOOK_NAME = "مجموعه بدون عنوان";
export const DEFAULT_PAGE_TITLE = "صفحه بدون عنوان";

export function toNotebookResponse(notebook: {
  id: string;
  userId: string;
  groupId: string | null;
  name: string;
  description: string | null;
  archived: boolean;
  updatedAt: Date;
  deletedAt: Date | null;
}): LocalNotebook {
  return {
    id: notebook.id,
    userId: notebook.userId,
    groupId: notebook.groupId!,
    name: notebook.name,
    description: notebook.description,
    archived: notebook.archived,
    updatedAt: notebook.updatedAt.toISOString(),
    lastSyncedAt: notebook.updatedAt.toISOString(),
    deletedAt: notebook.deletedAt?.toISOString() ?? null,
    syncStatus: "synced",
  };
}

export function toPageResponse(page: {
  id: string;
  userId: string;
  notebookId: string;
  title: string;
  bodyHtml: string;
  bodyText: string;
  archived: boolean;
  updatedAt: Date;
  deletedAt: Date | null;
}): LocalPage {
  return {
    id: page.id,
    userId: page.userId,
    notebookId: page.notebookId,
    title: page.title,
    bodyHtml: page.bodyHtml,
    bodyText: page.bodyText,
    archived: page.archived,
    updatedAt: page.updatedAt.toISOString(),
    lastSyncedAt: page.updatedAt.toISOString(),
    deletedAt: page.deletedAt?.toISOString() ?? null,
    syncStatus: "synced",
  };
}

export function getIssueSummary(error: z.ZodError) {
  return error.issues.map((issue) => ({
    code: issue.code,
    message: issue.message,
    path: issue.path.join("."),
  }));
}

export function getItemSummary(item: Partial<SyncQueueItem>) {
  return {
    queueId: item.id,
    entityType: item.entityType,
    entityId: item.entityId,
    operation: item.operation,
  };
}

export function nonEmptyText(value: string | undefined, fallback: string) {
  const trimmedValue = value?.trim();
  return trimmedValue ? trimmedValue : fallback;
}

export function isStaleBase(updatedAt: Date, baseUpdatedAt?: string | null) {
  return Boolean(baseUpdatedAt && updatedAt.toISOString() !== baseUpdatedAt);
}

export function notebookPayloadMatches(
  existing: {
    groupId: string | null;
    name: string;
    description: string | null;
    archived: boolean;
  },
  payload: NotebookPayload,
  operation: SyncQueueItem["operation"],
) {
  if (operation === "archive") {
    return existing.archived;
  }

  return (
    (payload.groupId === undefined || payload.groupId === existing.groupId) &&
    (payload.name === undefined || payload.name?.trim() === existing.name) &&
    (payload.description === undefined ||
      payload.description === existing.description) &&
    (payload.archived === undefined || payload.archived === existing.archived)
  );
}

export function pagePayloadMatches(
  existing: {
    notebookId: string;
    title: string;
    bodyHtml: string;
    archived: boolean;
  },
  payload: PagePayload,
  operation: SyncQueueItem["operation"],
) {
  if (operation === "archive") {
    return existing.archived;
  }

  return (
    (payload.notebookId === undefined ||
      payload.notebookId === existing.notebookId) &&
    (payload.title === undefined || payload.title?.trim() === existing.title) &&
    (payload.bodyHtml === undefined || payload.bodyHtml === existing.bodyHtml) &&
    (payload.archived === undefined || payload.archived === existing.archived)
  );
}

export function createConflict(
  item: SyncQueueItem,
  localPayload: Record<string, unknown>,
  remotePayload: Record<string, unknown>,
) {
  return {
    id: `${item.entityType}:${item.entityId}:${remotePayload.updatedAt ?? "unknown"}`,
    entityType: item.entityType,
    entityId: item.entityId,
    createdAt: new Date().toISOString(),
    message: "Remote data changed after this edit started.",
    localPayload,
    remotePayload,
  } satisfies SyncPushResult["conflicts"][number];
}

export async function getFallbackNotebookGroupId(userId: string) {
  const activeGroup = await prisma.notebookGroup.findFirst({
    where: {
      userId,
      OR: [{ systemKey: null }, { systemKey: { not: TRASH_GROUP_SYSTEM_KEY } }],
    },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    select: { id: true },
  });

  if (activeGroup) {
    return activeGroup.id;
  }

  const anyGroup = await prisma.notebookGroup.findFirst({
    where: { userId },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    select: { id: true },
  });

  if (anyGroup) {
    return anyGroup.id;
  }

  const createdGroup = await prisma.notebookGroup.create({
    data: { userId, name: DEFAULT_NOTEBOOK_NAME },
    select: { id: true },
  });

  return createdGroup.id;
}

export async function getFallbackPageNotebookId(userId: string) {
  const activeNotebook = await prisma.notebook.findFirst({
    where: {
      userId,
      archived: false,
      deletedAt: null,
      group: {
        userId,
        OR: [{ systemKey: null }, { systemKey: { not: TRASH_GROUP_SYSTEM_KEY } }],
      },
    },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    select: { id: true },
  });

  if (activeNotebook) {
    return activeNotebook.id;
  }

  const fallbackGroupId = await getFallbackNotebookGroupId(userId);
  const fallbackNotebook = await prisma.notebook.create({
    data: {
      userId,
      groupId: fallbackGroupId,
      name: DEFAULT_NOTEBOOK_NAME,
    },
    select: { id: true },
  });

  return fallbackNotebook.id;
}
