import "fake-indexeddb/auto";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  applyPullChanges,
  applySyncPushResult,
  clearOfflineStateForUser,
  enqueueNotebookArchive,
  enqueueNotebookUpsert,
  enqueuePageArchive,
  enqueuePageUpsert,
  fetchBootstrap,
  fetchPullChanges,
  getLastPullAt,
  getLocalNotebooks,
  getLocalPage,
  hasOfflineBootstrap,
  listPendingQueue,
  listConflictRecords,
  pushQueue,
  resolveConflictWithLocal,
  resolveConflictWithRemote,
  seedOfflineBootstrap,
  setLastPullAt,
  updateLocalSyncStatus,
  upsertConflictRecords,
  upsertLocalPage,
} from "@/lib/offline-db/client";
import { offlineDb } from "@/lib/offline-db/db";
import type {
  ConflictRecord,
  LocalNotebook,
  LocalPage,
  SyncBootstrapPayload,
  SyncPushResult,
} from "@/lib/offline-db/types";

const now = "2026-07-15T10:00:00.000Z";
const later = "2026-07-15T11:00:00.000Z";

function notebook(overrides: Partial<LocalNotebook> = {}): LocalNotebook {
  return {
    id: "notebook-1",
    userId: "user-1",
    groupId: "group-1",
    name: "Notebook",
    archived: false,
    updatedAt: now,
    syncStatus: "synced",
    ...overrides,
  };
}

function page(overrides: Partial<LocalPage> = {}): LocalPage {
  return {
    id: "page-1",
    userId: "user-1",
    notebookId: "notebook-1",
    title: "Page",
    bodyHtml: "<p>Body</p>",
    bodyText: "Body",
    archived: false,
    updatedAt: now,
    syncStatus: "synced",
    ...overrides,
  };
}

function conflict(
  id: string,
  overrides: Partial<ConflictRecord> = {},
): ConflictRecord {
  return {
    id,
    userId: "user-1",
    entityType: "page",
    entityId: "page-1",
    createdAt: now,
    message: "conflict",
    localPayload: page(),
    remotePayload: page({ updatedAt: later }),
    ...overrides,
  };
}

function tombstonePayload(entityId: string, deletedAt = later) {
  return {
    id: entityId,
    userId: "user-1",
    updatedAt: deletedAt,
    deletedAt,
    isTombstone: true,
  };
}

function bootstrap(
  overrides: Partial<SyncBootstrapPayload> = {},
): SyncBootstrapPayload {
  return {
    fetchedAt: later,
    notebooks: [],
    pages: [],
    ...overrides,
  };
}

beforeEach(async () => {
  await offlineDb.open();
  await Promise.all([
    offlineDb.pages.clear(),
    offlineDb.notebooks.clear(),
    offlineDb.queue.clear(),
    offlineDb.conflicts.clear(),
    offlineDb.meta.clear(),
  ]);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  offlineDb.close();
});

