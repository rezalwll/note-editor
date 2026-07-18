import { offlineDb } from "@/lib/offline-db/db";
import { setLastPullAt } from "@/lib/offline-db/state";
import { applyRemoteTombstones } from "@/lib/offline-db/tombstones";
import type { SyncBootstrapPayload, SyncStatus } from "@/lib/offline-db/types";
import {
  assertPrivateDataWritable,
  beginPrivateDataMutation,
} from "@/lib/private-data-epoch";

export async function applyPullChanges(
  userId: string,
  payload: SyncBootstrapPayload,
) {
  const finishMutation = beginPrivateDataMutation(userId);
  try {
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
        assertPrivateDataWritable(userId);
      const [localNotebooks, localPages] = await Promise.all([
        offlineDb.notebooks.bulkGet(payload.notebooks.map((item) => item.id)),
        offlineDb.pages.bulkGet(payload.pages.map((item) => item.id)),
      ]);
      const canApplyRemote = (local: { syncStatus: SyncStatus } | undefined) =>
        !local || local.syncStatus === "synced";
      const notebooksToApply = payload.notebooks.filter((_, index) =>
        canApplyRemote(localNotebooks[index]),
      );
      const pagesToApply = payload.pages.filter((_, index) =>
        canApplyRemote(localPages[index]),
      );

      if (notebooksToApply.length > 0) {
        await offlineDb.notebooks.bulkPut(notebooksToApply);
      }

      if (pagesToApply.length > 0) {
        await offlineDb.pages.bulkPut(pagesToApply);
      }

      await applyRemoteTombstones(userId, payload.tombstones ?? []);

      if (!payload.hasMore) {
        await setLastPullAt(userId, payload.fetchedAt);
      }
      },
    );
  } finally {
    finishMutation();
  }
}
