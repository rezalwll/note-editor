import type { Prisma } from "@/generated/prisma/client";
import type {
  LocalNotebook,
  LocalPage,
  SyncBootstrapPayload,
  SyncTombstone,
} from "@/lib/offline-db/types";
import { prisma } from "@/lib/prisma";
import {
  advanceSyncCursor,
  encodeSyncCursor,
  stableCursorFilter,
  type SyncCursor,
} from "@/lib/sync/cursor";

function toLocalNotebook(notebook: {
  id: string;
  userId: string;
  groupId: string;
  name: string;
  description: string | null;
  archived: boolean;
  updatedAt: Date;
  deletedAt: Date | null;
}): LocalNotebook {
  const updatedAt = notebook.updatedAt.toISOString();
  return {
    id: notebook.id,
    userId: notebook.userId,
    groupId: notebook.groupId,
    name: notebook.name,
    description: notebook.description,
    archived: notebook.archived,
    updatedAt,
    lastSyncedAt: updatedAt,
    deletedAt: notebook.deletedAt?.toISOString() ?? null,
    syncStatus: "synced",
  };
}

function toLocalPage(page: {
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
  const updatedAt = page.updatedAt.toISOString();
  return {
    id: page.id,
    userId: page.userId,
    notebookId: page.notebookId,
    title: page.title,
    bodyHtml: page.bodyHtml,
    bodyText: page.bodyText,
    archived: page.archived,
    updatedAt,
    lastSyncedAt: updatedAt,
    deletedAt: page.deletedAt?.toISOString() ?? null,
    syncStatus: "synced",
  };
}

function pageResult(
  cursor: SyncCursor,
  items: Array<{ id: string; timestamp: string }>,
  hasMoreInPhase: boolean,
) {
  const next = advanceSyncCursor(cursor, items, hasMoreInPhase);
  return {
    fetchedAt: cursor.snapshotAt,
    hasMore: Boolean(next),
    nextCursor: next ? encodeSyncCursor(next) : null,
  };
}

export async function getSyncPage(
  userId: string,
  initialCursor: SyncCursor,
  limit: number,
): Promise<SyncBootstrapPayload> {
  let cursor = initialCursor;

  while (true) {
    if (cursor.phase === "notebooks") {
      const where: Prisma.NotebookWhereInput = {
        userId,
        ...(cursor.mode === "bootstrap" ? { archived: false } : {}),
        ...stableCursorFilter("updatedAt", cursor),
      };
      const rows = await prisma.notebook.findMany({
        where,
        orderBy: [{ updatedAt: "asc" }, { id: "asc" }],
        take: limit + 1,
      });
      const hasMoreInPhase = rows.length > limit;
      const selected = rows.slice(0, limit);
      if (selected.length > 0 || hasMoreInPhase) {
        return {
          ...pageResult(
            cursor,
            selected.map((item) => ({
              id: item.id,
              timestamp: item.updatedAt.toISOString(),
            })),
            hasMoreInPhase,
          ),
          notebooks: selected.map(toLocalNotebook),
          pages: [],
          tombstones: [],
        };
      }

      const next = advanceSyncCursor(cursor, [], false);
      if (!next) {
        return {
          fetchedAt: cursor.snapshotAt,
          notebooks: [],
          pages: [],
          tombstones: [],
          hasMore: false,
          nextCursor: null,
        };
      }
      cursor = next;
      continue;
    }

    if (cursor.phase === "pages") {
      const where: Prisma.PageWhereInput = {
        userId,
        ...(cursor.mode === "bootstrap" ? { archived: false } : {}),
        notebook: { archived: false, userId },
        ...stableCursorFilter("updatedAt", cursor),
      };
      const rows = await prisma.page.findMany({
        where,
        orderBy: [{ updatedAt: "asc" }, { id: "asc" }],
        take: limit + 1,
      });
      const hasMoreInPhase = rows.length > limit;
      const selected = rows.slice(0, limit);
      if (selected.length > 0 || hasMoreInPhase) {
        return {
          ...pageResult(
            cursor,
            selected.map((item) => ({
              id: item.id,
              timestamp: item.updatedAt.toISOString(),
            })),
            hasMoreInPhase,
          ),
          notebooks: [],
          pages: selected.map(toLocalPage),
          tombstones: [],
        };
      }

      const next = advanceSyncCursor(cursor, [], false);
      if (!next) {
        return {
          fetchedAt: cursor.snapshotAt,
          notebooks: [],
          pages: [],
          tombstones: [],
          hasMore: false,
          nextCursor: null,
        };
      }
      cursor = next;
      continue;
    }

    const where: Prisma.EntityTombstoneWhereInput = {
      userId,
      ...stableCursorFilter("deletedAt", cursor),
    };
    const rows = await prisma.entityTombstone.findMany({
      where,
      orderBy: [{ deletedAt: "asc" }, { id: "asc" }],
      take: limit + 1,
    });
    const hasMoreInPhase = rows.length > limit;
    const selected = rows.slice(0, limit);
    const tombstones = selected
      .filter(
        (item): item is typeof item & { entityType: SyncTombstone["entityType"] } =>
          item.entityType === "notebook" || item.entityType === "page",
      )
      .map<SyncTombstone>((item) => ({
        id: item.id,
        entityType: item.entityType,
        entityId: item.entityId,
        deletedAt: item.deletedAt.toISOString(),
      }));

    return {
      ...pageResult(
        cursor,
        selected.map((item) => ({
          id: item.id,
          timestamp: item.deletedAt.toISOString(),
        })),
        hasMoreInPhase,
      ),
      notebooks: [],
      pages: [],
      tombstones,
    };
  }
}
