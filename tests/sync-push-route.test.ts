import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  prisma: {
    $queryRaw: vi.fn(),
    $transaction: vi.fn(),
    notebook: {
      create: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      findUniqueOrThrow: vi.fn(),
      update: vi.fn(),
    },
    notebookGroup: {
      create: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
    },
    page: {
      create: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      findUniqueOrThrow: vi.fn(),
      update: vi.fn(),
    },
    entityTombstone: {
      deleteMany: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
    },
  },
  moveNotebookToTrash: vi.fn(),
  movePageToTrash: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  requireUser: mocks.requireUser,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: mocks.prisma,
}));

vi.mock("@/lib/trash", () => ({
  moveNotebookToTrash: mocks.moveNotebookToTrash,
  movePageToTrash: mocks.movePageToTrash,
  TRASH_GROUP_SYSTEM_KEY: "deleted-items",
}));

describe("sync push route", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.prisma.$transaction.mockImplementation(
      async (operation: (transaction: typeof mocks.prisma) => unknown) =>
        operation(mocks.prisma),
    );
    mocks.prisma.entityTombstone.deleteMany.mockResolvedValue({ count: 1 });
    mocks.prisma.entityTombstone.findMany.mockResolvedValue([]);
    mocks.prisma.entityTombstone.findUnique.mockImplementation(async ({ where }) => {
      const key = where.userId_entityType_entityId;
      const rows = await mocks.prisma.entityTombstone.findMany({ where: key });
      return rows.find((row: {
        userId: string;
        entityType: string;
        entityId: string;
      }) => (
        row.userId === key.userId &&
        row.entityType === key.entityType &&
        row.entityId === key.entityId
      )) ?? null;
    });
    mocks.prisma.notebookGroup.findMany.mockImplementation(async ({ where }) =>
      (where?.id?.in ?? []).map((id: string) => ({ id })),
    );
    mocks.prisma.notebookGroup.findFirst.mockImplementation(async ({ where }) => ({
      id: where?.id ?? "group-1",
    }));
    mocks.prisma.notebook.findFirst.mockImplementation(async ({ where }) => ({
      id: where?.id ?? "fallback-notebook",
    }));
    mocks.prisma.notebook.findMany.mockImplementation(async ({ where }) => {
      if (where?.userId) {
        return (where.id?.in ?? [])
          .filter((id: string) => id !== "missing-notebook" && id !== "deleted-notebook")
          .map((id: string) => ({ id }));
      }
      const id = where?.id?.in?.[0];
      if (!id) return [];
      const existing = await mocks.prisma.notebook.findUnique({ where: { id } });
      return existing ? [existing] : [];
    });
    mocks.prisma.page.findMany.mockImplementation(async ({ where }) => {
      const id = where?.id?.in?.[0];
      if (!id) return [];
      const existing = await mocks.prisma.page.findUnique({ where: { id } });
      return existing ? [existing] : [];
    });
  });

  it("accepts legacy queue metadata and preserves existing notebook groups", async () => {
    mocks.requireUser.mockResolvedValue({ id: "user-1" });
    mocks.prisma.notebook.findUnique.mockResolvedValue({
      id: "notebook-1",
      userId: "user-1",
      groupId: "group-1",
      name: "old",
      description: null,
      archived: false,
      updatedAt: new Date("2026-06-29T00:00:00.000Z"),
      deletedAt: null,
    });
    mocks.prisma.notebook.update.mockResolvedValue({
      id: "notebook-1",
      userId: "user-1",
      groupId: "group-1",
      name: "بدون مجموعه",
      description: null,
      archived: false,
      updatedAt: new Date("2026-06-30T00:00:00.000Z"),
      deletedAt: null,
    });

    const { POST } = await import("@/app/api/sync/push/route");
    const response = await POST(
      new Request("https://notavanote.ir/api/sync/push", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-request-id": "sync-request-42",
          "x-correlation-id": "sync-flow-7",
        },
        body: JSON.stringify({
          operations: [
            {
              id: "42",
              entityType: "notebook",
              entityId: "notebook-1",
              operation: "upsert",
              payload: {
                id: "notebook-1",
                userId: "user-1",
                groupId: null,
                name: "بدون مجموعه",
                archived: false,
                updatedAt: "2026-06-30T00:00:00.000Z",
              },
              createdAt: "2026-06-30T00:00:00.000Z",
              status: "synced",
            },
          ],
        }),
      }),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("x-request-id")).toBe("sync-request-42");
    expect(response.headers.get("x-correlation-id")).toBe("sync-flow-7");
    expect(mocks.prisma.notebook.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          groupId: "group-1",
          deletedAt: null,
        }),
      }),
    );
    expect(payload.applied).toEqual([
      {
        queueId: 42,
        entityType: "notebook",
        entityId: "notebook-1",
        operation: "upsert",
      },
    ]);
  });

  it("uses the existing page record as a fallback for legacy page payloads", async () => {
    mocks.requireUser.mockResolvedValue({ id: "user-1" });
    mocks.prisma.page.findUnique.mockResolvedValue({
      id: "page-1",
      userId: "user-1",
      notebookId: "notebook-1",
      title: "Server title",
      bodyHtml: "<p>Server body</p>",
      bodyText: "Server body",
      archived: false,
      updatedAt: new Date("2026-06-29T00:00:00.000Z"),
      deletedAt: null,
    });
    mocks.prisma.notebook.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: "notebook-1" });
    mocks.prisma.page.update.mockResolvedValue({
      id: "page-1",
      userId: "user-1",
      notebookId: "notebook-1",
      title: "Server title",
      bodyHtml: "<p>Server body</p>",
      bodyText: "Server body",
      archived: false,
      updatedAt: new Date("2026-06-30T00:00:00.000Z"),
      deletedAt: null,
    });

    const { POST } = await import("@/app/api/sync/push/route");
    const response = await POST(
      new Request("https://notavanote.ir/api/sync/push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          operations: [
            {
              id: 8,
              entityType: "page",
              entityId: "page-1",
              operation: "upsert",
              payload: {
                id: "page-1",
                notebookId: "missing-notebook",
              },
              createdAt: "2026-06-30T00:00:00.000Z",
              status: "failed",
            },
          ],
        }),
      }),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(mocks.prisma.page.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: "page-1" }),
        data: expect.objectContaining({
          notebookId: "notebook-1",
          title: "Server title",
          bodyHtml: "<p>Server body</p>",
          archived: false,
          deletedAt: null,
          originalNotebookId: null,
        }),
      }),
    );
    expect(payload.applied).toEqual([
      {
        queueId: 8,
        entityType: "page",
        entityId: "page-1",
        operation: "upsert",
      },
    ]);
  });

  it("does not create extra pages for idempotent page upserts", async () => {
    mocks.requireUser.mockResolvedValue({ id: "user-1" });
    mocks.prisma.page.findUnique.mockResolvedValue({
      id: "page-1",
      userId: "user-1",
      notebookId: "notebook-1",
      title: "Synced draft",
      bodyHtml: "<p>Same body</p>",
      bodyText: "Same body",
      archived: false,
      updatedAt: new Date("2026-06-30T10:00:00.000Z"),
      deletedAt: null,
    });
    mocks.prisma.notebook.findFirst.mockResolvedValue({ id: "notebook-1" });
    mocks.prisma.page.update.mockResolvedValue({
      id: "page-1",
      userId: "user-1",
      notebookId: "notebook-1",
      title: "Synced draft",
      bodyHtml: "<p>Same body</p>",
      bodyText: "Same body",
      archived: false,
      updatedAt: new Date("2026-06-30T10:01:00.000Z"),
      deletedAt: null,
    });

    const { POST } = await import("@/app/api/sync/push/route");
    const response = await POST(
      new Request("https://notavanote.ir/api/sync/push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          operations: [
            {
              id: 11,
              entityType: "page",
              entityId: "page-1",
              operation: "upsert",
              baseUpdatedAt: "2026-06-30T09:00:00.000Z",
              payload: {
                id: "page-1",
                notebookId: "notebook-1",
                title: "Synced draft",
                bodyHtml: "<p>Same body</p>",
                archived: false,
              },
              createdAt: "2026-06-30T10:02:00.000Z",
            },
          ],
        }),
      }),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(mocks.prisma.page.create).not.toHaveBeenCalled();
    expect(payload.conflicts).toEqual([]);
    expect(payload.applied).toEqual([
      {
        queueId: 11,
        entityType: "page",
        entityId: "page-1",
        operation: "upsert",
      },
    ]);
  });

  it("reports stale local page updates as conflicts without overwriting remote data", async () => {
    mocks.requireUser.mockResolvedValue({ id: "user-1" });
    mocks.prisma.page.findUnique.mockResolvedValue({
      id: "page-1",
      userId: "user-1",
      notebookId: "notebook-1",
      title: "Remote version",
      bodyHtml: "<p>Remote body</p>",
      bodyText: "Remote body",
      archived: false,
      updatedAt: new Date("2026-06-30T10:00:00.000Z"),
      deletedAt: null,
    });
    mocks.prisma.notebook.findFirst.mockResolvedValue({ id: "notebook-1" });
    mocks.prisma.page.update.mockResolvedValue({
      id: "page-1",
      userId: "user-1",
      notebookId: "notebook-1",
      title: "Local version",
      bodyHtml: "<p>Local body</p>",
      bodyText: "Local body",
      archived: false,
      updatedAt: new Date("2026-06-30T10:01:00.000Z"),
      deletedAt: null,
    });

    const { POST } = await import("@/app/api/sync/push/route");
    const response = await POST(
      new Request("https://notavanote.ir/api/sync/push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          operations: [
            {
              id: 12,
              entityType: "page",
              entityId: "page-1",
              operation: "upsert",
              baseUpdatedAt: "2026-06-30T09:00:00.000Z",
              payload: {
                id: "page-1",
                notebookId: "notebook-1",
                title: "Local version",
                bodyHtml: "<p>Local body</p>",
                archived: false,
              },
              createdAt: "2026-06-30T10:02:00.000Z",
            },
          ],
        }),
      }),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(mocks.prisma.page.update).not.toHaveBeenCalled();
    expect(mocks.prisma.page.create).not.toHaveBeenCalled();
    expect(mocks.prisma.page.findFirst).not.toHaveBeenCalled();
    expect(payload.conflicts).toEqual([
      expect.objectContaining({
        entityType: "page",
        entityId: "page-1",
        localPayload: expect.objectContaining({ title: "Local version" }),
        remotePayload: expect.objectContaining({ title: "Remote version" }),
      }),
    ]);
    expect(payload.pages).toEqual([
      expect.objectContaining({
        id: "page-1",
        title: "Remote version",
        bodyHtml: "<p>Remote body</p>",
        syncStatus: "synced",
      }),
    ]);
  });

  it("recovers orphan page upserts into an active notebook", async () => {
    mocks.requireUser.mockResolvedValue({ id: "user-1" });
    mocks.prisma.page.findUnique.mockResolvedValue(null);
    mocks.prisma.notebook.findFirst.mockImplementation(async ({ where }) =>
      where?.id === "deleted-notebook"
        ? null
        : { id: where?.id ?? "fallback-notebook" },
    );
    mocks.prisma.page.create.mockResolvedValue({
      id: "orphan-page",
      userId: "user-1",
      notebookId: "fallback-notebook",
      title: "Local draft",
      bodyHtml: "<p>Still here</p>",
      bodyText: "Still here",
      archived: false,
      updatedAt: new Date("2026-06-30T00:00:00.000Z"),
      deletedAt: null,
    });

    const { POST } = await import("@/app/api/sync/push/route");
    const response = await POST(
      new Request("https://notavanote.ir/api/sync/push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          operations: [
            {
              id: 10,
              entityType: "page",
              entityId: "orphan-page",
              operation: "upsert",
              payload: {
                id: "orphan-page",
                notebookId: "deleted-notebook",
                title: "Local draft",
                bodyHtml: "<p>Still here</p>",
                archived: false,
              },
              createdAt: "2026-06-30T00:00:00.000Z",
            },
          ],
        }),
      }),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(mocks.prisma.page.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          id: "orphan-page",
          notebookId: "fallback-notebook",
          title: "Local draft",
          bodyHtml: "<p>Still here</p>",
        }),
      }),
    );
    expect(payload.applied).toEqual([
      {
        queueId: 10,
        entityType: "page",
        entityId: "orphan-page",
        operation: "upsert",
      },
    ]);
  });

  it("treats already-removed archive operations as applied", async () => {
    mocks.requireUser.mockResolvedValue({ id: "user-1" });
    mocks.prisma.page.findUnique.mockResolvedValue(null);

    const { POST } = await import("@/app/api/sync/push/route");
    const response = await POST(
      new Request("https://notavanote.ir/api/sync/push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          operations: [
            {
              id: 9,
              entityType: "page",
              entityId: "page-2",
              operation: "archive",
              payload: {
                id: "page-2",
              },
              createdAt: "2026-06-30T00:00:00.000Z",
            },
          ],
        }),
      }),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(mocks.movePageToTrash).not.toHaveBeenCalled();
    expect(payload.applied).toEqual([
      {
        queueId: 9,
        entityType: "page",
        entityId: "page-2",
        operation: "archive",
      },
    ]);
  });

  it("returns a deletion conflict for a stale upsert against a page tombstone", async () => {
    mocks.requireUser.mockResolvedValue({ id: "user-1" });
    mocks.prisma.page.findUnique.mockResolvedValue(null);
    mocks.prisma.entityTombstone.findMany.mockResolvedValue([{
      id: "tombstone-1",
      userId: "user-1",
      entityType: "page",
      entityId: "page-deleted",
      deletedAt: new Date("2026-07-15T10:00:00.000Z"),
    }]);

    const { POST } = await import("@/app/api/sync/push/route");
    const response = await POST(new Request("https://notava.test/api/sync/push", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ operations: [{
        id: 20,
        entityType: "page",
        entityId: "page-deleted",
        operation: "upsert",
        payload: {
          id: "page-deleted",
          userId: "user-1",
          notebookId: "notebook-1",
          title: "stale",
        },
        createdAt: "2026-07-15T09:00:00.000Z",
      }] }),
    }));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(mocks.prisma.page.create).not.toHaveBeenCalled();
    expect(mocks.prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(mocks.prisma.$queryRaw).toHaveBeenCalledTimes(2);
    expect(payload.applied).toEqual([]);
    expect(payload.tombstones).toEqual([]);
    expect(payload.conflicts).toEqual([
      expect.objectContaining({
        entityType: "page",
        entityId: "page-deleted",
        localPayload: expect.objectContaining({ title: "stale" }),
        remotePayload: {
          id: "page-deleted",
          userId: "user-1",
          updatedAt: "2026-07-15T10:00:00.000Z",
          deletedAt: "2026-07-15T10:00:00.000Z",
          isTombstone: true,
        },
      }),
    ]);
  });

  it("atomically resurrects a page when prefetch misses a matching tombstone", async () => {
    const deletedAt = "2026-07-15T10:00:00.000Z";
    mocks.requireUser.mockResolvedValue({ id: "user-1" });
    mocks.prisma.entityTombstone.findMany.mockResolvedValueOnce([]).mockResolvedValue([{
      id: "page-tombstone",
      userId: "user-1",
      entityType: "page",
      entityId: "page-deleted",
      deletedAt: new Date(deletedAt),
    }]);
    mocks.prisma.page.create.mockResolvedValue({
      id: "page-deleted",
      userId: "user-1",
      notebookId: "notebook-1",
      title: "Recovered page",
      bodyHtml: "<p>Recovered body</p>",
      bodyText: "Recovered body",
      archived: false,
      updatedAt: new Date("2026-07-15T10:01:00.000Z"),
      deletedAt: null,
    });

    const { POST } = await import("@/app/api/sync/push/route");
    const response = await POST(new Request("https://notava.test/api/sync/push", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ operations: [{
        id: 21,
        entityType: "page",
        entityId: "page-deleted",
        operation: "upsert",
        baseUpdatedAt: deletedAt,
        payload: {
          id: "page-deleted",
          userId: "user-1",
          notebookId: "notebook-1",
          title: "Recovered page",
          bodyHtml: "<p>Recovered body</p>",
        },
        createdAt: "2026-07-15T10:00:30.000Z",
      }] }),
    }));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(mocks.prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(mocks.prisma.$queryRaw.mock.calls.map((call) => call[1])).toEqual([
      JSON.stringify(["notebook", "notebook-1"]),
      JSON.stringify(["page", "page-deleted"]),
    ]);
    expect(mocks.prisma.entityTombstone.deleteMany).toHaveBeenCalledWith({
      where: {
        id: "page-tombstone",
        userId: "user-1",
        entityType: "page",
        entityId: "page-deleted",
        deletedAt: new Date(deletedAt),
      },
    });
    expect(mocks.prisma.page.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        id: "page-deleted",
        userId: "user-1",
        notebookId: "notebook-1",
        title: "Recovered page",
      }),
    });
    expect(payload.applied).toEqual([expect.objectContaining({ queueId: 21 })]);
    expect(payload.conflicts).toEqual([]);
    expect(payload.tombstones).toEqual([]);
    expect(payload.pages).toEqual([
      expect.objectContaining({ id: "page-deleted", title: "Recovered page" }),
    ]);
  });

  it("atomically resurrects a notebook when prefetch misses a matching tombstone", async () => {
    const deletedAt = "2026-07-15T11:00:00.000Z";
    mocks.requireUser.mockResolvedValue({ id: "user-1" });
    mocks.prisma.entityTombstone.findMany.mockResolvedValueOnce([]).mockResolvedValue([{
      id: "notebook-tombstone",
      userId: "user-1",
      entityType: "notebook",
      entityId: "notebook-deleted",
      deletedAt: new Date(deletedAt),
    }]);
    mocks.prisma.notebook.create.mockResolvedValue({
      id: "notebook-deleted",
      userId: "user-1",
      groupId: "group-1",
      name: "Recovered notebook",
      description: null,
      archived: false,
      updatedAt: new Date("2026-07-15T11:01:00.000Z"),
      deletedAt: null,
    });

    const { POST } = await import("@/app/api/sync/push/route");
    const response = await POST(new Request("https://notava.test/api/sync/push", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ operations: [{
        id: 22,
        entityType: "notebook",
        entityId: "notebook-deleted",
        operation: "upsert",
        baseUpdatedAt: deletedAt,
        payload: {
          id: "notebook-deleted",
          userId: "user-1",
          groupId: "group-1",
          name: "Recovered notebook",
        },
        createdAt: "2026-07-15T11:00:30.000Z",
      }] }),
    }));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(mocks.prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(mocks.prisma.entityTombstone.deleteMany).toHaveBeenCalledWith({
      where: {
        id: "notebook-tombstone",
        userId: "user-1",
        entityType: "notebook",
        entityId: "notebook-deleted",
        deletedAt: new Date(deletedAt),
      },
    });
    expect(mocks.prisma.notebook.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        id: "notebook-deleted",
        userId: "user-1",
        groupId: "group-1",
        name: "Recovered notebook",
      }),
    });
    expect(payload.applied).toEqual([expect.objectContaining({ queueId: 22 })]);
    expect(payload.conflicts).toEqual([]);
    expect(payload.tombstones).toEqual([]);
    expect(payload.notebooks).toEqual([
      expect.objectContaining({
        id: "notebook-deleted",
        name: "Recovered notebook",
      }),
    ]);
  });

  it("keeps archive deletion-wins semantics for an existing tombstone", async () => {
    mocks.requireUser.mockResolvedValue({ id: "user-1" });
    mocks.prisma.entityTombstone.findMany.mockResolvedValue([{
      id: "page-tombstone",
      userId: "user-1",
      entityType: "page",
      entityId: "page-deleted",
      deletedAt: new Date("2026-07-15T10:00:00.000Z"),
    }]);

    const { POST } = await import("@/app/api/sync/push/route");
    const response = await POST(new Request("https://notava.test/api/sync/push", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ operations: [{
        id: 23,
        entityType: "page",
        entityId: "page-deleted",
        operation: "archive",
        payload: { id: "page-deleted", userId: "user-1" },
      }] }),
    }));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(mocks.prisma.$transaction).toHaveBeenCalledOnce();
    expect(payload.applied).toEqual([expect.objectContaining({ queueId: 23 })]);
    expect(payload.conflicts).toEqual([]);
    expect(payload.tombstones).toEqual([
      expect.objectContaining({ entityType: "page", entityId: "page-deleted" }),
    ]);
  });

  it("never removes a tombstone outside the authenticated user scope", async () => {
    const deletedAt = "2026-07-15T12:00:00.000Z";
    mocks.requireUser.mockResolvedValue({ id: "user-1" });
    mocks.prisma.entityTombstone.findMany.mockResolvedValue([{
      id: "foreign-tombstone",
      userId: "user-2",
      entityType: "page",
      entityId: "page-deleted",
      deletedAt: new Date(deletedAt),
    }]);
    mocks.prisma.entityTombstone.findUnique.mockResolvedValue({
      id: "foreign-tombstone",
      userId: "user-2",
      entityType: "page",
      entityId: "page-deleted",
      deletedAt: new Date(deletedAt),
    });
    mocks.prisma.entityTombstone.deleteMany.mockResolvedValue({ count: 0 });

    const { POST } = await import("@/app/api/sync/push/route");
    const response = await POST(new Request("https://notava.test/api/sync/push", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ operations: [{
        id: 24,
        entityType: "page",
        entityId: "page-deleted",
        operation: "upsert",
        baseUpdatedAt: deletedAt,
        payload: {
          id: "page-deleted",
          userId: "user-1",
          notebookId: "notebook-1",
          title: "Local page",
        },
      }] }),
    }));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(mocks.prisma.entityTombstone.deleteMany).toHaveBeenCalledWith({
      where: expect.objectContaining({
        id: "foreign-tombstone",
        userId: "user-1",
        entityType: "page",
        entityId: "page-deleted",
      }),
    });
    expect(mocks.prisma.page.create).not.toHaveBeenCalled();
    expect(payload.applied).toEqual([]);
    expect(payload.conflicts).toEqual([
      expect.objectContaining({
        remotePayload: expect.objectContaining({
          userId: "user-1",
          isTombstone: true,
        }),
      }),
    ]);
  });

  it("rejects oversized push batches", async () => {
    mocks.requireUser.mockResolvedValue({ id: "user-1" });
    const { POST } = await import("@/app/api/sync/push/route");
    const operations = Array.from({ length: 101 }, (_, index) => ({
      entityType: "page",
      entityId: `page-${index}`,
      operation: "archive",
      payload: { id: `page-${index}` },
      createdAt: "2026-07-15T09:00:00.000Z",
    }));
    const response = await POST(new Request("https://notava.test/api/sync/push", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ operations }),
    }));

    expect(response.status).toBe(400);
    expect(mocks.prisma.page.findMany).not.toHaveBeenCalled();
  });

  it("rejects malformed JSON and structurally invalid payloads", async () => {
    mocks.requireUser.mockResolvedValue({ id: "user-1" });
    const { POST } = await import("@/app/api/sync/push/route");

    const malformed = await POST(
      new Request("https://notava.test/api/sync/push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{",
      }),
    );
    const invalid = await POST(
      new Request("https://notava.test/api/sync/push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ operations: "invalid" }),
      }),
    );

    expect(malformed.status).toBe(400);
    await expect(malformed.json()).resolves.toMatchObject({
      error: "Invalid JSON payload.",
    });
    expect(invalid.status).toBe(400);
    await expect(invalid.json()).resolves.toMatchObject({
      error: "Invalid sync payload.",
      issues: expect.any(Array),
    });
  });

  it("rejects queue items belonging to another user", async () => {
    mocks.requireUser.mockResolvedValue({ id: "user-1" });
    const { POST } = await import("@/app/api/sync/push/route");
    const response = await POST(
      new Request("https://notava.test/api/sync/push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          operations: [{
            id: 31,
            userId: "user-2",
            entityType: "page",
            entityId: "foreign-page",
            operation: "archive",
            payload: { id: "foreign-page" },
          }],
        }),
      }),
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      error: "Forbidden sync queue scope.",
    });
    expect(mocks.prisma.page.findMany).not.toHaveBeenCalled();
  });

  it("returns a bounded processing error for an invalid notebook operation", async () => {
    mocks.requireUser.mockResolvedValue({ id: "user-1" });
    const { POST } = await import("@/app/api/sync/push/route");
    const response = await POST(
      new Request("https://notava.test/api/sync/push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          operations: [{
            id: "not-a-number",
            entityType: "notebook",
            entityId: "invalid-notebook",
            operation: "upsert",
            payload: { id: 12, name: "invalid" },
          }],
        }),
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: "Invalid notebook sync payload.",
      issues: expect.any(Array),
    });
  });

  it("turns prefetch failures into an observed server failure", async () => {
    mocks.requireUser.mockResolvedValue({ id: "user-1" });
    mocks.prisma.page.findMany.mockRejectedValue(new Error("database offline"));
    const { POST } = await import("@/app/api/sync/push/route");
    const response = await POST(
      new Request("https://notava.test/api/sync/push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          operations: [{
            entityType: "page",
            entityId: "page-1",
            operation: "archive",
            payload: { id: "page-1" },
          }],
        }),
      }),
    );

    expect(response.status).toBe(500);
  });

  it("ignores tombstones for unsupported entity types", async () => {
    mocks.requireUser.mockResolvedValue({ id: "user-1" });
    mocks.prisma.entityTombstone.findMany.mockResolvedValue([{
      id: "legacy-tombstone",
      userId: "user-1",
      entityType: "legacy",
      entityId: "page-absent",
      deletedAt: new Date("2026-07-15T10:00:00.000Z"),
    }]);
    const { POST } = await import("@/app/api/sync/push/route");
    const response = await POST(
      new Request("https://notava.test/api/sync/push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          operations: [{
            entityType: "page",
            entityId: "page-absent",
            operation: "archive",
            payload: { id: "page-absent" },
          }],
        }),
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ tombstones: [] });
  });

  it("uses the fresh locked notebook row instead of a stale prefetch snapshot", async () => {
    const prefetched = {
      id: "notebook-race",
      userId: "user-1",
      groupId: "group-1",
      name: "Prefetched",
      description: null,
      archived: false,
      updatedAt: new Date("2026-07-17T10:00:00.000Z"),
      deletedAt: null,
    };
    const fresh = {
      ...prefetched,
      name: "Other device won",
      updatedAt: new Date("2026-07-17T10:01:00.000Z"),
    };
    mocks.requireUser.mockResolvedValue({ id: "user-1" });
    mocks.prisma.notebook.findUnique
      .mockResolvedValueOnce(prefetched)
      .mockResolvedValue(fresh);

    const { POST } = await import("@/app/api/sync/push/route");
    const response = await POST(new Request("https://notava.test/api/sync/push", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ operations: [{
        id: 61,
        entityType: "notebook",
        entityId: "notebook-race",
        operation: "upsert",
        baseUpdatedAt: prefetched.updatedAt.toISOString(),
        payload: { id: "notebook-race", name: "My stale edit" },
      }] }),
    }));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(mocks.prisma.notebook.update).not.toHaveBeenCalled();
    expect(payload.applied).toEqual([]);
    expect(payload.conflicts).toEqual([
      expect.objectContaining({
        entityId: "notebook-race",
        remotePayload: expect.objectContaining({ name: "Other device won" }),
      }),
    ]);
  });

  it("uses the fresh locked page row instead of a stale prefetch snapshot", async () => {
    const prefetched = {
      id: "page-race",
      userId: "user-1",
      notebookId: "notebook-1",
      title: "Prefetched",
      bodyHtml: "<p>old</p>",
      bodyText: "old",
      archived: false,
      updatedAt: new Date("2026-07-17T10:00:00.000Z"),
      deletedAt: null,
    };
    const fresh = {
      ...prefetched,
      title: "Other device won",
      bodyHtml: "<p>newer</p>",
      bodyText: "newer",
      updatedAt: new Date("2026-07-17T10:01:00.000Z"),
    };
    mocks.requireUser.mockResolvedValue({ id: "user-1" });
    mocks.prisma.page.findUnique
      .mockResolvedValueOnce(prefetched)
      .mockResolvedValue(fresh);

    const { POST } = await import("@/app/api/sync/push/route");
    const response = await POST(new Request("https://notava.test/api/sync/push", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ operations: [{
        id: 62,
        entityType: "page",
        entityId: "page-race",
        operation: "upsert",
        baseUpdatedAt: prefetched.updatedAt.toISOString(),
        payload: {
          id: "page-race",
          notebookId: "notebook-1",
          title: "My stale edit",
          bodyHtml: "<p>mine</p>",
        },
      }] }),
    }));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(mocks.prisma.page.update).not.toHaveBeenCalled();
    expect(payload.conflicts).toEqual([
      expect.objectContaining({
        entityId: "page-race",
        remotePayload: expect.objectContaining({ title: "Other device won" }),
      }),
    ]);
  });

  it("does not consume a resurrection tombstone when the locked target became inactive", async () => {
    const deletedAt = new Date("2026-07-17T10:00:00.000Z");
    mocks.requireUser.mockResolvedValue({ id: "user-1" });
    mocks.prisma.page.findUnique.mockResolvedValue(null);
    mocks.prisma.notebook.findFirst.mockResolvedValue(null);
    mocks.prisma.entityTombstone.findMany.mockResolvedValue([{
      id: "page-race-tombstone",
      userId: "user-1",
      entityType: "page",
      entityId: "page-parent-race",
      deletedAt,
    }]);

    const { POST } = await import("@/app/api/sync/push/route");
    const response = await POST(new Request("https://notava.test/api/sync/push", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ operations: [{
        id: 63,
        entityType: "page",
        entityId: "page-parent-race",
        operation: "upsert",
        baseUpdatedAt: deletedAt.toISOString(),
        payload: {
          id: "page-parent-race",
          notebookId: "notebook-became-inactive",
          title: "Do not resurrect",
        },
      }] }),
    }));

    expect(response.status).toBe(400);
    expect(mocks.prisma.page.create).not.toHaveBeenCalled();
    expect(mocks.prisma.entityTombstone.deleteMany).not.toHaveBeenCalled();
  });

  it("turns an edit that lands between archive prefetch and lock into a conflict", async () => {
    const prefetched = {
      id: "page-archive-race",
      userId: "user-1",
      notebookId: "notebook-1",
      title: "Before",
      bodyHtml: "<p>before</p>",
      bodyText: "before",
      archived: false,
      updatedAt: new Date("2026-07-17T10:00:00.000Z"),
      deletedAt: null,
    };
    const fresh = {
      ...prefetched,
      title: "Edited concurrently",
      updatedAt: new Date("2026-07-17T10:01:00.000Z"),
    };
    mocks.requireUser.mockResolvedValue({ id: "user-1" });
    mocks.prisma.page.findUnique
      .mockResolvedValueOnce(prefetched)
      .mockResolvedValueOnce(prefetched)
      .mockResolvedValue(fresh);
    mocks.movePageToTrash.mockResolvedValue(null);

    const { POST } = await import("@/app/api/sync/push/route");
    const response = await POST(new Request("https://notava.test/api/sync/push", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ operations: [{
        id: 64,
        entityType: "page",
        entityId: "page-archive-race",
        operation: "archive",
        baseUpdatedAt: prefetched.updatedAt.toISOString(),
        payload: { id: "page-archive-race" },
      }] }),
    }));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(mocks.movePageToTrash).toHaveBeenCalledWith(
      "user-1",
      "page-archive-race",
      prefetched.updatedAt,
    );
    expect(payload.conflicts).toEqual([
      expect.objectContaining({
        entityId: "page-archive-race",
        remotePayload: expect.objectContaining({ title: "Edited concurrently" }),
      }),
    ]);
  });
});
