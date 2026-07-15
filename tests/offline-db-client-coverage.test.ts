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

  it("applies page and notebook tombstones including child sync state", async () => {
    const events: unknown[] = [];
    window.addEventListener("notava-sync", (event) => {
      events.push((event as CustomEvent).detail);
    }, { once: false });
    await offlineDb.notebooks.bulkPut([
      notebook(),
      notebook({ id: "foreign-notebook", userId: "user-2" }),
    ]);
    await offlineDb.pages.bulkPut([
      page(),
      page({ id: "child-page", notebookId: "notebook-1" }),
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

    expect(await offlineDb.pages.get("page-1")).toBeUndefined();
    expect(await offlineDb.pages.get("child-page")).toBeUndefined();
    expect(await offlineDb.notebooks.get("notebook-1")).toBeUndefined();
    expect(await offlineDb.pages.get("foreign-page")).toBeDefined();
    expect(await offlineDb.notebooks.get("foreign-notebook")).toBeDefined();
    expect(await offlineDb.queue.count()).toBe(0);
    expect(await offlineDb.conflicts.count()).toBe(0);
    expect(events).toHaveLength(4);
  });
});

describe("offline local mutations and queueing", () => {
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
      payload: expect.objectContaining({ title: "second" }),
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
      payload: expect.objectContaining({ name: "second" }),
    });
  });

  it("replaces previous operations with page and notebook archives", async () => {
    await offlineDb.pages.put(page({ lastSyncedAt: now }));
    await enqueuePageUpsert(page(), now);
    await enqueuePageArchive(page({ lastSyncedAt: now }), later);
    await enqueueNotebookUpsert(notebook(), now);
    await enqueueNotebookArchive(notebook(), later);

    expect(await offlineDb.queue.toArray()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ entityType: "page", operation: "archive", baseUpdatedAt: later }),
        expect.objectContaining({ entityType: "notebook", operation: "archive", baseUpdatedAt: later }),
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
});
