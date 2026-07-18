import { offlineDb } from "@/lib/offline-db/db";
import { dispatchSyncEvent } from "@/lib/offline-db/sync-events";
import type {
  ConflictRecord,
  LocalNotebook,
  LocalPage,
} from "@/lib/offline-db/types";
import {
  assertPrivateDataWritable,
  beginPrivateDataMutation,
} from "@/lib/private-data-epoch";

export async function upsertConflictRecords(userId: string, conflicts: ConflictRecord[]) {
  const finishMutation = beginPrivateDataMutation(userId);
  try {
    if (conflicts.length === 0) {
      return;
    }

    await offlineDb.conflicts.bulkPut(
      conflicts.map((conflict) => ({
        ...conflict,
        userId,
        id: `${userId}:${conflict.id}`,
      })),
    );
  } finally {
    finishMutation();
  }
}

export async function listConflictRecords(userId: string) {
  const conflicts = await offlineDb.conflicts
    .where("userId")
    .equals(userId)
    .sortBy("createdAt");
  return conflicts.reverse();
}

function isRemotePagePayload(
  payload: Record<string, unknown> | undefined,
): payload is LocalPage {
  return Boolean(
    payload &&
      typeof payload.id === "string" &&
      typeof payload.userId === "string" &&
      typeof payload.notebookId === "string" &&
      typeof payload.title === "string" &&
      typeof payload.bodyHtml === "string" &&
      typeof payload.bodyText === "string" &&
      typeof payload.updatedAt === "string",
  );
}

function normalizeRemotePagePayload(
  conflict: ConflictRecord,
): LocalPage | null {
  const payload = conflict.remotePayload;
  if (!payload) {
    return null;
  }

  const normalized = {
    ...payload,
    id: conflict.entityId,
    userId: conflict.userId,
  };

  return isRemotePagePayload(normalized) ? normalized : null;
}

function isRemoteNotebookPayload(
  payload: Record<string, unknown> | undefined,
): payload is LocalNotebook {
  return Boolean(
    payload &&
      typeof payload.id === "string" &&
      typeof payload.userId === "string" &&
      typeof payload.groupId === "string" &&
      typeof payload.name === "string" &&
      typeof payload.updatedAt === "string",
  );
}

function normalizeRemoteNotebookPayload(
  conflict: ConflictRecord,
): LocalNotebook | null {
  const payload = conflict.remotePayload;
  if (!payload) {
    return null;
  }

  const normalized = {
    ...payload,
    id: conflict.entityId,
    userId: conflict.userId,
  };

  return isRemoteNotebookPayload(normalized) ? normalized : null;
}

function getRemoteVersionTimestamp(conflict: ConflictRecord) {
  const updatedAt = conflict.remotePayload?.updatedAt;
  if (typeof updatedAt === "string" && Number.isFinite(Date.parse(updatedAt))) {
    return updatedAt;
  }

  const deletedAt = conflict.remotePayload?.deletedAt;
  if (typeof deletedAt === "string" && Number.isFinite(Date.parse(deletedAt))) {
    return deletedAt;
  }

  return null;
}

function normalizeRemoteTombstonePayload(conflict: ConflictRecord) {
  const payload = conflict.remotePayload;
  const deletedAt = payload?.deletedAt;
  if (
    payload?.isTombstone !== true ||
    typeof deletedAt !== "string" ||
    !Number.isFinite(Date.parse(deletedAt))
  ) {
    return null;
  }

  const updatedAt =
    typeof payload.updatedAt === "string" &&
    Number.isFinite(Date.parse(payload.updatedAt))
      ? payload.updatedAt
      : deletedAt;
  const normalized = {
    ...payload,
    id: conflict.entityId,
    userId: conflict.userId,
    updatedAt,
    deletedAt,
    isTombstone: true,
  };

  return normalized;
}

async function deleteEntityConflictState(conflict: ConflictRecord) {
  const [conflicts, queue] = await Promise.all([
    offlineDb.conflicts
      .where("[userId+entityType+entityId]")
      .equals([conflict.userId, conflict.entityType, conflict.entityId])
      .toArray(),
    offlineDb.queue
      .where("[userId+entityType+entityId]")
      .equals([conflict.userId, conflict.entityType, conflict.entityId])
      .toArray(),
  ]);

  await Promise.all([
    ...conflicts.map((item) => offlineDb.conflicts.delete(item.id)),
    ...queue.map((item) => offlineDb.queue.delete(item.id!)),
  ]);
}

