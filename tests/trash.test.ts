import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  queryRaw: vi.fn(),
  transaction: vi.fn(),
  notebookGroupFindFirst: vi.fn(),
  notebookGroupUpdate: vi.fn(),
  notebookGroupCreate: vi.fn(),
  notebookFindFirst: vi.fn(),
  notebookFindMany: vi.fn(),
  notebookCreate: vi.fn(),
  notebookUpdate: vi.fn(),
  notebookUpdateMany: vi.fn(),
  notebookDeleteMany: vi.fn(),
  pageFindFirst: vi.fn(),
  pageFindMany: vi.fn(),
  pageUpdate: vi.fn(),
  pageUpdateMany: vi.fn(),
  pageDeleteMany: vi.fn(),
  attachmentFindMany: vi.fn(),
  tombstoneDeleteMany: vi.fn(),
  tombstoneCreateMany: vi.fn(),
  deleteUpload: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    $queryRaw: mocks.queryRaw,
    $transaction: mocks.transaction,
    notebookGroup: {
      findFirst: mocks.notebookGroupFindFirst,
      update: mocks.notebookGroupUpdate,
      create: mocks.notebookGroupCreate,
    },
    notebook: {
      findFirst: mocks.notebookFindFirst,
      findMany: mocks.notebookFindMany,
      create: mocks.notebookCreate,
      update: mocks.notebookUpdate,
      updateMany: mocks.notebookUpdateMany,
      deleteMany: mocks.notebookDeleteMany,
    },
    page: {
      findFirst: mocks.pageFindFirst,
      findMany: mocks.pageFindMany,
      update: mocks.pageUpdate,
      updateMany: mocks.pageUpdateMany,
      deleteMany: mocks.pageDeleteMany,
    },
    attachment: {
      findMany: mocks.attachmentFindMany,
    },
    entityTombstone: {
      deleteMany: mocks.tombstoneDeleteMany,
      createMany: mocks.tombstoneCreateMany,
    },
  },
}));

vi.mock("@/lib/storage", () => ({
  deleteUpload: mocks.deleteUpload,
}));

import {
  deleteTrashNotebooks,
  deleteTrashPage,
  moveNotebookToTrash,
  movePageToTrash,
  purgeExpiredTrash,
  restoreNotebooksToGroup,
  restorePageFromTrash,
} from "@/lib/trash";

