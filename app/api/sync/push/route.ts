import { NextResponse } from "next/server";
import { z } from "zod";

import { requireUser } from "@/lib/auth";
import type {
  ConflictRecord,
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
import { moveNotebookToTrash, movePageToTrash } from "@/lib/trash";

const notebookPayloadSchema = z.object({
  id: z.string(),
  userId: z.string().optional(),
  groupId: z.string().nullable().optional(),
  name: z.string(),
  description: z.string().nullable().optional(),
  archived: z.boolean(),
  updatedAt: z.string(),
});

const pagePayloadSchema = z.object({
  id: z.string(),
  userId: z.string().optional(),
  notebookId: z.string(),
  title: z.string(),
  bodyHtml: z.string(),
  bodyText: z.string().optional(),
  archived: z.boolean(),
  updatedAt: z.string(),
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

export async function POST(request: Request) {
  const user = await requireUser();
  const parsed = pushSchema.safeParse(await request.json());

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid sync payload." }, { status: 400 });
  }

  const applied: SyncPushResult["applied"] = [];
  const conflicts: ConflictRecord[] = [];
  const notebooks = new Map<string, LocalNotebook>();
  const pages = new Map<string, LocalPage>();

  for (const item of parsed.data.operations) {
    if (item.entityType === "notebook") {
      const payload = notebookPayloadSchema.parse(item.payload);
      const existing = await prisma.notebook.findUnique({
        where: { id: payload.id },
      });

      if (existing && existing.userId !== user.id) {
        return NextResponse.json({ error: "Forbidden notebook scope." }, { status: 403 });
      }

      const targetGroupId = payload.groupId ?? existing?.groupId;

      if (!targetGroupId) {
        return NextResponse.json({ error: "Invalid notebook group." }, { status: 400 });
      }

      if (payload.groupId) {
        const group = await prisma.notebookGroup.findFirst({
          where: { id: payload.groupId, userId: user.id },
          select: { id: true },
        });

        if (!group) {
          return NextResponse.json({ error: "Invalid notebook group." }, { status: 400 });
        }
      }

      if (item.operation === "archive") {
        if (!existing) {
          return NextResponse.json(
            { error: "Notebook to archive was not found." },
            { status: 404 },
          );
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

      const notebook = existing
        ? await prisma.notebook.update({
            where: { id: payload.id },
            data: {
              userId: user.id,
              groupId: targetGroupId,
              name: payload.name,
              description: payload.description ?? null,
              archived: payload.archived,
            },
          })
        : await prisma.notebook.create({
            data: {
              id: payload.id,
              userId: user.id,
              groupId: targetGroupId,
              name: payload.name,
              description: payload.description ?? null,
              archived: payload.archived,
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

    const payload = pagePayloadSchema.parse(item.payload);
    const notebook = await prisma.notebook.findFirst({
      where: { id: payload.notebookId, userId: user.id },
      select: { id: true },
    });

    if (!notebook) {
      return NextResponse.json({ error: "Invalid page notebook." }, { status: 400 });
    }

    const existing = await prisma.page.findUnique({
      where: { id: payload.id },
    });

    if (existing && existing.userId !== user.id) {
      return NextResponse.json({ error: "Forbidden page scope." }, { status: 403 });
    }

    const freeformDocument = parseFreeformDocument(payload.bodyHtml);
    const safeHtml = freeformDocument
      ? payload.bodyHtml
      : sanitizeNoteHtml(payload.bodyHtml);
    const bodyText = freeformDocument
      ? extractFreeformPlainText(freeformDocument)
      : extractPlainText(safeHtml);

    if (item.operation === "archive") {
      if (!existing) {
        return NextResponse.json(
          { error: "Page to archive was not found." },
          { status: 404 },
        );
      }

      const moved = await movePageToTrash(user.id, existing.id);
      if (!moved) {
        return NextResponse.json(
          { error: "Page could not be moved to trash." },
          { status: 409 },
        );
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

    if (existing && item.baseUpdatedAt) {
      const serverUpdatedAt = existing.updatedAt.getTime();
      const baseUpdatedAt = new Date(item.baseUpdatedAt).getTime();

      if (Number.isFinite(serverUpdatedAt) && Number.isFinite(baseUpdatedAt) && serverUpdatedAt > baseUpdatedAt) {
        const recovered = await prisma.page.create({
          data: {
            userId: user.id,
            notebookId: existing.notebookId,
            title: `${existing.title} (Recovered)`,
            bodyHtml: existing.bodyHtml,
            bodyText: existing.bodyText,
          },
        });

        conflicts.push({
          id: `${payload.id}:${Date.now()}`,
          entityType: "page",
          entityId: payload.id,
          recoveredEntityId: recovered.id,
          createdAt: new Date().toISOString(),
          message: "Remote changes were recovered before applying the local version.",
        });
      }
    }

    const page = existing
      ? await prisma.page.update({
          where: { id: payload.id },
          data: {
            userId: user.id,
            notebookId: payload.notebookId,
            title: payload.title,
            bodyHtml: safeHtml,
            bodyText,
            archived: payload.archived,
          },
        })
        : await prisma.page.create({
          data: {
            id: payload.id,
            userId: user.id,
            notebookId: payload.notebookId,
            title: payload.title,
            bodyHtml: safeHtml,
            bodyText,
            archived: payload.archived,
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
    conflicts,
    notebooks: [...notebooks.values()],
    pages: [...pages.values()].map((page) =>
      conflicts.some((conflict) => conflict.entityId === page.id)
        ? { ...page, syncStatus: "conflict" }
        : page,
    ),
    pulledAt: new Date().toISOString(),
  };

  return NextResponse.json(payload);
}