export async function resolveConflictWithRemote(userId: string, conflictId: string) {
  const finishMutation = beginPrivateDataMutation(userId);
  try {
    const conflict = await offlineDb.conflicts.get(conflictId);
    if (!conflict || conflict.userId !== userId) {
      throw new Error("CONFLICT_NOT_FOUND");
    }

    assertPrivateDataWritable(userId);
    await offlineDb.transaction(
    "rw",
    offlineDb.notebooks,
    offlineDb.pages,
    offlineDb.queue,
    offlineDb.conflicts,
    async () => {
      assertPrivateDataWritable(userId);
      const remoteTombstone = normalizeRemoteTombstonePayload(conflict);
      if (remoteTombstone) {
        if (conflict.entityType === "page") {
          const localPage = await offlineDb.pages.get(conflict.entityId);
          if (localPage?.userId === userId) {
            await offlineDb.pages.delete(conflict.entityId);
          }
        } else {
          const localNotebook = await offlineDb.notebooks.get(conflict.entityId);
          const childPages = await offlineDb.pages
            .where("[userId+notebookId]")
            .equals([userId, conflict.entityId])
            .toArray();
          const childEntityKeys = childPages.map((page) => [
            userId,
            "page",
            page.id,
          ]);
          if (childEntityKeys.length > 0) {
            const [childQueue, childConflicts] = await Promise.all([
              offlineDb.queue
                .where("[userId+entityType+entityId]")
                .anyOf(childEntityKeys)
                .toArray(),
              offlineDb.conflicts
                .where("[userId+entityType+entityId]")
                .anyOf(childEntityKeys)
                .toArray(),
            ]);
            await offlineDb.pages.bulkDelete(childPages.map((page) => page.id));
            await offlineDb.queue.bulkDelete(childQueue.map((item) => item.id!));
            await offlineDb.conflicts.bulkDelete(
              childConflicts.map((item) => item.id),
            );
          }
          if (localNotebook?.userId === userId) {
            await offlineDb.notebooks.delete(conflict.entityId);
          }
        }
      } else if (conflict.entityType === "page") {
        const remotePage = normalizeRemotePagePayload(conflict);
        if (!remotePage) {
          throw new Error("INVALID_REMOTE_CONFLICT_PAYLOAD");
        }
        await offlineDb.pages.put({
          ...remotePage,
          syncStatus: "synced",
          lastSyncedAt: remotePage.updatedAt,
        });
      } else {
        const remoteNotebook = normalizeRemoteNotebookPayload(conflict);
        if (!remoteNotebook) {
          throw new Error("INVALID_REMOTE_CONFLICT_PAYLOAD");
        }
        await offlineDb.notebooks.put({
          ...remoteNotebook,
          syncStatus: "synced",
          lastSyncedAt: remoteNotebook.updatedAt,
        });
      }

      await deleteEntityConflictState(conflict);
    },
  );

    dispatchSyncEvent({
      type: "conflict-resolved",
      userId,
      pageId: conflict.entityType === "page" ? conflict.entityId : undefined,
      entityType: conflict.entityType,
      entityId: conflict.entityId,
      syncStatus: "synced",
    });
  } finally {
    finishMutation();
  }
}