describe("offline database lifecycle", () => {
  it("stores pull metadata and clears only the selected user", async () => {
    expect(await getLastPullAt("user-1")).toBeNull();
    await setLastPullAt("user-1", now);
    await offlineDb.meta.put({ key: "user-2:lastPullAt", value: later });
    await offlineDb.meta.put({ key: "shared", value: "keep" });
    await offlineDb.notebooks.bulkPut([
      notebook(),
      notebook({ id: "foreign-notebook", userId: "user-2" }),
    ]);
    await offlineDb.pages.bulkPut([
      page(),
      page({ id: "foreign-page", userId: "user-2" }),
    ]);
    await offlineDb.queue.bulkAdd([
      {
        userId: "user-1",
        entityType: "page",
        entityId: "page-1",
        operation: "upsert",
        payload: page(),
        createdAt: now,
        status: "pending",
      },
      {
        userId: "user-2",
        entityType: "page",
        entityId: "foreign-page",
        operation: "upsert",
        payload: page({ id: "foreign-page", userId: "user-2" }),
        createdAt: now,
        status: "pending",
      },
    ]);
    await offlineDb.conflicts.bulkPut([
      conflict("own"),
      conflict("foreign", { userId: "user-2", entityId: "foreign-page" }),
    ]);

    expect(await getLastPullAt("user-1")).toBe(now);
    await clearOfflineStateForUser("user-1");

    expect(await offlineDb.notebooks.toArray()).toEqual([
      expect.objectContaining({ id: "foreign-notebook" }),
    ]);
    expect(await offlineDb.pages.toArray()).toEqual([
      expect.objectContaining({ id: "foreign-page" }),
    ]);
    expect(await offlineDb.queue.toArray()).toEqual([
      expect.objectContaining({ userId: "user-2" }),
    ]);
    expect(await offlineDb.conflicts.toArray()).toEqual([
      expect.objectContaining({ id: "foreign" }),
    ]);
    expect(await offlineDb.meta.toArray()).toEqual(
      expect.arrayContaining([
        { key: "user-2:lastPullAt", value: later },
        { key: "shared", value: "keep" },
      ]),
    );
  });

  it("seeds paginated and final bootstrap pages and reports available state", async () => {
    expect(await hasOfflineBootstrap("user-1")).toBe(false);

    await seedOfflineBootstrap("user-1", bootstrap({
      notebooks: [notebook()],
      hasMore: true,
    }));
    expect(await hasOfflineBootstrap("user-1")).toBe(true);
    expect(await getLastPullAt("user-1")).toBeNull();

    await seedOfflineBootstrap("user-1", bootstrap({
      pages: [page()],
      hasMore: false,
    }));
    expect(await offlineDb.notebooks.count()).toBe(0);
    expect(await hasOfflineBootstrap("user-1")).toBe(true);
    expect(await getLastPullAt("user-1")).toBe(later);
  });

  it("applies only remote entities whose local state is safe to replace", async () => {
    await offlineDb.notebooks.bulkPut([
      notebook({ id: "synced-notebook", syncStatus: "synced" }),
      notebook({ id: "pending-notebook", syncStatus: "pending", name: "local" }),
    ]);
    await offlineDb.pages.bulkPut([
      page({ id: "synced-page", syncStatus: "synced" }),
      page({ id: "pending-page", syncStatus: "pending", title: "local" }),
    ]);

    await applyPullChanges("user-1", bootstrap({
      notebooks: [
        notebook({ id: "new-notebook", name: "new" }),
        notebook({ id: "synced-notebook", name: "remote" }),
        notebook({ id: "pending-notebook", name: "remote" }),
      ],
      pages: [
        page({ id: "new-page", title: "new" }),
        page({ id: "synced-page", title: "remote" }),
        page({ id: "pending-page", title: "remote" }),
      ],
      hasMore: true,
    }));

    expect(await offlineDb.notebooks.get("new-notebook")).toMatchObject({ name: "new" });
    expect(await offlineDb.notebooks.get("synced-notebook")).toMatchObject({ name: "remote" });
    expect(await offlineDb.notebooks.get("pending-notebook")).toMatchObject({ name: "local" });
    expect(await offlineDb.pages.get("new-page")).toMatchObject({ title: "new" });
    expect(await offlineDb.pages.get("synced-page")).toMatchObject({ title: "remote" });
    expect(await offlineDb.pages.get("pending-page")).toMatchObject({ title: "local" });
    expect(await getLastPullAt("user-1")).toBeNull();

    await applyPullChanges("user-1", bootstrap({
      notebooks: [notebook({ id: "pending-notebook", name: "ignored" })],
      pages: [page({ id: "pending-page", title: "ignored" })],
      hasMore: false,
    }));
    expect(await getLastPullAt("user-1")).toBe(later);
  });

  it("applies tombstones without discarding unsynced child page state", async () => {
    const events: unknown[] = [];
    const onSync = (event: Event) => {
      events.push((event as CustomEvent).detail);
    };
    window.addEventListener("notava-sync", onSync);
    await offlineDb.notebooks.bulkPut([
      notebook(),
      notebook({ id: "foreign-notebook", userId: "user-2" }),
    ]);
    await offlineDb.pages.bulkPut([
      page(),
      page({ id: "child-page", notebookId: "notebook-1" }),
      page({ id: "synced-child-page", notebookId: "notebook-1" }),
      page({ id: "foreign-page", userId: "user-2" }),
    ]);
    for (const [entityType, entityId] of [
      ["page", "page-1"],
      ["page", "child-page"],
      ["notebook", "notebook-1"],
    ] as const) {
      await offlineDb.queue.add({
        userId: "user-1",
        entityType,
        entityId,
        operation: "upsert",
        payload: {},
        createdAt: now,
        status: "pending",
      });
      await offlineDb.conflicts.put(
        conflict(`conflict-${entityId}`, { entityType, entityId }),
      );
    }

    await applyPullChanges("user-1", bootstrap({
      tombstones: [
        { id: "page-tombstone", entityType: "page", entityId: "page-1", deletedAt: now },
        { id: "notebook-tombstone", entityType: "notebook", entityId: "notebook-1", deletedAt: now },
        { id: "missing-notebook", entityType: "notebook", entityId: "foreign-notebook", deletedAt: now },
        { id: "foreign-page", entityType: "page", entityId: "foreign-page", deletedAt: now },
      ],
    }));
    window.removeEventListener("notava-sync", onSync);

    expect(await offlineDb.pages.get("page-1")).toMatchObject({
      syncStatus: "conflict",
    });
    expect(await offlineDb.pages.get("child-page")).toMatchObject({
      syncStatus: "conflict",
    });
    expect(await offlineDb.pages.get("synced-child-page")).toBeUndefined();
    expect(await offlineDb.notebooks.get("notebook-1")).toMatchObject({
      syncStatus: "conflict",
    });
    expect(await offlineDb.pages.get("foreign-page")).toBeDefined();
    expect(await offlineDb.notebooks.get("foreign-notebook")).toBeDefined();
    expect(await offlineDb.queue.toArray()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ entityType: "page", entityId: "page-1", status: "conflict" }),
        expect.objectContaining({ entityType: "page", entityId: "child-page", status: "conflict" }),
        expect.objectContaining({ entityType: "notebook", entityId: "notebook-1", status: "conflict" }),
      ]),
    );
    expect(await offlineDb.conflicts.toArray()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          entityType: "page",
          entityId: "page-1",
          remotePayload: expect.objectContaining({ isTombstone: true }),
        }),
        expect.objectContaining({ entityType: "page", entityId: "child-page" }),
        expect.objectContaining({
          entityType: "notebook",
          entityId: "notebook-1",
          remotePayload: expect.objectContaining({ isTombstone: true }),
        }),
      ]),
    );
    expect(events).toHaveLength(4);
    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "tombstone",
          entityType: "page",
          entityId: "page-1",
          pageId: "page-1",
          syncStatus: "conflict",
        }),
        expect.objectContaining({
          type: "tombstone",
          entityType: "notebook",
          entityId: "notebook-1",
          syncStatus: "conflict",
        }),
        expect.objectContaining({
          type: "tombstone",
          entityType: "page",
          entityId: "foreign-page",
          pageId: "foreign-page",
          syncStatus: "synced",
        }),
      ]),
    );
  });

  it("keeps tombstone conflicts idempotent and lets archive intent accept deletion", async () => {
    const events: Array<Record<string, unknown>> = [];
    const onSync = (event: Event) => {
      events.push((event as CustomEvent<Record<string, unknown>>).detail);
    };
    window.addEventListener("notava-sync", onSync);
    await offlineDb.pages.bulkPut([
      page({ id: "pending-without-queue", syncStatus: "pending" }),
      page({ id: "clean-page" }),
    ]);
    await enqueuePageArchive(
      page({ id: "archived-page", syncStatus: "pending", archived: true }),
      now,
    );
    await enqueueNotebookArchive(
      notebook({ id: "archived-notebook", syncStatus: "pending", archived: true }),
      now,
    );
    const payload = bootstrap({
      tombstones: [
        { id: "pending-tombstone", entityType: "page", entityId: "pending-without-queue", deletedAt: later },
        { id: "clean-tombstone", entityType: "page", entityId: "clean-page", deletedAt: later },
        { id: "archive-page-tombstone", entityType: "page", entityId: "archived-page", deletedAt: later },
        { id: "archive-notebook-tombstone", entityType: "notebook", entityId: "archived-notebook", deletedAt: later },
      ],
    });

    await applyPullChanges("user-1", payload);
    window.removeEventListener("notava-sync", onSync);
    await applyPullChanges("user-1", payload);

    expect(await offlineDb.pages.get("pending-without-queue")).toMatchObject({
      syncStatus: "conflict",
    });
    expect(await offlineDb.conflicts.toArray()).toEqual([
      expect.objectContaining({
        entityId: "pending-without-queue",
        remotePayload: expect.objectContaining({ isTombstone: true }),
      }),
    ]);
    expect(await offlineDb.pages.get("clean-page")).toBeUndefined();
    expect(await offlineDb.pages.get("archived-page")).toBeUndefined();
    expect(await offlineDb.notebooks.get("archived-notebook")).toBeUndefined();
    expect(await offlineDb.queue.count()).toBe(0);
    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          entityId: "pending-without-queue",
          syncStatus: "conflict",
        }),
        expect.objectContaining({
          entityId: "clean-page",
          syncStatus: "synced",
        }),
      ]),
    );
    expect(events).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          entityId: "clean-page",
          syncStatus: "conflict",
        }),
      ]),
    );
  });

  it("protects a pending notebook even when it has no child pages", async () => {
    await offlineDb.notebooks.put(
      notebook({ id: "standalone-notebook", name: "local", syncStatus: "pending" }),
    );

    await applyPullChanges("user-1", bootstrap({
      tombstones: [{
        id: "standalone-tombstone",
        entityType: "notebook",
        entityId: "standalone-notebook",
        deletedAt: later,
      }],
    }));

    expect(await offlineDb.notebooks.get("standalone-notebook")).toMatchObject({
      name: "local",
      syncStatus: "conflict",
    });
    expect(await offlineDb.queue.count()).toBe(0);
    expect(await offlineDb.conflicts.toArray()).toEqual([
      expect.objectContaining({
        entityType: "notebook",
        remotePayload: expect.objectContaining({ isTombstone: true }),
      }),
    ]);
  });
});

