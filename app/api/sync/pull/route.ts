import { NextResponse } from "next/server";

import { requireUser } from "@/lib/auth";
import type { LocalNotebook, LocalPage, SyncBootstrapPayload } from "@/lib/offline-db/types";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  const user = await requireUser();
  const fetchedAt = new Date();

  const { searchParams } = new URL(request.url);
  const since = searchParams.get("since");
  const sinceDate = since ? new Date(since) : null;

  const notebookWhere = sinceDate
    ? { userId: user.id, updatedAt: { gt: sinceDate } }
    : { userId: user.id };
  const pageWhere = sinceDate
    ? {
        userId: user.id,
        updatedAt: { gt: sinceDate },
        notebook: { archived: false, userId: user.id },
      }
    : { userId: user.id, notebook: { archived: false, userId: user.id } };

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

  return NextResponse.json(payload);
}