describe("trash lifecycle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.queryRaw.mockResolvedValue([]);
    mocks.transaction.mockImplementation(async (
      operation: Promise<unknown>[] | ((transaction: unknown) => unknown),
    ) => {
      if (typeof operation === "function") {
        return operation({
          $queryRaw: mocks.queryRaw,
          entityTombstone: {
            deleteMany: mocks.tombstoneDeleteMany,
            createMany: mocks.tombstoneCreateMany,
          },
          notebook: {
            findFirst: mocks.notebookFindFirst,
            findMany: mocks.notebookFindMany,
            updateMany: mocks.notebookUpdateMany,
            deleteMany: mocks.notebookDeleteMany,
          },
          page: {
            findFirst: mocks.pageFindFirst,
            findMany: mocks.pageFindMany,
            update: mocks.pageUpdate,
            updateMany: mocks.pageUpdateMany,
            deleteMany: mocks.pageDeleteMany,
          },
          attachment: { findMany: mocks.attachmentFindMany },
        });
      }
      return Promise.all(operation);
    });
    mocks.notebookGroupFindFirst.mockResolvedValue({
      id: "trash-group",
      name: "حذف‌شده‌ها",
      systemKey: "deleted-items",
    });
    mocks.notebookUpdate.mockResolvedValue({ id: "notebook-1" });
    mocks.notebookUpdateMany.mockResolvedValue({ count: 1 });
    mocks.pageUpdate.mockResolvedValue({ id: "page-1" });
    mocks.pageUpdateMany.mockResolvedValue({ count: 1 });
    mocks.tombstoneDeleteMany.mockResolvedValue({ count: 0 });
    mocks.tombstoneCreateMany.mockResolvedValue({ count: 1 });
  });

  it("moves a notebook and all of its pages into trash atomically", async () => {
    const updatedAt = new Date("2026-07-01T00:00:00.000Z");
    mocks.notebookFindFirst.mockResolvedValue({ id: "notebook-1", updatedAt });
    mocks.pageFindMany.mockResolvedValue([{ id: "page-1" }]);

    await expect(
      moveNotebookToTrash("user-1", "notebook-1"),
    ).resolves.toBe("trash-group");

    expect(mocks.notebookUpdateMany).toHaveBeenCalledWith({
      where: {
        id: "notebook-1",
        userId: "user-1",
        deletedAt: null,
        updatedAt,
      },
      data: {
        groupId: "trash-group",
        archived: false,
        deletedAt: expect.any(Date),
      },
    });
    expect(mocks.pageUpdateMany).toHaveBeenCalledWith({
      where: { userId: "user-1", notebookId: "notebook-1" },
      data: { archived: false, deletedAt: expect.any(Date) },
    });
    expect(mocks.transaction).toHaveBeenCalledTimes(1);
    expect(mocks.queryRaw).toHaveBeenCalledTimes(1);
    expect(mocks.queryRaw.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.notebookUpdateMany.mock.invocationCallOrder[0],
    );
  });

  it("moves an empty notebook into trash even when it has no pages", async () => {
    const updatedAt = new Date("2026-07-01T00:00:00.000Z");
    mocks.notebookFindFirst.mockResolvedValue({ id: "empty-notebook", updatedAt });
    mocks.pageFindMany.mockResolvedValue([]);
    mocks.pageUpdateMany.mockResolvedValue({ count: 0 });

    await expect(
      moveNotebookToTrash("user-1", "empty-notebook"),
    ).resolves.toBe("trash-group");

    expect(mocks.notebookUpdateMany).toHaveBeenCalledWith({
      where: {
        id: "empty-notebook",
        userId: "user-1",
        deletedAt: null,
        updatedAt,
      },
      data: {
        groupId: "trash-group",
        archived: false,
        deletedAt: expect.any(Date),
      },
    });
    expect(mocks.pageUpdateMany).toHaveBeenCalledWith({
      where: { userId: "user-1", notebookId: "empty-notebook" },
      data: { archived: false, deletedAt: expect.any(Date) },
    });
    expect(mocks.queryRaw).toHaveBeenCalledTimes(1);
  });

  it("restores notebook and page deletion markers when moved out of trash", async () => {
    mocks.notebookFindMany.mockResolvedValue([
      { id: "notebook-1", deletedAt: new Date("2026-07-01T00:00:00.000Z") },
      { id: "notebook-2", deletedAt: new Date("2026-07-01T00:00:00.000Z") },
    ]);
    mocks.pageFindMany.mockResolvedValue([{ id: "page-1" }]);

    await restoreNotebooksToGroup(
      "user-1",
      ["notebook-1", "notebook-2"],
      "group-1",
    );

    expect(mocks.notebookUpdateMany).toHaveBeenCalledWith({
      where: {
        userId: "user-1",
        id: { in: ["notebook-1", "notebook-2"] },
        systemKey: null,
      },
      data: { groupId: "group-1", archived: false, deletedAt: null },
    });
    expect(mocks.pageUpdateMany).toHaveBeenCalledWith({
      where: {
        userId: "user-1",
        notebookId: { in: ["notebook-1", "notebook-2"] },
      },
      data: { archived: false, deletedAt: null },
    });
    expect(mocks.queryRaw).toHaveBeenCalledTimes(2);
    expect(mocks.queryRaw.mock.invocationCallOrder[1]).toBeLessThan(
      mocks.notebookUpdateMany.mock.invocationCallOrder[0],
    );
    expect(mocks.notebookUpdateMany.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.pageUpdateMany.mock.invocationCallOrder[0],
    );
  });

  it("moves a live notebook between regular groups", async () => {
    mocks.notebookFindMany.mockResolvedValue([
      { id: "notebook-1", deletedAt: null },
    ]);

    await restoreNotebooksToGroup(
      "user-1",
      ["notebook-1"],
      "group-2",
    );

    expect(mocks.notebookUpdateMany).toHaveBeenCalledWith({
      where: {
        userId: "user-1",
        id: { in: ["notebook-1"] },
        systemKey: null,
      },
      data: { groupId: "group-2", archived: false, deletedAt: null },
    });
    expect(mocks.pageUpdateMany).not.toHaveBeenCalled();
  });

  it("moves an individual page to the system trash notebook", async () => {
    const updatedAt = new Date("2026-07-01T00:00:00.000Z");
    mocks.pageFindFirst.mockResolvedValue({
      id: "page-1",
      notebookId: "notebook-1",
      updatedAt,
    });
    mocks.notebookFindFirst.mockResolvedValue({
      id: "trash-pages",
      groupId: "trash-group",
      name: "صفحه‌های حذف‌شده",
      deletedAt: new Date(),
    });

    await expect(movePageToTrash("user-1", "page-1")).resolves.toEqual({
      notebookId: "notebook-1",
      trashNotebookId: "trash-pages",
    });

    expect(mocks.pageUpdateMany).toHaveBeenCalledWith({
      where: {
        id: "page-1",
        userId: "user-1",
        notebookId: "notebook-1",
        deletedAt: null,
        updatedAt,
      },
      data: {
        notebookId: "trash-pages",
        originalNotebookId: "notebook-1",
        archived: false,
        deletedAt: expect.any(Date),
      },
    });
    expect(mocks.notebookUpdateMany).toHaveBeenCalledWith({
      where: {
        id: "trash-pages",
        userId: "user-1",
        systemKey: "deleted-pages",
      },
      data: { deletedAt: expect.any(Date) },
    });
    expect(mocks.queryRaw).toHaveBeenCalledTimes(3);
  });

  it("restores an individual page to its original live notebook", async () => {
    const updatedAt = new Date("2026-07-01T00:00:00.000Z");
    mocks.pageFindFirst.mockResolvedValue({
      id: "page-1",
      notebookId: "trash-pages",
      originalNotebookId: "notebook-1",
      updatedAt,
    });
    mocks.notebookFindFirst.mockResolvedValue({ id: "notebook-1" });

    await expect(
      restorePageFromTrash("user-1", "page-1"),
    ).resolves.toEqual({ notebookId: "notebook-1" });

    expect(mocks.pageUpdateMany).toHaveBeenCalledWith({
      where: {
        id: "page-1",
        userId: "user-1",
        notebookId: "trash-pages",
        originalNotebookId: "notebook-1",
        deletedAt: { not: null },
        updatedAt,
      },
      data: {
        notebookId: "notebook-1",
        originalNotebookId: null,
        archived: false,
        deletedAt: null,
      },
    });
    expect(mocks.queryRaw).toHaveBeenCalledTimes(3);
    expect(mocks.pageFindFirst).toHaveBeenCalledTimes(2);
    expect(mocks.queryRaw.mock.invocationCallOrder[2]).toBeLessThan(
      mocks.pageFindFirst.mock.invocationCallOrder[1],
    );
  });

  it("does not restore a page when permanent deletion wins while locks are acquired", async () => {
    mocks.pageFindFirst
      .mockResolvedValueOnce({
        id: "page-1",
        notebookId: "trash-pages",
        originalNotebookId: "notebook-1",
        updatedAt: new Date("2026-07-01T00:00:00.000Z"),
      })
      .mockResolvedValueOnce(null);

    await expect(
      restorePageFromTrash("user-1", "page-1"),
    ).resolves.toBeNull();

    expect(mocks.queryRaw).toHaveBeenCalledTimes(3);
    expect(mocks.pageFindFirst).toHaveBeenCalledTimes(2);
    expect(mocks.notebookFindFirst).not.toHaveBeenCalled();
    expect(mocks.pageUpdateMany).not.toHaveBeenCalled();
  });

  it("permanently deletes only notebooks owned by the user inside trash", async () => {
    mocks.notebookFindMany.mockResolvedValue([{ id: "notebook-1" }]);
    mocks.pageFindMany.mockResolvedValue([{ id: "page-1" }]);
    mocks.attachmentFindMany.mockResolvedValue([{ storageKey: "upload-1" }]);
    mocks.notebookDeleteMany.mockResolvedValue({ count: 1 });

    await expect(
      deleteTrashNotebooks("user-1", ["notebook-1", "foreign-notebook"]),
    ).resolves.toBe(1);

    expect(mocks.notebookDeleteMany).toHaveBeenCalledWith({
      where: {
        userId: "user-1",
        id: { in: ["notebook-1"] },
        deletedAt: { not: null },
      },
    });
    expect(mocks.deleteUpload).toHaveBeenCalledWith("upload-1");
    expect(mocks.tombstoneCreateMany).toHaveBeenCalledWith({
      data: expect.arrayContaining([
        expect.objectContaining({ entityType: "notebook", entityId: "notebook-1" }),
        expect.objectContaining({ entityType: "page", entityId: "page-1" }),
      ]),
    });
    expect(mocks.queryRaw).toHaveBeenCalledTimes(1);
    expect(mocks.queryRaw.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.pageFindMany.mock.invocationCallOrder[0],
    );
    expect(mocks.pageFindMany.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.attachmentFindMany.mock.invocationCallOrder[0],
    );
  });

  it("permanently deletes a trashed page and its uploads", async () => {
    mocks.pageFindFirst.mockResolvedValue({ id: "page-1" });
    mocks.pageFindMany.mockResolvedValue([
      { id: "page-1", notebookId: "trash-pages" },
    ]);
    mocks.attachmentFindMany.mockResolvedValue([{ storageKey: "upload-1" }]);
    mocks.pageDeleteMany.mockResolvedValue({ count: 1 });

    await expect(deleteTrashPage("user-1", "page-1")).resolves.toBe(true);

    expect(mocks.pageDeleteMany).toHaveBeenCalledWith({
      where: {
        userId: "user-1",
        id: { in: ["page-1"] },
        OR: [{ id: "page-1", notebookId: "trash-pages" }],
        deletedAt: { not: null },
      },
    });
    expect(mocks.deleteUpload).toHaveBeenCalledWith("upload-1");
    expect(mocks.tombstoneCreateMany).toHaveBeenCalledWith({
      data: [expect.objectContaining({
        userId: "user-1",
        entityType: "page",
        entityId: "page-1",
      })],
    });
    expect(mocks.queryRaw).toHaveBeenCalledTimes(1);
  });

  it("never creates a tombstone when the conditional purge no longer deletes the page", async () => {
    mocks.pageFindFirst.mockResolvedValue({ id: "page-1" });
    mocks.pageFindMany.mockResolvedValue([
      { id: "page-1", notebookId: "trash-pages" },
    ]);
    mocks.attachmentFindMany.mockResolvedValue([]);
    mocks.pageDeleteMany.mockResolvedValue({ count: 0 });

    await expect(deleteTrashPage("user-1", "page-1")).rejects.toThrow(
      "TRASH_PURGE_CHANGED_DURING_TRANSACTION",
    );

    expect(mocks.tombstoneDeleteMany).toHaveBeenCalled();
    expect(mocks.tombstoneCreateMany).not.toHaveBeenCalled();
    expect(mocks.deleteUpload).not.toHaveBeenCalled();
  });

  it("does not tombstone or delete files when a page moved out before purge acquired its parent lock", async () => {
    mocks.pageFindFirst.mockResolvedValue({ id: "page-race" });
    mocks.pageFindMany
      .mockResolvedValueOnce([{ id: "page-race", notebookId: "trash-pages" }])
      .mockResolvedValueOnce([{ id: "page-race", notebookId: "live-notebook" }]);

    await expect(deleteTrashPage("user-1", "page-race")).resolves.toBe(false);

    expect(mocks.queryRaw).toHaveBeenCalledOnce();
    expect(mocks.pageDeleteMany).not.toHaveBeenCalled();
    expect(mocks.tombstoneDeleteMany).not.toHaveBeenCalled();
    expect(mocks.tombstoneCreateMany).not.toHaveBeenCalled();
    expect(mocks.attachmentFindMany).not.toHaveBeenCalled();
    expect(mocks.deleteUpload).not.toHaveBeenCalled();
  });

  it("purges a notebook with thousands of pages using one hierarchy lock", async () => {
    const pages = Array.from({ length: 5_000 }, (_, index) => ({
      id: `page-${index}`,
    }));
    mocks.notebookFindMany.mockResolvedValue([{ id: "large-notebook" }]);
    mocks.pageFindMany.mockResolvedValue(pages);
    mocks.attachmentFindMany.mockResolvedValue([]);
    mocks.notebookDeleteMany.mockResolvedValue({ count: 1 });

    await expect(
      deleteTrashNotebooks("user-1", ["large-notebook"]),
    ).resolves.toBe(1);

    expect(mocks.queryRaw).toHaveBeenCalledOnce();
    expect(mocks.tombstoneCreateMany).toHaveBeenCalledWith({
      data: expect.arrayContaining([
        expect.objectContaining({
          entityType: "page",
          entityId: "page-4999",
        }),
      ]),
    });
  });

  it("purges thousands of pages in one trash notebook with one hierarchy lock", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-17T12:00:00.000Z"));
    const pages = Array.from({ length: 5_000 }, (_, index) => ({
      id: `expired-page-${index}`,
    }));
    const pagesWithParent = pages.map((page) => ({
      ...page,
      notebookId: "trash-pages",
    }));
    mocks.notebookFindMany.mockResolvedValue([]);
    mocks.pageFindMany
      .mockResolvedValueOnce(pages)
      .mockResolvedValueOnce(pagesWithParent)
      .mockResolvedValueOnce(pagesWithParent);
    mocks.attachmentFindMany.mockResolvedValue([]);
    mocks.pageDeleteMany.mockResolvedValue({ count: pages.length });

    await expect(purgeExpiredTrash("user-1")).resolves.toBe(pages.length);

    expect(mocks.queryRaw).toHaveBeenCalledOnce();
    expect(mocks.pageDeleteMany).toHaveBeenCalledOnce();
    expect(mocks.tombstoneCreateMany).toHaveBeenCalledOnce();
    vi.useRealTimers();
  });

  it("rechecks the retention cutoff after locking and skips refreshed trash", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-17T12:00:00.000Z"));
    const cutoff = new Date("2026-06-17T12:00:00.000Z");
    mocks.notebookFindMany
      .mockResolvedValueOnce([{ id: "expired-notebook" }])
      .mockResolvedValueOnce([]);
    mocks.pageFindMany
      .mockResolvedValueOnce([{ id: "expired-page" }])
      .mockResolvedValueOnce([]);

    await expect(purgeExpiredTrash("user-1")).resolves.toBe(0);

    expect(mocks.notebookFindMany).toHaveBeenLastCalledWith({
      where: {
        userId: "user-1",
        id: { in: ["expired-notebook"] },
        deletedAt: { lte: cutoff },
      },
      select: { id: true },
    });
    expect(mocks.pageFindMany).toHaveBeenLastCalledWith({
      where: {
        userId: "user-1",
        id: { in: ["expired-page"] },
        deletedAt: { lte: cutoff },
      },
      select: { id: true, notebookId: true },
    });
    expect(mocks.notebookDeleteMany).not.toHaveBeenCalled();
    expect(mocks.pageDeleteMany).not.toHaveBeenCalled();
    expect(mocks.tombstoneCreateMany).not.toHaveBeenCalled();
    vi.useRealTimers();
  });
});