describe("offline local mutations and queueing", () => {
  it("keeps queue ordering deterministic when operations share a timestamp", async () => {
    await offlineDb.queue.bulkAdd([
      {
        userId: "user-1",
        entityType: "notebook",
        entityId: "notebook-tie",
        operation: "upsert",
        payload: {},
        createdAt: now,
        status: "pending",
      },
      {
        userId: "user-1",
        entityType: "page",
        entityId: "page-tie-1",
        operation: "upsert",
        payload: {},
        createdAt: now,
        status: "pending",
      },
      {
        userId: "user-1",
        entityType: "page",
        entityId: "page-tie-2",
        operation: "upsert",
        payload: {},
        createdAt: now,
        status: "pending",
      },
    ]);

    expect((await listPendingQueue("user-1")).map((item) => item.entityId)).toEqual([
      "notebook-tie",
      "page-tie-1",
      "page-tie-2",
    ]);
  });

  it("upserts, reads, groups and sorts local content", async () => {
    const syncEvent = vi.fn();
    window.addEventListener("notava-sync", syncEvent);
    await upsertLocalPage(page());
    expect(syncEvent).toHaveBeenCalled();
    expect(await getLocalPage("user-1", "page-1")).toMatchObject({ id: "page-1" });
    expect(await getLocalPage("user-2", "page-1")).toBeUndefined();
    expect(await getLocalPage("user-1", "missing")).toBeUndefined();

    await offlineDb.notebooks.bulkPut([
      notebook({ id: "old", updatedAt: now }),
      notebook({ id: "new", updatedAt: later }),
      notebook({ id: "archived", archived: true }),
    ]);
    await offlineDb.pages.bulkPut([
      page({ id: "newer-page", notebookId: "new", updatedAt: later }),
      page({ id: "older-page", notebookId: "new", updatedAt: now }),
      page({ id: "archived-page", notebookId: "new", archived: true }),
      page({ id: "other-page", notebookId: "old" }),
    ]);
    const notebooks = await getLocalNotebooks("user-1");
    expect(notebooks.map((item) => item.id)).toEqual(["new", "old"]);
    expect(notebooks[0].pages.map((item) => item.id)).toEqual([
      "newer-page",
      "older-page",
    ]);
  });

  it("does not dispatch browser events when no window exists", async () => {
    const originalWindow = window;
    vi.stubGlobal("window", undefined);
    await upsertLocalPage(page());
    vi.stubGlobal("window", originalWindow);
    expect(await offlineDb.pages.get("page-1")).toBeDefined();
  });

  it("updates status with explicit, existing and empty sync timestamps", async () => {
    await updateLocalSyncStatus("user-1", "missing", "failed", later);
    await offlineDb.pages.put(page({ lastSyncedAt: now }));
    await updateLocalSyncStatus("user-1", "page-1", "pending", later);
    expect(await offlineDb.pages.get("page-1")).toMatchObject({
      syncStatus: "pending",
      lastSyncedAt: later,
    });
    await updateLocalSyncStatus("user-1", "page-1", "synced");
    expect(await offlineDb.pages.get("page-1")).toMatchObject({ lastSyncedAt: later });
    await offlineDb.pages.put(page({ lastSyncedAt: undefined }));
    await updateLocalSyncStatus("user-1", "page-1", "failed");
    expect(await offlineDb.pages.get("page-1")).toMatchObject({ lastSyncedAt: null });
  });

  it("coalesces page and notebook upserts while preserving their first base version", async () => {
    await offlineDb.pages.put(page());
    await enqueuePageUpsert(page({ title: "first" }), now);
    const firstPageQueue = await offlineDb.queue.toArray();
    await enqueuePageUpsert(page({ title: "second" }), later);
    const secondPageQueue = await offlineDb.queue.toArray();
    expect(secondPageQueue).toHaveLength(1);
    expect(secondPageQueue[0]).toMatchObject({
      id: firstPageQueue[0].id,
      baseUpdatedAt: now,
      createdAt: firstPageQueue[0].createdAt,
      revision: 2,
      payload: expect.objectContaining({ title: "second" }),
    });
    expect(await offlineDb.pages.get("page-1")).toMatchObject({
      title: "second",
      syncStatus: "pending",
    });

    await enqueueNotebookUpsert(notebook({ name: "first" }), now);
    const firstNotebookQueue = (await offlineDb.queue.toArray()).find(
      (item) => item.entityType === "notebook",
    );
    await enqueueNotebookUpsert(notebook({ name: "second" }), later);
    const secondNotebookQueue = (await offlineDb.queue.toArray()).find(
      (item) => item.entityType === "notebook",
    );
    expect(secondNotebookQueue).toMatchObject({
      id: firstNotebookQueue?.id,
      baseUpdatedAt: now,
      createdAt: firstNotebookQueue?.createdAt,
      revision: 2,
      payload: expect.objectContaining({ name: "second" }),
    });
    expect(await offlineDb.notebooks.get("notebook-1")).toMatchObject({
      name: "second",
      syncStatus: "pending",
    });
  });

  it.each([
    {
      label: "page upsert",
      entityType: "page" as const,
      entityId: "legacy-page-upsert",
      expectedOperation: "upsert",
      enqueue: () =>
        enqueuePageUpsert(
          page({ id: "legacy-page-upsert", title: "current page" }),
          later,
        ),
      expectedPayload: { title: "current page" },
    },
    {
      label: "page archive",
      entityType: "page" as const,
      entityId: "legacy-page-archive",
      expectedOperation: "archive",
      enqueue: () =>
        enqueuePageArchive(
          page({ id: "legacy-page-archive", archived: true }),
          later,
        ),
      expectedPayload: { archived: true },
    },
    {
      label: "notebook upsert",
      entityType: "notebook" as const,
      entityId: "legacy-notebook-upsert",
      expectedOperation: "upsert",
      enqueue: () =>
        enqueueNotebookUpsert(
          notebook({ id: "legacy-notebook-upsert", name: "current notebook" }),
          later,
        ),
      expectedPayload: { name: "current notebook" },
    },
    {
      label: "notebook archive",
      entityType: "notebook" as const,
      entityId: "legacy-notebook-archive",
      expectedOperation: "archive",
      enqueue: () =>
        enqueueNotebookArchive(
          notebook({ id: "legacy-notebook-archive", archived: true }),
          later,
        ),
      expectedPayload: { archived: true },
    },
  ])(
    "atomically coalesces every legacy archive/upsert duplicate for $label",
    async ({
      entityType,
      entityId,
      expectedOperation,
      enqueue,
      expectedPayload,
    }) => {
      const lateId = await offlineDb.queue.add({
        userId: "user-1",
        entityType,
        entityId,
        operation: "archive",
        payload: { version: "late" },
        baseUpdatedAt: later,
        revision: 4,
        createdAt: later,
        status: "failed",
      });
      const stableId = await offlineDb.queue.add({
        userId: "user-1",
        entityType,
        entityId,
        operation: "upsert",
        payload: { version: "first" },
        baseUpdatedAt: null,
        revision: 2,
        createdAt: now,
        status: "conflict",
      });
      const middleId = await offlineDb.queue.add({
        userId: "user-1",
        entityType,
        entityId,
        operation: "upsert",
        payload: { version: "middle" },
        baseUpdatedAt: later,
        revision: 9,
        createdAt: "2026-07-15T10:30:00.000Z",
        status: "pending",
      });
      const foreignId = await offlineDb.queue.add({
        userId: "user-2",
        entityType,
        entityId,
        operation: "upsert",
        payload: { version: "foreign" },
        createdAt: now,
        status: "pending",
      });

      await enqueue();

      const matchingItems = await offlineDb.queue
        .where("[userId+entityType+entityId]")
        .equals(["user-1", entityType, entityId])
        .toArray();
      expect(matchingItems).toEqual([
        expect.objectContaining({
          id: stableId,
          operation: expectedOperation,
          payload: expect.objectContaining(expectedPayload),
          baseUpdatedAt: null,
          revision: 10,
          createdAt: now,
          status: "pending",
        }),
      ]);
      expect(await offlineDb.queue.get(lateId)).toBeUndefined();
      expect(await offlineDb.queue.get(middleId)).toBeUndefined();
      expect(await offlineDb.queue.get(foreignId)).toBeDefined();
    },
  );

  it("repairs untouched legacy duplicates once before listing the queue", async () => {
    const stableId = await offlineDb.queue.add({
      userId: "user-1",
      entityType: "page",
      entityId: "untouched-page",
      operation: "upsert",
      payload: { title: "old" },
      createdAt: now,
      status: "failed",
    });
    await offlineDb.queue.add({
      userId: "user-1",
      entityType: "page",
      entityId: "untouched-page",
      operation: "upsert",
      payload: { title: "middle" },
      baseUpdatedAt: null,
      createdAt: "2026-07-15T10:30:00.000Z",
      status: "pending",
    });
    await offlineDb.queue.add({
      userId: "user-1",
      entityType: "page",
      entityId: "untouched-page",
      operation: "archive",
      payload: { title: "latest", archived: true },
      baseUpdatedAt: later,
      createdAt: later,
      status: "pending",
    });

    const [firstListing, concurrentListing] = await Promise.all([
      listPendingQueue("user-1"),
      listPendingQueue("user-1"),
    ]);

    expect(firstListing).toEqual([
      expect.objectContaining({
        id: stableId,
        operation: "archive",
        payload: { title: "latest", archived: true },
        baseUpdatedAt: null,
        createdAt: now,
        status: "pending",
      }),
    ]);
    expect(concurrentListing).toEqual(firstListing);
    expect(
      await offlineDb.queue
        .where("[userId+entityType+entityId]")
        .equals(["user-1", "page", "untouched-page"])
        .count(),
    ).toBe(1);
    expect(await offlineDb.meta.get("user-1:queueCoalescedV4")).toBeDefined();
    expect(await listPendingQueue("user-1")).toEqual(firstListing);
  });

  it("replaces previous operations with page and notebook archives", async () => {
    await offlineDb.pages.put(page({ lastSyncedAt: now }));
    await enqueuePageUpsert(page(), now);
    await enqueuePageArchive(page({ lastSyncedAt: now }), later);
    await enqueueNotebookUpsert(notebook(), now);
    await enqueueNotebookArchive(notebook(), later);

    expect(await offlineDb.queue.toArray()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          entityType: "page",
          operation: "archive",
          baseUpdatedAt: now,
          revision: 2,
        }),
        expect.objectContaining({
          entityType: "notebook",
          operation: "archive",
          baseUpdatedAt: now,
          revision: 2,
        }),
      ]),
    );
    expect(await offlineDb.pages.get("page-1")).toMatchObject({
      syncStatus: "pending",
      lastSyncedAt: now,
    });

    await offlineDb.pages.put(page({ id: "page-without-sync", lastSyncedAt: undefined }));
    await enqueuePageArchive(page({ id: "page-without-sync", lastSyncedAt: undefined }));
    expect(await offlineDb.pages.get("page-without-sync")).toMatchObject({
      lastSyncedAt: null,
    });

    await enqueueNotebookArchive(notebook({ id: "fresh-notebook" }), later);
    expect(await offlineDb.queue.toArray()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          entityId: "fresh-notebook",
          operation: "archive",
          baseUpdatedAt: later,
          revision: 1,
        }),
      ]),
    );
  });

  it("rolls back the local page when its outbox write fails", async () => {
    const originalPage = page({ title: "stored" });
    const syncEvent = vi.fn();
    const failQueueWrite = () => {
      throw new Error("queue unavailable");
    };
    await offlineDb.pages.put(originalPage);
    window.addEventListener("notava-sync", syncEvent);
    offlineDb.queue.hook("creating", failQueueWrite);

    try {
      await expect(
        enqueuePageUpsert(page({ title: "must roll back" }), now),
      ).rejects.toThrow("queue unavailable");
    } finally {
      offlineDb.queue.hook("creating").unsubscribe(failQueueWrite);
      window.removeEventListener("notava-sync", syncEvent);
    }

    expect(await offlineDb.pages.get("page-1")).toEqual(originalPage);
    expect(await offlineDb.queue.count()).toBe(0);
    expect(syncEvent).not.toHaveBeenCalled();
  });

  it("rolls back the entity and every legacy row when duplicate cleanup fails", async () => {
    const originalPage = page({ id: "rollback-page", title: "stored" });
    await offlineDb.pages.put(originalPage);
    await offlineDb.queue.add({
      userId: "user-1",
      entityType: "page",
      entityId: "rollback-page",
      operation: "upsert",
      payload: { title: "first" },
      baseUpdatedAt: now,
      revision: 1,
      createdAt: now,
      status: "pending",
    });
    const duplicateId = await offlineDb.queue.add({
      userId: "user-1",
      entityType: "page",
      entityId: "rollback-page",
      operation: "archive",
      payload: { title: "second" },
      baseUpdatedAt: later,
      revision: 2,
      createdAt: later,
      status: "failed",
    });
    const originalQueue = await offlineDb.queue.toArray();
    const syncEvent = vi.fn();
    const failDuplicateDelete = (id: number) => {
      if (id === duplicateId) {
        throw new Error("duplicate cleanup unavailable");
      }
    };
    window.addEventListener("notava-sync", syncEvent);
    offlineDb.queue.hook("deleting", failDuplicateDelete);

    try {
      await expect(
        enqueuePageArchive(
          page({ id: "rollback-page", title: "must roll back", archived: true }),
          later,
        ),
      ).rejects.toThrow("duplicate cleanup unavailable");
    } finally {
      offlineDb.queue.hook("deleting").unsubscribe(failDuplicateDelete);
      window.removeEventListener("notava-sync", syncEvent);
    }

    expect(await offlineDb.pages.get("rollback-page")).toEqual(originalPage);
    expect(await offlineDb.queue.toArray()).toEqual(originalQueue);
    expect(syncEvent).not.toHaveBeenCalled();
  });
});

