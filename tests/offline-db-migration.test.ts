import "fake-indexeddb/auto";

import Dexie from "dexie";
import { afterEach, describe, expect, it } from "vitest";

import { NotavaOfflineDb } from "@/lib/offline-db/db";
import type {
  ConflictRecord,
  LocalNotebook,
  LocalPage,
  SyncQueueItem,
} from "@/lib/offline-db/types";

const legacyStores = {
  notebooks: "id, userId, [userId+updatedAt], syncStatus, lastSyncedAt, deletedAt",
  pages:
    "id, userId, notebookId, [userId+notebookId], [userId+updatedAt], syncStatus, lastSyncedAt, deletedAt",
  queue:
    "++id, userId, [userId+status], [userId+status+createdAt], [userId+entityType+entityId], createdAt, status",
  conflicts:
    "id, userId, [userId+createdAt], [userId+entityType+entityId], createdAt",
  meta: "key",
};

const databaseNames: string[] = [];

afterEach(async () => {
  await Promise.all(databaseNames.splice(0).map((name) => Dexie.delete(name)));
});

describe("offline database migrations", () => {
  it("upgrades v3 by atomically consolidating every legacy queue entity", async () => {
    const name = `notava-offline-v4-${crypto.randomUUID()}`;
    databaseNames.push(name);
    const legacyDb = new Dexie(name);
    legacyDb.version(3).stores(legacyStores);
    await legacyDb.open();
    const legacyQueue = legacyDb.table<SyncQueueItem, number>("queue");

    const latestPageId = await legacyQueue.add({
      userId: "user-1",
      entityType: "page",
      entityId: "page-1",
      operation: "archive",
      payload: { title: "latest", archived: true },
      baseUpdatedAt: "2026-07-15T11:00:00.000Z",
      revision: 7,
      createdAt: "2026-07-15T11:00:00.000Z",
      status: "pending",
    });
    const stablePageId = await legacyQueue.add({
      userId: "user-1",
      entityType: "page",
      entityId: "page-1",
      operation: "upsert",
      payload: { title: "first" },
      baseUpdatedAt: null,
      revision: 1,
      createdAt: "2026-07-15T10:00:00.000Z",
      status: "failed",
    });
    const highRevisionPageId = await legacyQueue.add({
      userId: "user-1",
      entityType: "page",
      entityId: "page-1",
      operation: "upsert",
      payload: { title: "high revision, but not latest" },
      baseUpdatedAt: "2026-07-15T10:30:00.000Z",
      revision: 12,
      createdAt: "2026-07-15T10:30:00.000Z",
      status: "failed",
    });
    const stableNotebookId = await legacyQueue.add({
      userId: "user-2",
      entityType: "notebook",
      entityId: "notebook-1",
      operation: "upsert",
      payload: { name: "old" },
      createdAt: "2026-07-15T09:00:00.000Z",
      status: "failed",
    });
    const latestNotebookId = await legacyQueue.add({
      userId: "user-2",
      entityType: "notebook",
      entityId: "notebook-1",
      operation: "archive",
      payload: { name: "latest", archived: true },
      baseUpdatedAt: "2026-07-15T09:30:00.000Z",
      createdAt: "2026-07-15T10:00:00.000Z",
      status: "pending",
    });
    const uniqueId = await legacyQueue.add({
      userId: "user-1",
      entityType: "page",
      entityId: "unique-page",
      operation: "upsert",
      payload: { title: "unique" },
      createdAt: "2026-07-15T12:00:00.000Z",
      status: "pending",
    });
    legacyDb.close();

    const upgradedDb = new NotavaOfflineDb(name);
    await upgradedDb.open();

    expect(upgradedDb.verno).toBe(5);
    expect(await upgradedDb.queue.toArray()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: stablePageId,
          userId: "user-1",
          entityType: "page",
          entityId: "page-1",
          operation: "archive",
          payload: { title: "latest", archived: true },
          baseUpdatedAt: null,
          revision: 12,
          createdAt: "2026-07-15T10:00:00.000Z",
          status: "pending",
        }),
        expect.objectContaining({
          id: stableNotebookId,
          userId: "user-2",
          entityType: "notebook",
          entityId: "notebook-1",
          operation: "archive",
          payload: { name: "latest", archived: true },
          baseUpdatedAt: "2026-07-15T09:30:00.000Z",
          createdAt: "2026-07-15T09:00:00.000Z",
          status: "pending",
        }),
        expect.objectContaining({ id: uniqueId, entityId: "unique-page" }),
      ]),
    );
    expect(await upgradedDb.queue.count()).toBe(3);
    expect(await upgradedDb.queue.get(latestPageId)).toBeUndefined();
    expect(await upgradedDb.queue.get(highRevisionPageId)).toBeUndefined();
    expect(await upgradedDb.queue.get(latestNotebookId)).toBeUndefined();
    expect(await upgradedDb.meta.get("user-1:queueCoalescedV4")).toBeDefined();
    expect(await upgradedDb.meta.get("user-2:queueCoalescedV4")).toBeDefined();

    upgradedDb.close();
    const reopenedDb = new NotavaOfflineDb(name);
    await reopenedDb.open();
    expect(await reopenedDb.queue.count()).toBe(3);
    reopenedDb.close();
  });

  it("clears pre-upgrade conflicts while preserving cached entities and live work", async () => {
    const name = `notava-offline-v5-${crypto.randomUUID()}`;
    databaseNames.push(name);
    const legacyDb = new Dexie(name);
    legacyDb.version(4).stores(legacyStores);
    await legacyDb.open();

    const legacyPage: LocalPage = {
      id: "page-1",
      userId: "user-1",
      notebookId: "notebook-1",
      title: "Local page",
      bodyHtml: "<p>Local page</p>",
      bodyText: "Local page",
      archived: false,
      updatedAt: "2026-07-17T10:00:00.000Z",
      syncStatus: "conflict",
    };
    const legacyNotebook: LocalNotebook = {
      id: "notebook-1",
      userId: "user-1",
      groupId: "group-1",
      name: "Local notebook",
      archived: false,
      updatedAt: "2026-07-17T10:00:00.000Z",
      syncStatus: "conflict",
    };
    await legacyDb.table<LocalPage, string>("pages").put(legacyPage);
    await legacyDb
      .table<LocalNotebook, string>("notebooks")
      .put(legacyNotebook);
    await legacyDb.table<ConflictRecord, string>("conflicts").bulkPut([
      {
        id: "old-page-conflict",
        userId: "user-1",
        entityType: "page",
        entityId: "page-1",
        createdAt: "2026-07-17T10:00:00.000Z",
        message: "legacy",
      },
      {
        id: "old-notebook-conflict",
        userId: "user-1",
        entityType: "notebook",
        entityId: "notebook-1",
        createdAt: "2026-07-17T10:00:00.000Z",
        message: "legacy",
      },
    ]);
    const queue = legacyDb.table<SyncQueueItem, number>("queue");
    const blockedQueueId = await queue.add({
      userId: "user-1",
      entityType: "page",
      entityId: "page-1",
      operation: "upsert",
      payload: legacyPage,
      createdAt: "2026-07-17T10:00:00.000Z",
      status: "conflict",
    });
    const pendingQueueId = await queue.add({
      userId: "user-1",
      entityType: "notebook",
      entityId: "notebook-1",
      operation: "upsert",
      payload: legacyNotebook,
      createdAt: "2026-07-17T10:01:00.000Z",
      status: "pending",
    });
    legacyDb.close();

    const upgradedDb = new NotavaOfflineDb(name);
    await upgradedDb.open();

    expect(upgradedDb.verno).toBe(5);
    expect(await upgradedDb.conflicts.count()).toBe(0);
    expect(await upgradedDb.queue.get(blockedQueueId)).toBeUndefined();
    expect(await upgradedDb.queue.get(pendingQueueId)).toMatchObject({
      status: "pending",
    });
    expect(await upgradedDb.pages.get("page-1")).toMatchObject({
      title: "Local page",
      syncStatus: "synced",
    });
    expect(await upgradedDb.notebooks.get("notebook-1")).toMatchObject({
      name: "Local notebook",
      syncStatus: "pending",
    });

    upgradedDb.close();
  });
});
