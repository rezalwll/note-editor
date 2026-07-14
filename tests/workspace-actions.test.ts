import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  revalidate: vi.fn(),
  redirect: vi.fn(),
  transaction: vi.fn(),
  groupFindFirst: vi.fn(),
  groupFindUnique: vi.fn(),
  groupFindMany: vi.fn(),
  groupUpdate: vi.fn(),
  groupCreate: vi.fn(),
  notebookFindFirst: vi.fn(),
  notebookFindMany: vi.fn(),
  notebookUpdate: vi.fn(),
  pageFindFirst: vi.fn(),
  pageFindMany: vi.fn(),
  pageUpdate: vi.fn(),
  pageCreate: vi.fn(),
  restoreNotebooks: vi.fn(),
  moveNotebook: vi.fn(),
  deleteNotebooks: vi.fn(),
  movePage: vi.fn(),
  restorePage: vi.fn(),
  deletePage: vi.fn(),
  emptyTrash: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ requireUser: mocks.requireUser }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/lib/trash", () => ({
  TRASH_GROUP_SYSTEM_KEY: "deleted-items",
  ensureTrashGroup: vi.fn(),
  restoreNotebooksToGroup: mocks.restoreNotebooks,
  moveNotebookToTrash: mocks.moveNotebook,
  deleteTrashNotebooks: mocks.deleteNotebooks,
  movePageToTrash: mocks.movePage,
  restorePageFromTrash: mocks.restorePage,
  deleteTrashPage: mocks.deletePage,
  emptyTrash: mocks.emptyTrash,
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: mocks.transaction,
    notebookGroup: {
      findFirst: mocks.groupFindFirst,
      findUnique: mocks.groupFindUnique,
      findMany: mocks.groupFindMany,
      update: mocks.groupUpdate,
      create: mocks.groupCreate,
    },
    notebook: {
      findFirst: mocks.notebookFindFirst,
      findMany: mocks.notebookFindMany,
      update: mocks.notebookUpdate,
    },
    page: {
      findFirst: mocks.pageFindFirst,
      findMany: mocks.pageFindMany,
      update: mocks.pageUpdate,
      create: mocks.pageCreate,
    },
  },
}));

import {
  archiveNotebookInlineAction,
  archivePageInlineAction,
  assignNotebookGroupInlineAction,
  createPageInlineAction,
  deleteNotebookPermanentlyInlineAction,
  deletePagePermanentlyInlineAction,
  emptyTrashInlineAction,
  renameNotebookGroupInlineAction,
  renameNotebookInlineAction,
  reorderNotebookGroupsInlineAction,
  reorderNotebooksInlineAction,
  reorderPagesInlineAction,
  restoreNotebookGroupInlineAction,
  restorePageInlineAction,
  updateNotebookAction,
  updateNotebookGroupThemeInlineAction,
  updateNotebookThemeInlineAction,
  updateTagsAction,
} from "@/app/actions/workspace-actions";

const groupId = "clgroup000000000000000001";
const notebookId = "clnotebook000000000000001";
const pageId = "clpage0000000000000000001";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireUser.mockResolvedValue({ id: "user-1" });
  mocks.groupFindFirst.mockResolvedValue({
    id: groupId, name: "Group", systemKey: null, sortOrder: 0, themeKey: "iris",
  });
  mocks.groupFindUnique.mockResolvedValue(null);
  mocks.groupFindMany.mockImplementation(async (args: { where: { id: { in: string[] } } }) =>
    args.where.id.in.map((id) => ({ id })),
  );
  mocks.notebookFindFirst.mockImplementation(async (args: { where: { id?: string } }) =>
    args.where.id
      ? { id: notebookId, userId: "user-1", groupId, archived: false, deletedAt: null, systemKey: null, themeKey: "iris" }
      : { sortOrder: 0 },
  );
  mocks.notebookFindMany.mockImplementation(async (args: { where: { id: { in: string[] } } }) =>
    args.where.id.in.map((id) => ({ id, systemKey: null })),
  );
  mocks.pageFindFirst.mockImplementation(async (args: { where: { id?: string } }) =>
    args.where.id ? { id: pageId, notebookId, archived: false } : { sortOrder: 0 },
  );
  mocks.pageFindMany.mockImplementation(async (args: { where: { id: { in: string[] } } }) =>
    args.where.id.in.map((id) => ({ id })),
  );
  mocks.pageCreate.mockResolvedValue({ id: pageId });
  mocks.transaction.mockImplementation(async (input: unknown) =>
    Promise.all(input as Promise<unknown>[]),
  );
  mocks.moveNotebook.mockResolvedValue("trash-group");
  mocks.deleteNotebooks.mockResolvedValue(1);
  mocks.movePage.mockResolvedValue({ notebookId, trashNotebookId: "trash-notebook" });
  mocks.restorePage.mockResolvedValue({ notebookId });
  mocks.deletePage.mockResolvedValue(true);
  mocks.emptyTrash.mockResolvedValue(3);
});