describe("offline push merging and transport", () => {
  it("applies successful notebook/page results, deletes acknowledgements and records both conflict kinds", async () => {
    const pageQueueId = await offlineDb.queue.add({
      userId: "user-1",
      entityType: "page",
      entityId: "page-conflict",
      operation: "upsert",
      payload: {},
      createdAt: now,
      status: "pending",
    });
    await offlineDb.queue.add({
      userId: "user-1",
      entityType: "notebook",
      entityId: "notebook-conflict",
      operation: "upsert",
      payload: {},
      createdAt: later,
      status: "pending",
    });
    await offlineDb.pages.put(page({ id: "page-conflict" }));
    await offlineDb.notebooks.put(notebook({ id: "notebook-conflict" }));
    const result: SyncPushResult = {
      applied: [
        { queueId: pageQueueId, entityType: "page", entityId: "applied", operation: "upsert" },
        { entityType: "page", entityId: "legacy", operation: "archive" },
      ],
      conflicts: [
        conflict("page-conflict-id", { entityId: "page-conflict" }),
        conflict("notebook-conflict-id", {
          entityType: "notebook",
          entityId: "notebook-conflict",
          localPayload: notebook({ id: "notebook-conflict" }),
          remotePayload: notebook({ id: "notebook-conflict", updatedAt: later }),
        }),
      ],
      notebooks: [
        notebook({ id: "notebook-applied" }),
        notebook({ id: "notebook-conflict" }),
      ],
      pages: [page({ id: "page-applied" }), page({ id: "page-conflict" })],
      pulledAt: later,
    };

    await applySyncPushResult("user-1", result);

    expect(await offlineDb.notebooks.get("notebook-applied")).toBeDefined();
    expect(await offlineDb.pages.get("page-applied")).toBeDefined();
    expect(await offlineDb.notebooks.get("notebook-conflict")).toMatchObject({
      syncStatus: "conflict",
    });
    expect(await offlineDb.pages.get("page-conflict")).toMatchObject({
      syncStatus: "conflict",
    });
    expect(await offlineDb.conflicts.count()).toBe(2);
    expect(await offlineDb.queue.get(pageQueueId)).toBeUndefined();
    expect((await offlineDb.queue.toArray())[0]).toMatchObject({ status: "conflict" });
  });

  it("handles an empty push result without writing entities", async () => {
    await applySyncPushResult("user-1", {
      applied: [],
      conflicts: [],
      notebooks: [],
      pages: [],
      tombstones: [],
      pulledAt: later,
    });
    expect(await offlineDb.notebooks.count()).toBe(0);
    expect(await offlineDb.pages.count()).toBe(0);
  });

  it("keeps newer page and notebook revisions after an older push succeeds", async () => {
    await enqueuePageUpsert(page({ title: "page A" }), now);
    await enqueueNotebookUpsert(notebook({ name: "notebook A" }), now);
    const submitted = await offlineDb.queue.toArray();
    await enqueuePageUpsert(page({ title: "page B", updatedAt: later }), now);
    await enqueueNotebookUpsert(
      notebook({ name: "notebook B", updatedAt: later }),
      now,
    );
    const serverUpdatedAt = "2026-07-15T12:00:00.000Z";

    await applySyncPushResult(
      "user-1",
      {
        applied: submitted.map((item) => ({
          queueId: item.id,
          entityType: item.entityType,
          entityId: item.entityId,
          operation: item.operation,
        })),
        conflicts: [],
        notebooks: [
          notebook({
            name: "server notebook A",
            updatedAt: serverUpdatedAt,
            lastSyncedAt: serverUpdatedAt,
          }),
        ],
        pages: [
          page({
            title: "server page A",
            updatedAt: serverUpdatedAt,
            lastSyncedAt: serverUpdatedAt,
          }),
        ],
        pulledAt: serverUpdatedAt,
      },
      submitted,
    );

    expect(await offlineDb.pages.get("page-1")).toMatchObject({
      title: "page B",
      lastSyncedAt: serverUpdatedAt,
      syncStatus: "pending",
    });
    expect(await offlineDb.notebooks.get("notebook-1")).toMatchObject({
      name: "notebook B",
      lastSyncedAt: serverUpdatedAt,
      syncStatus: "pending",
    });
    expect(await offlineDb.queue.toArray()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          entityType: "page",
          revision: 2,
          baseUpdatedAt: serverUpdatedAt,
          payload: expect.objectContaining({ title: "page B" }),
        }),
        expect.objectContaining({
          entityType: "notebook",
          revision: 2,
          baseUpdatedAt: serverUpdatedAt,
          payload: expect.objectContaining({ name: "notebook B" }),
        }),
      ]),
    );
  });

  it("promotes stale conflicts to the newest local page and notebook payloads", async () => {
    await enqueuePageUpsert(page({ title: "page A" }), now);
    await enqueueNotebookUpsert(notebook({ name: "notebook A" }), now);
    const submitted = await offlineDb.queue.toArray();
    await enqueuePageUpsert(page({ title: "page B", updatedAt: later }), now);
    await enqueueNotebookUpsert(
      notebook({ name: "notebook B", updatedAt: later }),
      now,
    );
    const remotePage = page({ title: "remote page", updatedAt: later });
    const remoteNotebook = notebook({ name: "remote notebook", updatedAt: later });

    await applySyncPushResult(
      "user-1",
      {
        applied: [],
        conflicts: [
          conflict("stale-page", {
            localPayload: page({ title: "page A" }),
            remotePayload: remotePage,
          }),
          conflict("stale-notebook", {
            entityType: "notebook",
            entityId: "notebook-1",
            localPayload: notebook({ name: "notebook A" }),
            remotePayload: remoteNotebook,
          }),
        ],
        notebooks: [remoteNotebook],
        pages: [remotePage],
        pulledAt: later,
      },
      submitted,
    );

    expect(await offlineDb.pages.get("page-1")).toMatchObject({
      title: "page B",
      syncStatus: "conflict",
    });
    expect(await offlineDb.notebooks.get("notebook-1")).toMatchObject({
      name: "notebook B",
      syncStatus: "conflict",
    });
    expect(await offlineDb.conflicts.toArray()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "user-1:stale-page",
          localPayload: expect.objectContaining({ title: "page B" }),
        }),
        expect.objectContaining({
          id: "user-1:stale-notebook",
          localPayload: expect.objectContaining({ name: "notebook B" }),
        }),
      ]),
    );
    expect(await offlineDb.queue.toArray()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ entityType: "page", status: "conflict" }),
        expect.objectContaining({ entityType: "notebook", status: "conflict" }),
      ]),
    );
  });

  it("does not let a stale tombstone remove a newer local revision", async () => {
    await enqueuePageUpsert(page({ title: "page A" }), now);
    const submitted = await offlineDb.queue.toArray();
    await enqueuePageUpsert(page({ title: "page B", updatedAt: later }), now);

    await applySyncPushResult(
      "user-1",
      {
        applied: [{
          queueId: submitted[0].id,
          entityType: "page",
          entityId: "page-1",
          operation: "upsert",
        }],
        conflicts: [],
        notebooks: [],
        pages: [],
        tombstones: [{
          id: "page-tombstone",
          entityType: "page",
          entityId: "page-1",
          deletedAt: later,
        }],
        pulledAt: later,
      },
      submitted,
    );

    expect(await offlineDb.pages.get("page-1")).toMatchObject({
      title: "page B",
      syncStatus: "conflict",
    });
    expect(await offlineDb.queue.toArray()).toEqual([
      expect.objectContaining({
        entityId: "page-1",
        revision: 2,
        status: "conflict",
      }),
    ]);
    expect(await offlineDb.conflicts.toArray()).toEqual([
      expect.objectContaining({
        entityType: "page",
        entityId: "page-1",
        localPayload: expect.objectContaining({ title: "page B" }),
        remotePayload: expect.objectContaining({ isTombstone: true }),
      }),
    ]);
  });

  it("preserves an unsubmitted child edit when a notebook push returns a tombstone", async () => {
    await enqueueNotebookUpsert(notebook({ name: "notebook A" }), now);
    const submitted = await offlineDb.queue.toArray();
    await enqueuePageUpsert(
      page({ title: "new child draft", updatedAt: later }),
      now,
    );

    await applySyncPushResult(
      "user-1",
      {
        applied: [{
          queueId: submitted[0].id,
          entityType: "notebook",
          entityId: "notebook-1",
          operation: "upsert",
        }],
        conflicts: [],
        notebooks: [],
        pages: [],
        tombstones: [{
          id: "notebook-tombstone",
          entityType: "notebook",
          entityId: "notebook-1",
          deletedAt: later,
        }],
        pulledAt: later,
      },
      submitted,
    );

    expect(await offlineDb.notebooks.get("notebook-1")).toMatchObject({
      syncStatus: "conflict",
    });
    expect(await offlineDb.pages.get("page-1")).toMatchObject({
      title: "new child draft",
      syncStatus: "conflict",
    });
    expect(await offlineDb.queue.toArray()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          entityType: "notebook",
          entityId: "notebook-1",
          status: "conflict",
        }),
        expect.objectContaining({
          entityType: "page",
          entityId: "page-1",
          payload: expect.objectContaining({ title: "new child draft" }),
          status: "conflict",
        }),
      ]),
    );
    expect(await offlineDb.conflicts.toArray()).toEqual([
      expect.objectContaining({
        entityType: "notebook",
        entityId: "notebook-1",
        remotePayload: expect.objectContaining({ isTombstone: true }),
      }),
    ]);
  });

  it("keeps a superseding queue base when an old acknowledgement has no entity payload", async () => {
    await enqueuePageUpsert(page({ title: "page A" }), now);
    const submitted = await offlineDb.queue.toArray();
    await enqueuePageUpsert(page({ title: "page B", updatedAt: later }), now);

    await applySyncPushResult(
      "user-1",
      {
        applied: [{
          queueId: submitted[0].id,
          entityType: "page",
          entityId: "page-1",
          operation: "upsert",
        }],
        conflicts: [],
        notebooks: [],
        pages: [],
        tombstones: [],
        pulledAt: later,
      },
      submitted,
    );

    expect(await offlineDb.queue.toArray()).toEqual([
      expect.objectContaining({
        entityId: "page-1",
        revision: 2,
        baseUpdatedAt: now,
        status: "pending",
      }),
    ]);
    expect(await offlineDb.pages.get("page-1")).toMatchObject({
      title: "page B",
      syncStatus: "pending",
    });
  });

  it("acknowledges the exact submitted revision", async () => {
    await enqueuePageUpsert(page({ title: "page A" }), now);
    const submitted = await offlineDb.queue.toArray();

    await applySyncPushResult(
      "user-1",
      {
        applied: [{
          queueId: submitted[0].id,
          entityType: "page",
          entityId: "page-1",
          operation: "upsert",
        }],
        conflicts: [],
        notebooks: [],
        pages: [page({ title: "server page", updatedAt: later })],
        pulledAt: later,
      },
      submitted,
    );

    expect(await offlineDb.queue.count()).toBe(0);
    expect(await offlineDb.pages.get("page-1")).toMatchObject({
      title: "server page",
      syncStatus: "synced",
    });
  });

  it("acknowledges an unchanged legacy queue item without a revision", async () => {
    const legacyItem = {
      userId: "user-1",
      entityType: "page" as const,
      entityId: "legacy-page",
      operation: "upsert" as const,
      payload: page({ id: "legacy-page" }),
      createdAt: now,
      status: "pending" as const,
    };
    const queueId = await offlineDb.queue.add(legacyItem);
    const submitted = [{ ...legacyItem, id: queueId }];

    await applySyncPushResult(
      "user-1",
      {
        applied: [{
          queueId,
          entityType: "page",
          entityId: "legacy-page",
          operation: "upsert",
        }],
        conflicts: [],
        notebooks: [],
        pages: [],
        pulledAt: later,
      },
      submitted,
    );

    expect(await offlineDb.queue.get(queueId)).toBeUndefined();
  });

  it("ignores an old acknowledgement after its local queue item was removed", async () => {
    await enqueuePageUpsert(page({ title: "page A" }), now);
    const submitted = await offlineDb.queue.toArray();
    await offlineDb.queue.clear();

    await applySyncPushResult(
      "user-1",
      {
        applied: [{
          queueId: submitted[0].id,
          entityType: "page",
          entityId: "page-1",
          operation: "upsert",
        }],
        conflicts: [],
        notebooks: [],
        pages: [page({ title: "stale server page", updatedAt: later })],
        pulledAt: later,
      },
      submitted,
    );

    expect(await offlineDb.pages.get("page-1")).toMatchObject({ title: "page A" });
    expect(await offlineDb.queue.count()).toBe(0);
  });

  it("records a conflict even when the related queue item is already absent", async () => {
    await offlineDb.pages.put(page({ id: "orphan-page" }));

    await applySyncPushResult("user-1", {
      applied: [],
      conflicts: [
        conflict("orphan-conflict", {
          entityId: "orphan-page",
          localPayload: page({ id: "orphan-page" }),
          remotePayload: page({ id: "orphan-page", updatedAt: later }),
        }),
      ],
      notebooks: [],
      pages: [],
      pulledAt: later,
    });

    expect(await offlineDb.conflicts.get("user-1:orphan-conflict")).toBeDefined();
    expect(await offlineDb.pages.get("orphan-page")).toMatchObject({
      syncStatus: "conflict",
    });
  });

  it("fetches bootstrap pages with and without a cursor and rejects failures", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(bootstrap())))
      .mockResolvedValueOnce(new Response(JSON.stringify(bootstrap())))
      .mockResolvedValueOnce(new Response("failed", { status: 503 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchBootstrap()).resolves.toMatchObject({ fetchedAt: later });
    await expect(fetchBootstrap("next cursor")).resolves.toMatchObject({ fetchedAt: later });
    await expect(fetchBootstrap()).rejects.toThrow("BOOTSTRAP_FAILED");
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "/api/sync/bootstrap",
      expect.any(Object),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "/api/sync/bootstrap?cursor=next%20cursor",
      expect.any(Object),
    );
  });

  it("fetches pull changes from cursor, timestamp and initial state and rejects failures", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(bootstrap())))
      .mockResolvedValueOnce(new Response(JSON.stringify(bootstrap())))
      .mockResolvedValueOnce(new Response(JSON.stringify(bootstrap())))
      .mockResolvedValueOnce(new Response("failed", { status: 500 }));
    vi.stubGlobal("fetch", fetchMock);

    await fetchPullChanges("user-1", "cursor value");
    await setLastPullAt("user-1", now);
    await fetchPullChanges("user-1");
    await offlineDb.meta.clear();
    await fetchPullChanges("user-1");
    await expect(fetchPullChanges("user-1")).rejects.toThrow("PULL_FAILED");
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      "/api/sync/pull?cursor=cursor%20value",
      `/api/sync/pull?since=${encodeURIComponent(now)}`,
      "/api/sync/pull",
      "/api/sync/pull",
    ]);
  });

  it("pushes queue items and preserves detailed JSON server errors", async () => {
    const success: SyncPushResult = {
      applied: [],
      conflicts: [],
      notebooks: [],
      pages: [],
      pulledAt: later,
    };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(success)))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        error: "Invalid batch",
        issues: [
          { path: "operations.0", message: "bad item" },
          { message: "missing path" },
          {},
        ],
      }), { status: 400 }));
    vi.stubGlobal("fetch", fetchMock);
    const item = {
      userId: "user-1",
      entityType: "page" as const,
      entityId: "page-1",
      operation: "upsert" as const,
      payload: page(),
      createdAt: now,
      status: "pending" as const,
    };

    await expect(pushQueue([item])).resolves.toEqual(success);
    await expect(pushQueue([item])).rejects.toThrow(
      "PUSH_FAILED 400 Invalid batch - operations.0: bad item; missing path",
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/sync/push",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ operations: [item] }),
      }),
    );
  });

  it("falls back to text and empty details for non-JSON push failures", async () => {
    const textFallback = {
      ok: false,
      status: 502,
      json: vi.fn().mockRejectedValue(new Error("not json")),
      text: vi.fn().mockResolvedValue("gateway unavailable"),
    };
    const emptyFallback = {
      ok: false,
      status: 500,
      json: vi.fn().mockRejectedValue(new Error("not json")),
      text: vi.fn().mockRejectedValue(new Error("no body")),
    };
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(textFallback)
      .mockResolvedValueOnce(emptyFallback));

    await expect(pushQueue([])).rejects.toThrow(
      "PUSH_FAILED 502 gateway unavailable",
    );
    await expect(pushQueue([])).rejects.toThrow("PUSH_FAILED 500");
  });
});

