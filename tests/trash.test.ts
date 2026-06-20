import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
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
  deleteUpload: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
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
  restoreNotebooksToGroup,
  restorePageFromTrash,
} from "@/lib/trash";

describe("trash lifecycle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.transaction.mockImplementation(async (operations: Promise<unknown>[]) =>
      Promise.all(operations),
    );
    mocks.notebookGroupFindFirst.mockResolvedValue({
      id: "trash-group",
      name: "حذف‌شده‌ها",
      systemKey: "deleted-items",
    });
    mocks.notebookUpdate.mockResolvedValue({ id: "notebook-1" });
    mocks.notebookUpdateMany.mockResolvedValue({ count: 1 });
    mocks.pageUpdate.mockResolvedValue({ id: "page-1" });
    mocks.pageUpdateMany.mockResolvedValue({ count: 1 });
  });

  it("moves a notebook and all of its pages into trash atomically", async () => {
    await expect(
      moveNotebookToTrash("user-1", "notebook-1"),
    ).resolves.toBe("trash-group");

    expect(mocks.notebookUpdate).toHaveBeenCalledWith({
      where: { id: "notebook-1" },
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
  });

  it("restores notebook and page deletion markers when moved out of trash", async () => {
    await restoreNotebooksToGroup(
      "user-1",
      ["notebook-1", "notebook-2"],
      "group-1",
    );

    expect(mocks.notebookUpdateMany).toHaveBeenCalledWith({
      where: {
        userId: "user-1",
        id: { in: ["notebook-1", "notebook-2"] },
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
  });

  it("moves an individual page to the system trash notebook", async () => {
    mocks.pageFindFirst.mockResolvedValue({
      id: "page-1",
      notebookId: "notebook-1",
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

    expect(mocks.pageUpdate).toHaveBeenCalledWith({
      where: { id: "page-1" },
      data: {
        notebookId: "trash-pages",
        originalNotebookId: "notebook-1",
        archived: false,
        deletedAt: expect.any(Date),
      },
    });
  });

  it("restores an individual page to its original live notebook", async () => {
    mocks.pageFindFirst.mockResolvedValue({
      id: "page-1",
      originalNotebookId: "notebook-1",
    });
    mocks.notebookFindFirst.mockResolvedValue({ id: "notebook-1" });

    await expect(
      restorePageFromTrash("user-1", "page-1"),
    ).resolves.toEqual({ notebookId: "notebook-1" });

    expect(mocks.pageUpdate).toHaveBeenCalledWith({
      where: { id: "page-1" },
      data: {
        notebookId: "notebook-1",
        originalNotebookId: null,
        archived: false,
        deletedAt: null,
      },
    });
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
      where: { userId: "user-1", id: { in: ["notebook-1"] } },
    });
    expect(mocks.deleteUpload).toHaveBeenCalledWith("upload-1");
  });

  it("permanently deletes a trashed page and its uploads", async () => {
    mocks.pageFindFirst.mockResolvedValue({ id: "page-1" });
    mocks.attachmentFindMany.mockResolvedValue([{ storageKey: "upload-1" }]);
    mocks.pageDeleteMany.mockResolvedValue({ count: 1 });

    await expect(deleteTrashPage("user-1", "page-1")).resolves.toBe(true);

    expect(mocks.pageDeleteMany).toHaveBeenCalledWith({
      where: { userId: "user-1", id: { in: ["page-1"] } },
    });
    expect(mocks.deleteUpload).toHaveBeenCalledWith("upload-1");
  });
});
