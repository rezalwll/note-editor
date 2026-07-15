import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  prisma: {
    notebook: {
      create: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      findUniqueOrThrow: vi.fn(),
      update: vi.fn(),
    },
    notebookGroup: {
      create: vi.fn(),
      findFirst: vi.fn(),
    },
    page: {
      create: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      findUniqueOrThrow: vi.fn(),
      update: vi.fn(),
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
    vi.clearAllMocks();
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
        data: expect.objectContaining({ groupId: "group-1" }),
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
        where: { id: "page-1" },
        data: expect.objectContaining({
          notebookId: "notebook-1",
          title: "Server title",
          bodyHtml: "<p>Server body</p>",
          archived: false,
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
    mocks.prisma.notebook.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: "fallback-notebook" });
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
});
