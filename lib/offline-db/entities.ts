import { offlineDb } from "@/lib/offline-db/db";
import { dispatchSyncEvent } from "@/lib/offline-db/sync-events";
import type { LocalPage, SyncStatus } from "@/lib/offline-db/types";
import {
  assertPrivateDataWritable,
  beginPrivateDataMutation,
} from "@/lib/private-data-epoch";

export async function upsertLocalPage(page: LocalPage) {
  const finishMutation = beginPrivateDataMutation(page.userId);
  try {
    await offlineDb.pages.put(page);
    dispatchSyncEvent({
      type: "page",
      userId: page.userId,
      pageId: page.id,
      syncStatus: page.syncStatus,
    });
  } finally {
    finishMutation();
  }
}

export async function getLocalPage(userId: string, pageId: string) {
  const page = await offlineDb.pages.get(pageId);
  return page?.userId === userId ? page : undefined;
}

export async function getLocalNotebooks(userId: string) {
  const notebooks = await offlineDb.notebooks.where("userId").equals(userId).toArray();
  const pages = await offlineDb.pages.where("userId").equals(userId).toArray();

  return notebooks
    .filter((notebook) => !notebook.archived)
    .map((notebook) => ({
      ...notebook,
      pages: pages
        .filter((page) => page.notebookId === notebook.id && !page.archived)
        .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt)),
    }))
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

export async function updateLocalSyncStatus(
  userId: string,
  pageId: string,
  syncStatus: SyncStatus,
  lastSyncedAt?: string | null,
) {
  const finishMutation = beginPrivateDataMutation(userId);
  try {
    const page = await getLocalPage(userId, pageId);

    if (!page) {
      return;
    }

    assertPrivateDataWritable(userId);
    await offlineDb.pages.update(pageId, {
      syncStatus,
      lastSyncedAt: lastSyncedAt ?? page.lastSyncedAt ?? null,
    });
    dispatchSyncEvent({ type: "page", userId, pageId, syncStatus, lastSyncedAt });
  } finally {
    finishMutation();
  }
}
