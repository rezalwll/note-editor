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
        headers: { "Content-Type": "application/json" },
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