describe("workspace mutation actions", () => {
  it("renames and themes owned groups and notebooks", async () => {
    await expect(renameNotebookGroupInlineAction(groupId, "Renamed")).resolves.toEqual({ success: true });
    await expect(updateNotebookGroupThemeInlineAction(groupId, "sky")).resolves.toEqual({ success: true });
    await expect(renameNotebookInlineAction(notebookId, "Renamed notebook")).resolves.toEqual({ success: true });
    await expect(updateNotebookThemeInlineAction(notebookId, "mint")).resolves.toEqual({ success: true });
    expect(mocks.groupUpdate).toHaveBeenCalledTimes(2);
    expect(mocks.notebookUpdate).toHaveBeenCalledTimes(2);
  });

  it("restores groups and assigns notebooks", async () => {
    await expect(restoreNotebookGroupInlineAction({
      id: groupId, name: "Restored", themeKey: "iris", sortOrder: 1, notebookIds: [notebookId],
    })).resolves.toEqual({ success: true });
    expect(mocks.groupCreate).toHaveBeenCalledOnce();
    expect(mocks.restoreNotebooks).toHaveBeenCalledWith("user-1", [notebookId], groupId);

    await expect(assignNotebookGroupInlineAction([notebookId], groupId)).resolves.toEqual({ success: true });
    expect(mocks.restoreNotebooks).toHaveBeenCalledTimes(2);

    await expect(restoreNotebookGroupInlineAction({
      id: groupId,
      name: "Empty restored group",
      themeKey: null,
      sortOrder: 2,
      notebookIds: [notebookId],
      discardPlaceholder: true,
    })).resolves.toEqual({ success: true });
    expect(mocks.deleteNotebooks).toHaveBeenCalledWith("user-1", [notebookId]);
  });

  it("persists group, notebook and page ordering", async () => {
    await expect(reorderNotebookGroupsInlineAction([groupId])).resolves.toEqual({ success: true });
    await expect(reorderNotebooksInlineAction(groupId, [notebookId])).resolves.toEqual({ success: true });
    await expect(reorderPagesInlineAction(notebookId, [pageId])).resolves.toEqual({ success: true });
    expect(mocks.transaction).toHaveBeenCalledTimes(3);
  });

  it("updates notebook fields, creates pages and replaces tags", async () => {
    const notebookForm = new FormData();
    notebookForm.set("id", notebookId);
    notebookForm.set("name", "Updated");
    notebookForm.set("description", "Description");
    await updateNotebookAction(notebookForm);

    await expect(createPageInlineAction(notebookId, "New page")).resolves.toEqual({ id: pageId });

    const tagsForm = new FormData();
    tagsForm.set("pageId", pageId);
    tagsForm.set("tags", "one, two");
    await updateTagsAction(tagsForm);
    expect(mocks.pageUpdate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ tags: expect.any(Object) }),
    }));
  });

  it("archives, restores and permanently deletes trash entities", async () => {
    await expect(archiveNotebookInlineAction(notebookId)).resolves.toMatchObject({ success: true });
    await expect(deleteNotebookPermanentlyInlineAction(notebookId)).resolves.toEqual({ success: true });
    await expect(archivePageInlineAction(pageId)).resolves.toMatchObject({ success: true, notebookId });
    await expect(restorePageInlineAction(pageId)).resolves.toEqual({ success: true, notebookId });
    await expect(deletePagePermanentlyInlineAction(pageId)).resolves.toEqual({ success: true });
    await expect(emptyTrashInlineAction()).resolves.toEqual({ success: true, deletedCount: 3 });
  });
});
