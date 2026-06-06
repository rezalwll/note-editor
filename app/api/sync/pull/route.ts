import { NextResponse } from "next/server";

import { requireUser } from "@/lib/auth";
import type { LocalNotebook, LocalPage, SyncBootstrapPayload } from "@/lib/offline-db/types";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  await requireUser();

  const { searchParams } = new URL(request.url);
  const since = searchParams.get("since");
  const sinceDate = since ? new Date(since) : null;

  const notebookWhere = sinceDate ? { updatedAt: { gt: sinceDate } } : {};
  const pageWhere = sinceDate
    ? {
        updatedAt: { gt: sinceDate },
        notebook: { archived: false },
      }
    : { notebook: { archived: false } };

  const [notebooks, pages] = await Promise.all([
    prisma.notebook.findMany({
      where: notebookWhere,
      orderBy: { updatedAt: "desc" },
    }),
    prisma.page.findMany({
      where: pageWhere,
      orderBy: { updatedAt: "desc" },
    }),
  ]);

  const payload: SyncBootstrapPayload = {
    fetchedAt: new Date().toISOString(),
    notebooks: notebooks.map<LocalNotebook>((notebook) => ({
      id: notebook.id,
      name: notebook.name,
      description: notebook.description,
      archived: notebook.archived,
      updatedAt: notebook.updatedAt.toISOString(),
      lastSyncedAt: notebook.updatedAt.toISOString(),
      deletedAt: null,
      syncStatus: "synced",
    })),
    pages: pages.map<LocalPage>((page) => ({
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
    })),
  };

  return NextResponse.json(payload);
}
