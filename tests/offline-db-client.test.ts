import "fake-indexeddb/auto";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  applyPullChanges,
  applySyncPushResult,
  enqueuePageUpsert,
  listPendingQueue,
  listConflictRecords,
  resolveConflictWithLocal,
  resolveConflictWithRemote,
} from "@/lib/offline-db/client";
import { offlineDb } from "@/lib/offline-db/db";
import type { LocalPage } from "@/lib/offline-db/types";

const localPendingPage: LocalPage = {
  id: "page-1",
  userId: "user-1",
  notebookId: "notebook-1",
  title: "Local draft",
  bodyHtml: "local",
  bodyText: "local",
  archived: false,
  updatedAt: "2026-07-14T10:00:00.000Z",
  syncStatus: "pending",
};

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

afterEach(() => offlineDb.close());

describe("offline sync merge", () => {
  it("does not overwrite a pending local page during pull", async () => {
    await offlineDb.pages.put(localPendingPage);

    await applyPullChanges("user-1", {
      fetchedAt: "2026-07-14T10:05:00.000Z",
      notebooks: [],
      pages: [{
        ...localPendingPage,
        title: "Remote draft",
        bodyHtml: "remote",
        bodyText: "remote",
        updatedAt: "2026-07-14T10:04:00.000Z",
        syncStatus: "synced",
      }],
    });

    expect(await offlineDb.pages.get("page-1")).toMatchObject({
      title: "Local draft",
      syncStatus: "pending",
    });
  });

  it("replaces the local page when the server version wins a conflict", async () => {
    await offlineDb.pages.put({ ...localPendingPage, syncStatus: "conflict" });
    await offlineDb.queue.add({
      userId: "user-1",
      entityType: "page",
      entityId: "page-1",
      operation: "upsert",
      payload: localPendingPage,
      createdAt: localPendingPage.updatedAt,
      status: "conflict",
    });
    const remotePage: LocalPage = {
      ...localPendingPage,
      title: "Remote draft",
      bodyHtml: "remote",
      bodyText: "remote",
      updatedAt: "2026-07-14T10:05:00.000Z",
      syncStatus: "synced",
    };
    await offlineDb.conflicts.put({
      id: "user-1:page:page-1:remote",
      userId: "user-1",
      entityType: "page",
      entityId: "page-1",
      createdAt: remotePage.updatedAt,
      message: "conflict",
      localPayload: localPendingPage,
      remotePayload: remotePage,
    });

    await resolveConflictWithRemote("user-1", "user-1:page:page-1:remote");

    expect(await offlineDb.pages.get("page-1")).toMatchObject({
      title: "Remote draft",
      syncStatus: "synced",
      lastSyncedAt: remotePage.updatedAt,
    });
    expect(await offlineDb.queue.count()).toBe(0);
    expect(await listConflictRecords("user-1")).toEqual([]);
  });

  it("requeues the local page against the remote timestamp when local wins", async () => {
    await offlineDb.pages.put({ ...localPendingPage, syncStatus: "conflict" });
    const remotePage: LocalPage = {
      ...localPendingPage,
      title: "Remote draft",
      updatedAt: "2026-07-14T10:05:00.000Z",
      syncStatus: "synced",
    };
    await offlineDb.conflicts.put({
      id: "user-1:page:page-1:remote",
      userId: "user-1",
      entityType: "page",
      entityId: "page-1",
      createdAt: remotePage.updatedAt,
      message: "conflict",
      localPayload: localPendingPage,
      remotePayload: remotePage,
    });

    await resolveConflictWithLocal("user-1", "user-1:page:page-1:remote");

    expect(await offlineDb.pages.get("page-1")).toMatchObject({
      title: "Local draft",
      syncStatus: "pending",
    });
    expect(await offlineDb.queue.toArray()).toEqual([
      expect.objectContaining({
        entityId: "page-1",
        status: "pending",
        baseUpdatedAt: remotePage.updatedAt,
      }),
    ]);
    expect(await listConflictRecords("user-1")).toEqual([]);
  });

  it("keeps local content and marks its queue item when push conflicts", async () => {
    await offlineDb.pages.put(localPendingPage);
    await offlineDb.queue.add({
      userId: "user-1",
      entityType: "page",
      entityId: "page-1",
      operation: "upsert",
      payload: localPendingPage,
      createdAt: localPendingPage.updatedAt,
      status: "pending",
    });

    await applySyncPushResult("user-1", {
      applied: [],
      conflicts: [{
        id: "page:page-1:remote",
        userId: "user-1",
        entityType: "page",
        entityId: "page-1",
        createdAt: "2026-07-14T10:05:00.000Z",
        message: "conflict",
        localPayload: localPendingPage,
        remotePayload: { title: "Remote draft" },
      }],
      notebooks: [],
      pages: [{
        ...localPendingPage,
        title: "Remote draft",
        syncStatus: "synced",
      }],
      pulledAt: "2026-07-14T10:05:00.000Z",
    });

    expect(await offlineDb.pages.get("page-1")).toMatchObject({
      title: "Local draft",
      syncStatus: "conflict",
    });
    expect((await offlineDb.queue.toArray())[0]).toMatchObject({ status: "conflict" });
  });

  it("removes permanently deleted pages and their pending sync state", async () => {
    await offlineDb.pages.put(localPendingPage);
    await offlineDb.queue.add({
      userId: "user-1",
      entityType: "page",
      entityId: "page-1",
      operation: "upsert",
      payload: localPendingPage,
      createdAt: localPendingPage.updatedAt,
      status: "pending",
    });
    await offlineDb.conflicts.put({
      id: "user-1:page:page-1:remote",
      userId: "user-1",
      entityType: "page",
      entityId: "page-1",
      createdAt: localPendingPage.updatedAt,
      message: "conflict",
    });

    await applyPullChanges("user-1", {
      fetchedAt: "2026-07-15T10:00:00.000Z",
      notebooks: [],
      pages: [],
      tombstones: [{
        id: "tombstone-1",
        entityType: "page",
        entityId: "page-1",
        deletedAt: "2026-07-15T09:59:00.000Z",
      }],
      hasMore: false,
      nextCursor: null,
    });

    expect(await offlineDb.pages.get("page-1")).toBeUndefined();
    expect(await offlineDb.queue.count()).toBe(0);
    expect(await offlineDb.conflicts.count()).toBe(0);
  });

  it("uses the compound user/status queue index and respects batch size", async () => {
    await offlineDb.queue.bulkAdd([
      {
        userId: "user-1",
        entityType: "page",
        entityId: "page-2",
        operation: "upsert",
        payload: { userId: "user-1" },
        createdAt: "2026-07-15T10:00:02.000Z",
        status: "pending",
      },
      {
        userId: "user-1",
        entityType: "page",
        entityId: "page-1",
        operation: "upsert",
        payload: { userId: "user-1" },
        createdAt: "2026-07-15T10:00:01.000Z",
        status: "failed",
      },
      {
        userId: "user-2",
        entityType: "page",
        entityId: "foreign-page",
        operation: "upsert",
        payload: { userId: "user-2" },
        createdAt: "2026-07-15T10:00:00.000Z",
        status: "pending",
      },
    ]);

    expect(await listPendingQueue("user-1", 1)).toEqual([
      expect.objectContaining({ entityId: "page-1", userId: "user-1" }),
    ]);
  });

  it("coalesces concurrent page autosaves into one queue operation", async () => {
    await Promise.all([
      enqueuePageUpsert({ ...localPendingPage, title: "First revision" }),
      enqueuePageUpsert({ ...localPendingPage, title: "Second revision" }),
      enqueuePageUpsert({ ...localPendingPage, title: "Final revision" }),
    ]);

    const queue = await offlineDb.queue.toArray();
    expect(queue).toHaveLength(1);
    expect(queue[0]).toMatchObject({
      userId: "user-1",
      entityType: "page",
      entityId: "page-1",
      operation: "upsert",
      status: "pending",
    });
  });
});