describe("offline conflict records", () => {
  it("upserts non-empty conflict batches and returns newest first", async () => {
    await upsertConflictRecords("user-1", []);
    expect(await offlineDb.conflicts.count()).toBe(0);
    await upsertConflictRecords("user-1", [
      conflict("old", { createdAt: now }),
      conflict("new", { createdAt: later }),
    ]);
    expect((await listConflictRecords("user-1")).map((item) => item.id)).toEqual([
      "user-1:new",
      "user-1:old",
    ]);
  });

  it("rejects missing and foreign conflicts", async () => {
    await expect(resolveConflictWithRemote("user-1", "missing")).rejects.toThrow(
      "CONFLICT_NOT_FOUND",
    );
    await expect(resolveConflictWithLocal("user-1", "missing")).rejects.toThrow(
      "CONFLICT_NOT_FOUND",
    );
    await offlineDb.conflicts.put(conflict("foreign", { userId: "user-2" }));
    await expect(resolveConflictWithRemote("user-1", "foreign")).rejects.toThrow(
      "CONFLICT_NOT_FOUND",
    );
    await expect(resolveConflictWithLocal("user-1", "foreign")).rejects.toThrow(
      "CONFLICT_NOT_FOUND",
    );
  });

  it.each([
    undefined,
    {},
    { id: 1 },
    { id: "page-1", userId: 1 },
    { id: "page-1", userId: "user-1", notebookId: 1 },
    { id: "page-1", userId: "user-1", notebookId: "notebook-1", title: 1 },
    { id: "page-1", userId: "user-1", notebookId: "notebook-1", title: "Page", bodyHtml: 1 },
    { id: "page-1", userId: "user-1", notebookId: "notebook-1", title: "Page", bodyHtml: "", bodyText: 1 },
    { id: "page-1", userId: "user-1", notebookId: "notebook-1", title: "Page", bodyHtml: "", bodyText: "", updatedAt: 1 },
  ])("rejects an invalid remote page payload %#", async (remotePayload) => {
    await offlineDb.conflicts.put(conflict("invalid-page", { remotePayload }));
    await expect(
      resolveConflictWithRemote("user-1", "invalid-page"),
    ).rejects.toThrow("INVALID_REMOTE_CONFLICT_PAYLOAD");
  });

  it.each([
    undefined,
    {},
    { id: 1 },
    { id: "notebook-1", userId: 1 },
    { id: "notebook-1", userId: "user-1", groupId: 1 },
    { id: "notebook-1", userId: "user-1", groupId: "group-1", name: 1 },
    { id: "notebook-1", userId: "user-1", groupId: "group-1", name: "Notebook", updatedAt: 1 },
  ])("rejects an invalid remote notebook payload %#", async (remotePayload) => {
    await offlineDb.conflicts.put(conflict("invalid-notebook", {
      entityType: "notebook",
      entityId: "notebook-1",
      remotePayload,
    }));
    await expect(
      resolveConflictWithRemote("user-1", "invalid-notebook"),
    ).rejects.toThrow("INVALID_REMOTE_CONFLICT_PAYLOAD");
  });

  it.each([
    { isTombstone: true },
    { isTombstone: true, id: "page-1" },
    { isTombstone: true, id: "page-1", userId: "user-1" },
    {
      isTombstone: true,
      id: "page-1",
      userId: "user-1",
      updatedAt: later,
    },
  ])("rejects an incomplete tombstone payload %#", async (remotePayload) => {
    await offlineDb.conflicts.put(
      conflict("invalid-tombstone", { remotePayload }),
    );
    await expect(
      resolveConflictWithRemote("user-1", "invalid-tombstone"),
    ).rejects.toThrow("INVALID_REMOTE_CONFLICT_PAYLOAD");
  });

  it("resolves valid remote page and notebook payloads and clears related state", async () => {
    const pageConflict = conflict("remote-page");
    const notebookConflict = conflict("remote-notebook", {
      entityType: "notebook",
      entityId: "notebook-1",
      remotePayload: notebook({ updatedAt: later }),
    });
    await offlineDb.conflicts.bulkPut([pageConflict, notebookConflict]);
    await offlineDb.queue.bulkAdd([
      {
        userId: "user-1",
        entityType: "page",
        entityId: "page-1",
        operation: "upsert",
        payload: {},
        createdAt: now,
        status: "conflict",
      },
      {
        userId: "user-1",
        entityType: "notebook",
        entityId: "notebook-1",
        operation: "upsert",
        payload: {},
        createdAt: now,
        status: "conflict",
      },
    ]);

    await resolveConflictWithRemote("user-1", "remote-page");
    await resolveConflictWithRemote("user-1", "remote-notebook");
    expect(await offlineDb.pages.get("page-1")).toMatchObject({
      syncStatus: "synced",
      lastSyncedAt: later,
    });
    expect(await offlineDb.notebooks.get("notebook-1")).toMatchObject({
      syncStatus: "synced",
      lastSyncedAt: later,
    });
    expect(await offlineDb.conflicts.count()).toBe(0);
    expect(await offlineDb.queue.count()).toBe(0);
  });

  it("validates the remote timestamp and local entity before choosing local", async () => {
    await offlineDb.conflicts.put(conflict("no-time", { remotePayload: {} }));
    await expect(resolveConflictWithLocal("user-1", "no-time")).rejects.toThrow(
      "INVALID_REMOTE_CONFLICT_PAYLOAD",
    );
    await offlineDb.conflicts.put(conflict("missing-local"));
    await expect(resolveConflictWithLocal("user-1", "missing-local")).rejects.toThrow(
      "LOCAL_CONFLICT_ENTITY_NOT_FOUND",
    );
    await offlineDb.pages.put(page({ userId: "user-2" }));
    await offlineDb.conflicts.put(conflict("foreign-local"));
    await expect(resolveConflictWithLocal("user-1", "foreign-local")).rejects.toThrow(
      "LOCAL_CONFLICT_ENTITY_NOT_FOUND",
    );
  });

  it("requeues local page and notebook winners against the remote version", async () => {
    await offlineDb.pages.put(page({ syncStatus: "conflict" }));
    await offlineDb.notebooks.put(notebook({ syncStatus: "conflict" }));
    await offlineDb.conflicts.bulkPut([
      conflict("local-page"),
      conflict("local-notebook", {
        entityType: "notebook",
        entityId: "notebook-1",
        localPayload: notebook(),
        remotePayload: notebook({ updatedAt: later }),
      }),
    ]);

    await resolveConflictWithLocal("user-1", "local-page");
    await resolveConflictWithLocal("user-1", "local-notebook");
    expect(await offlineDb.pages.get("page-1")).toMatchObject({ syncStatus: "pending" });
    expect(await offlineDb.notebooks.get("notebook-1")).toMatchObject({ syncStatus: "pending" });
    expect(await offlineDb.queue.toArray()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ entityType: "page", baseUpdatedAt: later }),
        expect.objectContaining({ entityType: "notebook", baseUpdatedAt: later }),
      ]),
    );
  });

  it("accepts remote tombstones by deleting page and notebook conflict state", async () => {
    await offlineDb.notebooks.bulkPut([
      notebook(),
      notebook({ id: "empty-notebook" }),
      notebook({ id: "foreign-notebook", userId: "user-2" }),
    ]);
    await offlineDb.pages.bulkPut([
      page(),
      page({ id: "child-page" }),
      page({ id: "foreign-page", userId: "user-2" }),
    ]);
    await offlineDb.queue.bulkAdd([
      {
        userId: "user-1",
        entityType: "page",
        entityId: "page-1",
        operation: "upsert",
        payload: page(),
        createdAt: now,
        status: "conflict",
      },
      {
        userId: "user-1",
        entityType: "notebook",
        entityId: "notebook-1",
        operation: "upsert",
        payload: notebook(),
        createdAt: now,
        status: "conflict",
      },
      {
        userId: "user-1",
        entityType: "page",
        entityId: "child-page",
        operation: "upsert",
        payload: page({ id: "child-page" }),
        createdAt: now,
        status: "conflict",
      },
    ]);
    await offlineDb.conflicts.bulkPut([
      conflict("deleted-page", { remotePayload: tombstonePayload("page-1") }),
      conflict("deleted-notebook", {
        entityType: "notebook",
        entityId: "notebook-1",
        localPayload: notebook(),
        remotePayload: tombstonePayload("notebook-1"),
      }),
      conflict("deleted-child", {
        entityId: "child-page",
        remotePayload: tombstonePayload("child-page"),
      }),
      conflict("deleted-empty-notebook", {
        entityType: "notebook",
        entityId: "empty-notebook",
        remotePayload: tombstonePayload("empty-notebook"),
      }),
      conflict("foreign-page-pointer", {
        entityId: "foreign-page",
        remotePayload: tombstonePayload("foreign-page"),
      }),
      conflict("foreign-notebook-pointer", {
        entityType: "notebook",
        entityId: "foreign-notebook",
        remotePayload: tombstonePayload("foreign-notebook"),
      }),
    ]);

    await resolveConflictWithRemote("user-1", "deleted-page");
    await resolveConflictWithRemote("user-1", "deleted-notebook");
    await resolveConflictWithRemote("user-1", "deleted-empty-notebook");
    await resolveConflictWithRemote("user-1", "foreign-page-pointer");
    await resolveConflictWithRemote("user-1", "foreign-notebook-pointer");

    expect(await offlineDb.pages.get("page-1")).toBeUndefined();
    expect(await offlineDb.pages.get("child-page")).toBeUndefined();
    expect(await offlineDb.notebooks.get("notebook-1")).toBeUndefined();
    expect(await offlineDb.notebooks.get("empty-notebook")).toBeUndefined();
    expect(await offlineDb.pages.get("foreign-page")).toMatchObject({
      userId: "user-2",
    });
    expect(await offlineDb.notebooks.get("foreign-notebook")).toMatchObject({
      userId: "user-2",
    });
    expect(await offlineDb.queue.count()).toBe(0);
    expect(await offlineDb.conflicts.count()).toBe(0);
  });

  it("requeues local tombstone winners and restores parent-before-child ordering", async () => {
    await offlineDb.notebooks.put(notebook({ syncStatus: "conflict" }));
    await offlineDb.pages.bulkPut([
      page({ id: "recoverable-child", syncStatus: "conflict" }),
      page({ id: "real-conflict-child", syncStatus: "conflict" }),
      page({
        id: "standalone-page",
        notebookId: "other-notebook",
        syncStatus: "conflict",
      }),
    ]);
    await offlineDb.queue.bulkAdd([
      {
        userId: "user-1",
        entityType: "page",
        entityId: "recoverable-child",
        operation: "upsert",
        payload: page({ id: "recoverable-child" }),
        createdAt: now,
        status: "conflict",
      },
      {
        userId: "user-1",
        entityType: "page",
        entityId: "real-conflict-child",
        operation: "upsert",
        payload: page({ id: "real-conflict-child" }),
        createdAt: now,
        status: "conflict",
      },
    ]);
    await offlineDb.conflicts.bulkPut([
      conflict("recover-page", {
        entityId: "standalone-page",
        remotePayload: tombstonePayload("standalone-page"),
      }),
      conflict("recover-notebook", {
        entityType: "notebook",
        entityId: "notebook-1",
        localPayload: notebook(),
        remotePayload: tombstonePayload("notebook-1"),
      }),
      conflict("real-child-conflict", {
        entityId: "real-conflict-child",
      }),
    ]);

    await resolveConflictWithLocal("user-1", "recover-page");
    await resolveConflictWithLocal("user-1", "recover-notebook");

    expect(await offlineDb.pages.get("standalone-page")).toMatchObject({
      syncStatus: "pending",
    });
    expect(await offlineDb.notebooks.get("notebook-1")).toMatchObject({
      syncStatus: "pending",
    });
    expect(await offlineDb.pages.get("recoverable-child")).toMatchObject({
      syncStatus: "pending",
    });
    expect(await offlineDb.pages.get("real-conflict-child")).toMatchObject({
      syncStatus: "conflict",
    });
    const pending = await listPendingQueue("user-1");
    const recoveredNotebookIndex = pending.findIndex(
      (item) => item.entityType === "notebook" && item.entityId === "notebook-1",
    );
    const recoveredChildIndex = pending.findIndex(
      (item) => item.entityType === "page" && item.entityId === "recoverable-child",
    );
    expect(recoveredNotebookIndex).toBeGreaterThanOrEqual(0);
    expect(recoveredChildIndex).toBeGreaterThan(recoveredNotebookIndex);
    expect(pending[recoveredNotebookIndex]).toMatchObject({
      baseUpdatedAt: later,
      status: "pending",
    });
    expect(pending[recoveredChildIndex]).toMatchObject({ status: "pending" });
    expect(await offlineDb.queue.toArray()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          entityId: "real-conflict-child",
          status: "conflict",
        }),
      ]),
    );
  });
});
