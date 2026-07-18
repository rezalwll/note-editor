import { offlineDb } from "@/lib/offline-db/db";
import type { SyncBootstrapPayload } from "@/lib/offline-db/types";
import {
  assertPrivateDataWritable,
  beginPrivateDataMutation,
} from "@/lib/private-data-epoch";

export function metaKey(userId: string, key: string) {
  return `${userId}:${key}`;
}

export async function setLastPullAt(userId: string, value: string) {
  const finishMutation = beginPrivateDataMutation(userId);
  try {
    await offlineDb.meta.put({ key: metaKey(userId, "lastPullAt"), value });
  } finally {
    finishMutation();
  }
}

export async function getLastPullAt(userId: string) {
  return (await offlineDb.meta.get(metaKey(userId, "lastPullAt")))?.value ?? null;
}

export async function clearOfflineStateForUser(userId: string) {
  await offlineDb.transaction(
    "rw",
    [
      offlineDb.notebooks,
      offlineDb.pages,
      offlineDb.queue,
      offlineDb.conflicts,
      offlineDb.meta,
    ],
    async () => {
      await offlineDb.notebooks.where("userId").equals(userId).delete();
      await offlineDb.pages.where("userId").equals(userId).delete();
      const meta = await offlineDb.meta.toArray();
      await offlineDb.queue.where("userId").equals(userId).delete();
      await offlineDb.conflicts.where("userId").equals(userId).delete();
      await Promise.all(
        meta
          .filter((item) => item.key.startsWith(`${userId}:`))
          .map((item) => offlineDb.meta.delete(item.key)),
      );
    },
  );
}

export async function seedOfflineBootstrap(
  userId: string,
  payload: SyncBootstrapPayload,
) {
  const finishMutation = beginPrivateDataMutation(userId);
  try {
    await offlineDb.transaction(
      "rw",
      offlineDb.notebooks,
      offlineDb.pages,
      offlineDb.meta,
      async () => {
        assertPrivateDataWritable(userId);
        await offlineDb.notebooks.where("userId").equals(userId).delete();
        await offlineDb.pages.where("userId").equals(userId).delete();
        await offlineDb.notebooks.bulkPut(payload.notebooks);
        await offlineDb.pages.bulkPut(payload.pages);
        if (!payload.hasMore) {
          await setLastPullAt(userId, payload.fetchedAt);
        }
      },
    );
  } finally {
    finishMutation();
  }
}

export async function hasOfflineBootstrap(userId: string) {
  const [notebookCount, pageCount] = await Promise.all([
    offlineDb.notebooks.where("userId").equals(userId).count(),
    offlineDb.pages.where("userId").equals(userId).count(),
  ]);

  return notebookCount > 0 || pageCount > 0;
}