export async function resolveConflictWithLocal(userId: string, conflictId: string) {
  const finishMutation = beginPrivateDataMutation(userId);
  try {
    const conflict = await offlineDb.conflicts.get(conflictId);
    if (!conflict || conflict.userId !== userId) {
      throw new Error("CONFLICT_NOT_FOUND");
    }

    assertPrivateDataWritable(userId);

    const remoteUpdatedAt = getRemoteVersionTimestamp(conflict);
    if (!remoteUpdatedAt) {
      throw new Error("INVALID_REMOTE_CONFLICT_PAYLOAD");
    }

  await offlineDb.transaction(
    "rw",
    offlineDb.notebooks,
    offlineDb.pages,
    offlineDb.queue,
    offlineDb.conflicts,
    async () => {
      assertPrivateDataWritable(userId);
      const local =
        conflict.entityType === "page"
          ? await offlineDb.pages.get(conflict.entityId)
          : await offlineDb.notebooks.get(conflict.entityId);
      if (!local || local.userId !== userId) {
        throw new Error("LOCAL_CONFLICT_ENTITY_NOT_FOUND");
      }

      await deleteEntityConflictState(conflict);
      const createdAt = new Date().toISOString();
      if (conflict.entityType === "page") {
        const page = { ...(local as LocalPage), syncStatus: "pending" as const };
        await offlineDb.pages.put(page);
        await offlineDb.queue.add({
          userId,
          entityType: "page",
          entityId: page.id,
          operation: "upsert",
          payload: page,
          baseUpdatedAt: remoteUpdatedAt,
          revision: 1,
          createdAt,
          status: "pending",
        });
      } else {
        const notebook = {
          ...(local as LocalNotebook),
          syncStatus: "pending" as const,
        };
        await offlineDb.notebooks.put(notebook);
        await offlineDb.queue.add({
          userId,
          entityType: "notebook",
          entityId: notebook.id,
          operation: "upsert",
          payload: notebook,
          baseUpdatedAt: remoteUpdatedAt,
          revision: 1,
          createdAt,
          status: "pending",
        });

        if (normalizeRemoteTombstonePayload(conflict)) {
          const childPages = await offlineDb.pages
            .where("[userId+notebookId]")
            .equals([userId, notebook.id])
            .toArray();
          const childEntityKeys = childPages.map((page) => [
            userId,
            "page",
            page.id,
          ]);
          if (childEntityKeys.length > 0) {
            const [childQueueItems, childConflictItems] = await Promise.all([
              offlineDb.queue
                .where("[userId+entityType+entityId]")
                .anyOf(childEntityKeys)
                .toArray(),
              offlineDb.conflicts
                .where("[userId+entityType+entityId]")
                .anyOf(childEntityKeys)
                .toArray(),
            ]);
            const childPageIdsWithConflict = new Set(
              childConflictItems.map((item) => item.entityId),
            );
            const recoverableQueueItems = childQueueItems.filter(
              (item) => !childPageIdsWithConflict.has(item.entityId),
            );
            await Promise.all([
              ...recoverableQueueItems.map((item) =>
                offlineDb.queue.update(item.id!, {
                  createdAt,
                  status: "pending",
                }),
              ),
              ...recoverableQueueItems.map((item) =>
                offlineDb.pages.update(item.entityId, {
                  syncStatus: "pending",
                }),
              ),
            ]);
          }
        }
      }
    },
  );

    dispatchSyncEvent({
      type: "conflict-resolved",
      userId,
      pageId: conflict.entityType === "page" ? conflict.entityId : undefined,
      entityType: conflict.entityType,
      entityId: conflict.entityId,
      syncStatus: "pending",
    });
  } finally {
    finishMutation();
  }
}

/**
 * Removes obsolete conflict metadata without deleting the local entity itself.
 * The matching blocked queue operation is intentionally removed so the same
 * stale record cannot be recreated on every sync. A later pull reconciles the
 * retained local cache with the current server version.
 */
export async function discardConflictRecords(
  userId: string,
  conflictIds: readonly string[],
) {
  const ids = [...new Set(conflictIds.filter(Boolean))];
  if (ids.length === 0) {
    return 0;
  }

  const finishMutation = beginPrivateDataMutation(userId);
  try {
    const records = await offlineDb.conflicts.bulkGet(ids);
    const conflicts = records.filter(
      (record): record is ConflictRecord => record?.userId === userId,
    );
    if (conflicts.length === 0) {
      return 0;
    }

    assertPrivateDataWritable(userId);
    await offlineDb.transaction(
      "rw",
      offlineDb.notebooks,
      offlineDb.pages,
      offlineDb.queue,
      offlineDb.conflicts,
      async () => {
        assertPrivateDataWritable(userId);
        for (const conflict of conflicts) {
          await deleteEntityConflictState(conflict);
          const table =
            conflict.entityType === "page"
              ? offlineDb.pages
              : offlineDb.notebooks;
          const local = await table.get(conflict.entityId);
          if (local?.userId === userId) {
            await table.update(conflict.entityId, { syncStatus: "synced" });
          }
        }
      },
    );

    for (const conflict of conflicts) {
      dispatchSyncEvent({
        type: "conflict-resolved",
        userId,
        pageId: conflict.entityType === "page" ? conflict.entityId : undefined,
        entityType: conflict.entityType,
        entityId: conflict.entityId,
        syncStatus: "synced",
      });
    }

    return conflicts.length;
  } finally {
    finishMutation();
  }
}
