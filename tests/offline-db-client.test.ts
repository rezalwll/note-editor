import "fake-indexeddb/auto";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  applyPullChanges,
  applySyncPushResult,
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
});
