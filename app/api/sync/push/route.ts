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

const notebookPayloadSchema = z.object({
  id: z.string(),
  groupId: z.string().nullable().optional(),
  name: z.string(),
  description: z.string().nullable().optional(),
  archived: z.boolean(),
  updatedAt: z.string(),
});

const pagePayloadSchema = z.object({
  id: z.string(),
  notebookId: z.string(),
  title: z.string(),
  bodyHtml: z.string(),
  bodyText: z.string().optional(),
  archived: z.boolean(),
  updatedAt: z.string(),
});

const queueSchema = z.object({
  id: z.number().optional(),
  entityType: z.enum(["notebook", "page"]),
  entityId: z.string(),
  operation: z.enum(["upsert", "archive"]),
  baseUpdatedAt: z.string().nullable().optional(),
  payload: z.record(z.string(), z.unknown()),
  createdAt: z.string(),
  status: z.enum(["pending", "failed"]),
});

const pushSchema = z.object({
  operations: z.array(queueSchema),
});

function toNotebookResponse(notebook: {
  id: string;
  groupId: string | null;
  name: string;
  description: string | null;
  archived: boolean;
  updatedAt: Date;
}): LocalNotebook {
  return {
    id: notebook.id,
    groupId: notebook.groupId,
    name: notebook.name,
    description: notebook.description,
    archived: notebook.archived,
    updatedAt: notebook.updatedAt.toISOString(),
    lastSyncedAt: notebook.updatedAt.toISOString(),
    deletedAt: null,
    syncStatus: "synced",
  };
}

function toPageResponse(page: {
  id: string;
  notebookId: string;
  title: string;
  bodyHtml: string;
  bodyText: string;
  archived: boolean;
  updatedAt: Date;
}): LocalPage {
  return {
    id: page.id,
    notebookId: page.notebookId,
    title: page.title,
    bodyHtml: page.bodyHtml,
    bodyText: page.bodyText,
    archived: page.archived,
    updatedAt: page.updatedAt.toISOString(),
    lastSyncedAt: page.updatedAt.toISOString(),
    deletedAt: null,
    syncStatus: "synced",
  };
}

export async function POST(request: Request) {
  await requireUser();
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

      if (item.operation === "archive") {
        const archived = await prisma.notebook.update({
          where: { id: payload.id },
          data: { archived: true },
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

      const existing = await prisma.notebook.findUnique({
        where: { id: payload.id },
      });

      const notebook = existing
        ? await prisma.notebook.update({
            where: { id: payload.id },
            data: {
              groupId: payload.groupId ?? null,
              name: payload.name,
              description: payload.description ?? null,
              archived: payload.archived,
            },
          })
        : await prisma.notebook.create({
            data: {
              id: payload.id,
              groupId: payload.groupId ?? null,
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
    const freeformDocument = parseFreeformDocument(payload.bodyHtml);
    const safeHtml = freeformDocument
      ? payload.bodyHtml
      : sanitizeNoteHtml(payload.bodyHtml);
    const bodyText = freeformDocument
      ? extractFreeformPlainText(freeformDocument)
      : extractPlainText(safeHtml);

    if (item.operation === "archive") {
      const archived = await prisma.page.update({
        where: { id: payload.id },
        data: { archived: true },
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

    const existing = await prisma.page.findUnique({
      where: { id: payload.id },
    });

    if (existing && item.baseUpdatedAt) {
      const serverUpdatedAt = existing.updatedAt.getTime();
      const baseUpdatedAt = new Date(item.baseUpdatedAt).getTime();

      if (Number.isFinite(serverUpdatedAt) && Number.isFinite(baseUpdatedAt) && serverUpdatedAt > baseUpdatedAt) {
        const recovered = await prisma.page.create({
          data: {
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
