import { NextResponse } from "next/server";
import { z } from "zod";

import { requireUser } from "@/lib/auth";
import type {
  LocalNotebook,
  LocalPage,
  SyncPushResult,
} from "@/lib/offline-db/types";
import {
  extractFreeformPlainText,
  extractPlainText,
  parseFreeformDocument,
  sanitizeNoteHtml,
} from "@/lib/notes";
import { prisma } from "@/lib/prisma";
import {
  moveNotebookToTrash,
  movePageToTrash,
  TRASH_GROUP_SYSTEM_KEY,
} from "@/lib/trash";

const DEFAULT_NOTEBOOK_NAME = "مجموعه بدون عنوان";
const DEFAULT_PAGE_TITLE = "صفحه بدون عنوان";

const optionalStringSchema = z
  .union([z.string(), z.null()])
  .optional()
  .transform((value) => value ?? undefined);

const optionalBooleanSchema = z
  .union([z.boolean(), z.null()])
  .optional()
  .transform((value) => value ?? undefined);

const notebookPayloadSchema = z.object({
  id: optionalStringSchema,
  userId: z.string().optional(),
  groupId: z.string().nullable().optional(),
  name: optionalStringSchema,
  description: z.string().nullable().optional(),
  archived: optionalBooleanSchema,
  updatedAt: optionalStringSchema,
});

const pagePayloadSchema = z.object({
  id: optionalStringSchema,
  userId: z.string().optional(),
  notebookId: optionalStringSchema,
  title: optionalStringSchema,
  bodyHtml: optionalStringSchema,
  bodyText: z.string().optional(),
  archived: optionalBooleanSchema,
  updatedAt: optionalStringSchema,
});

const queueIdSchema = z
  .union([z.number(), z.string()])
  .optional()
  .transform((value) => {
    if (value === undefined) {
      return undefined;
    }

    const numericValue = typeof value === "number" ? value : Number(value);
    return Number.isFinite(numericValue) ? numericValue : undefined;
  });

const optionalDateStringSchema = z
  .union([z.string(), z.date(), z.null()])
  .optional()
  .transform((value) => {
    if (value === undefined || value === null) {
      return value;
    }

    return value instanceof Date ? value.toISOString() : value;
  });

const queueSchema = z.object({
  id: queueIdSchema,
  entityType: z.enum(["notebook", "page"]),
  entityId: z.string(),
  operation: z.enum(["upsert", "archive"]),
  baseUpdatedAt: optionalDateStringSchema,
  payload: z.unknown(),
  createdAt: optionalDateStringSchema.transform((value) => value ?? new Date().toISOString()),
  status: z
    .enum(["pending", "failed", "synced", "conflict"])
    .optional()
    .catch("pending")
    .transform((status) => (status === "failed" ? "failed" : "pending")),
});

const pushSchema = z.object({
  operations: z.array(queueSchema),
});

