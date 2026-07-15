import { NextResponse } from "next/server";

import { requireUser } from "@/lib/auth";
import type { LocalNotebook, LocalPage, SyncBootstrapPayload } from "@/lib/offline-db/types";
import { prisma } from "@/lib/prisma";
import { observeRequest } from "@/lib/request-observability";

export async function GET(request: Request) {
  const observation = observeRequest(request, "/api/sync/bootstrap");
  const user = await requireUser();
  const fetchedAt = new Date();

  let notebooks;
  let pages;
  try {
    [notebooks, pages] = await Promise.all([
      prisma.notebook.findMany({
        where: { archived: false, userId: user.id },
        orderBy: { updatedAt: "desc" },
      }),
      prisma.page.findMany({
        where: {
          userId: user.id,
          archived: false,
          notebook: { archived: false, userId: user.id },
        },
        orderBy: { updatedAt: "desc" },
      }),
    ]);
  } catch (error) {
    return observation.failure(error, { userId: user.id });
  }

  const payload: SyncBootstrapPayload = {
    fetchedAt: fetchedAt.toISOString(),
    notebooks: notebooks.map<LocalNotebook>((notebook) => ({
      id: notebook.id,
      userId: user.id,
      groupId: notebook.groupId!,
      name: notebook.name,
      description: notebook.description,
      archived: notebook.archived,
      updatedAt: notebook.updatedAt.toISOString(),
      lastSyncedAt: notebook.updatedAt.toISOString(),
      deletedAt: notebook.deletedAt?.toISOString() ?? null,
      syncStatus: "synced",
    })),
    pages: pages.map<LocalPage>((page) => ({
      id: page.id,
      userId: user.id,
      notebookId: page.notebookId,
      title: page.title,
      bodyHtml: page.bodyHtml,
      bodyText: page.bodyText,
      archived: page.archived,
      updatedAt: page.updatedAt.toISOString(),
      lastSyncedAt: page.updatedAt.toISOString(),
      deletedAt: page.deletedAt?.toISOString() ?? null,
      syncStatus: "synced",
    })),
  };

  const operationCount = payload.notebooks.length + payload.pages.length;
  observation.log.metric("sync.bootstrap.operations", operationCount, {
    userId: user.id,
    notebookCount: payload.notebooks.length,
    pageCount: payload.pages.length,
  });
  return observation.complete(NextResponse.json(payload), {
    userId: user.id,
    operationCount,
    notebookCount: payload.notebooks.length,
    pageCount: payload.pages.length,
  });
}