function toNotebookResponse(notebook: {
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

function toPageResponse(page: {
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

function getIssueSummary(error: z.ZodError) {
  return error.issues.map((issue) => ({
    code: issue.code,
    message: issue.message,
    path: issue.path.join("."),
  }));
}

function getItemSummary(item: {
  id?: number;
  entityType?: string;
  entityId?: string;
  operation?: string;
}) {
  return {
    queueId: item.id,
    entityType: item.entityType,
    entityId: item.entityId,
    operation: item.operation,
  };
}

function syncPushError(
  message: string,
  status: number,
  item?: {
    id?: number;
    entityType?: string;
    entityId?: string;
    operation?: string;
  },
  issues?: ReturnType<typeof getIssueSummary>,
) {
  console.warn("Rejected sync push operation.", {
    message,
    item: item ? getItemSummary(item) : undefined,
    issues,
  });

  return NextResponse.json(
    {
      error: message,
      issues,
    },
    { status },
  );
}

function nonEmptyText(value: string | undefined, fallback: string) {
  const trimmedValue = value?.trim();
  return trimmedValue ? trimmedValue : fallback;
}

async function getFallbackNotebookGroupId(userId: string) {
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
    data: {
      userId,
      name: DEFAULT_NOTEBOOK_NAME,
    },
    select: { id: true },
  });

  return createdGroup.id;
}

async function getFallbackPageNotebookId(userId: string) {
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

export async function POST(request: Request) {
  const user = await requireUser();
  const parsed = pushSchema.safeParse(await request.json());

  if (!parsed.success) {
    return syncPushError("Invalid sync payload.", 400, undefined, getIssueSummary(parsed.error));
  }

  const applied: SyncPushResult["applied"] = [];
  const notebooks = new Map<string, LocalNotebook>();
  const pages = new Map<string, LocalPage>();

  for (const item of parsed.data.operations) {
    if (item.entityType === "notebook") {
      const parsedNotebook = notebookPayloadSchema.safeParse(item.payload);

      if (!parsedNotebook.success) {
        return syncPushError(
          "Invalid notebook sync payload.",
          400,
          item,
          getIssueSummary(parsedNotebook.error),
        );
      }

      const payload = parsedNotebook.data;
      const notebookId = payload.id ?? item.entityId;
      const existing = await prisma.notebook.findUnique({
        where: { id: notebookId },
      });

      if (existing && existing.userId !== user.id) {
        return syncPushError("Forbidden notebook scope.", 403, item);
      }

      if (item.operation === "archive") {
        if (!existing) {
          applied.push({
            queueId: item.id,
            entityType: item.entityType,
            entityId: item.entityId,
            operation: item.operation,
          });
          continue;
        }

        await moveNotebookToTrash(user.id, existing.id);
        const archived = await prisma.notebook.findUniqueOrThrow({
          where: { id: existing.id },
        });

        notebooks.set(archived.id, toNotebookResponse(archived));
        applied.push({
          queueId: item.id,
          entityType: item.entityType,
          entityId: item.entityId,
          operation: item.operation,
        });
        continue;
      }

      const payloadGroup = payload.groupId
        ? await prisma.notebookGroup.findFirst({
            where: { id: payload.groupId, userId: user.id },
            select: { id: true },
          })
        : null;

      if (payload.groupId && !payloadGroup) {
        return syncPushError("Invalid notebook group.", 400, item);
      }

      const targetGroupId =
        payloadGroup?.id ?? existing?.groupId ?? (await getFallbackNotebookGroupId(user.id));

      const nextName = nonEmptyText(payload.name, existing?.name ?? DEFAULT_NOTEBOOK_NAME);
      const nextDescription =
        payload.description === undefined
          ? (existing?.description ?? null)
          : (payload.description ?? null);
      const nextArchived = payload.archived ?? existing?.archived ?? false;

      const notebook = existing
        ? await prisma.notebook.update({
            where: { id: notebookId },
            data: {
              userId: user.id,
              groupId: targetGroupId,
              name: nextName,
              description: nextDescription,
              archived: nextArchived,
            },
          })
        : await prisma.notebook.create({
            data: {
              id: notebookId,
              userId: user.id,
              groupId: targetGroupId,
              name: nextName,
              description: nextDescription,
              archived: nextArchived,
            },
          });

      notebooks.set(notebook.id, toNotebookResponse(notebook));
      applied.push({
        queueId: item.id,
        entityType: item.entityType,
        entityId: item.entityId,
        operation: item.operation,
      });
      continue;
    }

    const parsedPage = pagePayloadSchema.safeParse(item.payload);

    if (!parsedPage.success) {
      return syncPushError(
        "Invalid page sync payload.",
        400,
        item,
        getIssueSummary(parsedPage.error),
      );
    }

    const payload = parsedPage.data;
    const pageId = payload.id ?? item.entityId;
    const existing = await prisma.page.findUnique({
      where: { id: pageId },
    });

    if (existing && existing.userId !== user.id) {
      return syncPushError("Forbidden page scope.", 403, item);
    }

    if (item.operation === "archive" && !existing) {
      applied.push({
        queueId: item.id,
        entityType: item.entityType,
        entityId: item.entityId,
        operation: item.operation,
      });
      continue;
    }

    let targetNotebookId = payload.notebookId ?? existing?.notebookId;
    let notebook = targetNotebookId
      ? await prisma.notebook.findFirst({
          where: { id: targetNotebookId, userId: user.id },
          select: { id: true },
        })
      : null;

    if (!notebook && existing) {
      targetNotebookId = existing.notebookId;
      notebook = await prisma.notebook.findFirst({
        where: { id: existing.notebookId, userId: user.id },
        select: { id: true },
      });
    }

    if (!notebook && item.operation === "upsert") {
      targetNotebookId = await getFallbackPageNotebookId(user.id);
      notebook = { id: targetNotebookId };
    }

    if (!notebook || !targetNotebookId) {
      return syncPushError("Invalid page notebook.", 400, item);
    }

    const rawBodyHtml = payload.bodyHtml ?? existing?.bodyHtml ?? "";
    const freeformDocument = parseFreeformDocument(rawBodyHtml);
    const safeHtml = freeformDocument ? rawBodyHtml : sanitizeNoteHtml(rawBodyHtml);
    const bodyText = freeformDocument
      ? extractFreeformPlainText(freeformDocument)
      : extractPlainText(safeHtml);
    const nextTitle = nonEmptyText(payload.title, existing?.title ?? DEFAULT_PAGE_TITLE);
    const nextArchived = payload.archived ?? existing?.archived ?? false;

    if (item.operation === "archive") {
      if (!existing) {
        applied.push({
          queueId: item.id,
          entityType: item.entityType,
          entityId: item.entityId,
          operation: item.operation,
        });
        continue;
      }

      const moved = await movePageToTrash(user.id, existing.id);
      if (!moved) {
        if (existing.deletedAt) {
          pages.set(existing.id, toPageResponse(existing));
          applied.push({
            queueId: item.id,
            entityType: item.entityType,
            entityId: item.entityId,
            operation: item.operation,
          });
          continue;
        }

        return syncPushError("Page could not be moved to trash.", 409, item);
      }

      const archived = await prisma.page.findUniqueOrThrow({
        where: { id: existing.id },
      });

      pages.set(archived.id, toPageResponse(archived));
      applied.push({
        queueId: item.id,
        entityType: item.entityType,
        entityId: item.entityId,
        operation: item.operation,
      });
      continue;
    }

    const page = existing
      ? await prisma.page.update({
          where: { id: pageId },
          data: {
            userId: user.id,
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
            userId: user.id,
            notebookId: targetNotebookId,
            title: nextTitle,
            bodyHtml: safeHtml,
            bodyText,
            archived: nextArchived,
          },
        });

    pages.set(page.id, toPageResponse(page));
    applied.push({
      queueId: item.id,
      entityType: item.entityType,
      entityId: item.entityId,
      operation: item.operation,
    });
  }

  const payload: SyncPushResult = {
    applied,
    conflicts: [],
    notebooks: [...notebooks.values()],
    pages: [...pages.values()],
    pulledAt: new Date().toISOString(),
  };

  return NextResponse.json(payload);
}
