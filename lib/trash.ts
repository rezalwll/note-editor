import { prisma } from "@/lib/prisma";
import { deleteUpload } from "@/lib/storage";

export const TRASH_GROUP_SYSTEM_KEY = "deleted-items";
export const TRASH_PAGES_NOTEBOOK_SYSTEM_KEY = "deleted-pages";
export const TRASH_RETENTION_DAYS = 30;

const TRASH_GROUP_NAME = "حذف‌شده‌ها";
const TRASH_PAGES_NOTEBOOK_NAME = "صفحه‌های حذف‌شده";

export async function ensureTrashGroup(userId: string) {
  const systemGroup = await prisma.notebookGroup.findFirst({
    where: { userId, systemKey: TRASH_GROUP_SYSTEM_KEY },
    select: { id: true, name: true, systemKey: true },
  });

  if (systemGroup) {
    if (systemGroup.name === TRASH_GROUP_NAME) {
      return systemGroup;
    }

    return prisma.notebookGroup.update({
      where: { id: systemGroup.id },
      data: { name: TRASH_GROUP_NAME },
      select: { id: true, name: true, systemKey: true },
    });
  }

  const legacyGroup = await prisma.notebookGroup.findFirst({
    where: { userId, name: TRASH_GROUP_NAME, systemKey: null },
    select: { id: true },
  });

  if (legacyGroup) {
    return prisma.notebookGroup.update({
      where: { id: legacyGroup.id },
      data: { systemKey: TRASH_GROUP_SYSTEM_KEY },
      select: { id: true, name: true, systemKey: true },
    });
  }

  return prisma.notebookGroup.create({
    data: {
      userId,
      name: TRASH_GROUP_NAME,
      systemKey: TRASH_GROUP_SYSTEM_KEY,
    },
    select: { id: true, name: true, systemKey: true },
  });
}

export async function ensureTrashPagesNotebook(userId: string) {
  const trashGroup = await ensureTrashGroup(userId);
  const existing = await prisma.notebook.findFirst({
    where: { userId, systemKey: TRASH_PAGES_NOTEBOOK_SYSTEM_KEY },
    select: {
      id: true,
      groupId: true,
      name: true,
      deletedAt: true,
    },
  });

  if (existing) {
    if (
      existing.groupId === trashGroup.id &&
      existing.name === TRASH_PAGES_NOTEBOOK_NAME &&
      existing.deletedAt
    ) {
      return existing;
    }

    return prisma.notebook.update({
      where: { id: existing.id },
      data: {
        groupId: trashGroup.id,
        name: TRASH_PAGES_NOTEBOOK_NAME,
        archived: false,
        deletedAt: existing.deletedAt ?? new Date(),
      },
      select: { id: true, groupId: true, name: true, deletedAt: true },
    });
  }

  return prisma.notebook.create({
    data: {
      userId,
      groupId: trashGroup.id,
      systemKey: TRASH_PAGES_NOTEBOOK_SYSTEM_KEY,
      name: TRASH_PAGES_NOTEBOOK_NAME,
      deletedAt: new Date(),
    },
    select: { id: true, groupId: true, name: true, deletedAt: true },
  });
}

export async function moveNotebookToTrash(userId: string, notebookId: string) {
  const trashGroup = await ensureTrashGroup(userId);
  const deletedAt = new Date();

  await prisma.$transaction([
    prisma.notebook.update({
      where: { id: notebookId },
      data: {
        groupId: trashGroup.id,
        archived: false,
        deletedAt,
      },
    }),
    prisma.page.updateMany({
      where: { userId, notebookId },
      data: { archived: false, deletedAt },
    }),
  ]);

  return trashGroup.id;
}

export async function restoreNotebooksToGroup(
  userId: string,
  notebookIds: string[],
  groupId: string,
) {
  await prisma.$transaction([
    prisma.notebook.updateMany({
      where: { userId, id: { in: notebookIds } },
      data: {
        groupId,
        archived: false,
        deletedAt: null,
      },
    }),
    prisma.page.updateMany({
      where: { userId, notebookId: { in: notebookIds } },
      data: { archived: false, deletedAt: null },
    }),
  ]);
}

export async function movePageToTrash(userId: string, pageId: string) {
  const page = await prisma.page.findFirst({
    where: {
      id: pageId,
      userId,
      notebook: { userId, archived: false, deletedAt: null },
    },
    select: { id: true, notebookId: true },
  });

  if (!page) {
    return null;
  }

  const trashNotebook = await ensureTrashPagesNotebook(userId);
  const deletedAt = new Date();

  await prisma.$transaction([
    prisma.page.update({
      where: { id: page.id },
      data: {
        notebookId: trashNotebook.id,
        originalNotebookId: page.notebookId,
        archived: false,
        deletedAt,
      },
    }),
    prisma.notebook.update({
      where: { id: trashNotebook.id },
      data: { deletedAt },
    }),
  ]);

  return {
    notebookId: page.notebookId,
    trashNotebookId: trashNotebook.id,
  };
}

export async function restorePageFromTrash(userId: string, pageId: string) {
  const page = await prisma.page.findFirst({
    where: { id: pageId, userId, deletedAt: { not: null } },
    select: { id: true, originalNotebookId: true },
  });

  if (!page?.originalNotebookId) {
    return null;
  }

  const targetNotebook = await prisma.notebook.findFirst({
    where: {
      id: page.originalNotebookId,
      userId,
      archived: false,
      deletedAt: null,
    },
    select: { id: true },
  });

  if (!targetNotebook) {
    return null;
  }

  await prisma.page.update({
    where: { id: page.id },
    data: {
      notebookId: targetNotebook.id,
      originalNotebookId: null,
      archived: false,
      deletedAt: null,
    },
  });

  return { notebookId: targetNotebook.id };
}

async function deleteAttachmentsForPages(userId: string, pageIds: string[]) {
  if (pageIds.length === 0) {
    return;
  }

  const attachments = await prisma.attachment.findMany({
    where: { userId, pageId: { in: pageIds } },
    select: { storageKey: true },
  });

  await Promise.all(
    attachments.map((attachment) => deleteUpload(attachment.storageKey)),
  );
}

async function purgeTrashPages(userId: string, pageIds: string[]) {
  if (pageIds.length === 0) {
    return 0;
  }

  await deleteAttachmentsForPages(userId, pageIds);
  const result = await prisma.page.deleteMany({
    where: { userId, id: { in: pageIds } },
  });

  return result.count;
}

async function purgeTrashNotebooks(userId: string, notebookIds: string[]) {
  if (notebookIds.length === 0) {
    return 0;
  }

  const pages = await prisma.page.findMany({
    where: { userId, notebookId: { in: notebookIds } },
    select: { id: true },
  });
  await deleteAttachmentsForPages(
    userId,
    pages.map((page) => page.id),
  );

  const result = await prisma.notebook.deleteMany({
    where: { userId, id: { in: notebookIds } },
  });

  return result.count;
}

export async function deleteTrashNotebooks(
  userId: string,
  notebookIds: string[],
) {
  const trashGroup = await ensureTrashGroup(userId);
  const notebooks = await prisma.notebook.findMany({
    where: {
      userId,
      id: { in: notebookIds },
      groupId: trashGroup.id,
      deletedAt: { not: null },
    },
    select: { id: true },
  });

  return purgeTrashNotebooks(
    userId,
    notebooks.map((notebook) => notebook.id),
  );
}

export async function deleteTrashPage(userId: string, pageId: string) {
  const page = await prisma.page.findFirst({
    where: {
      id: pageId,
      userId,
      deletedAt: { not: null },
      notebook: {
        group: { systemKey: TRASH_GROUP_SYSTEM_KEY },
      },
    },
    select: { id: true },
  });

  if (!page) {
    return false;
  }

  await purgeTrashPages(userId, [page.id]);
  return true;
}

export async function purgeExpiredTrash(userId: string) {
  const trashGroup = await ensureTrashGroup(userId);
  const cutoff = new Date(
    Date.now() - TRASH_RETENTION_DAYS * 24 * 60 * 60 * 1000,
  );

  const [expiredNotebooks, expiredPages] = await Promise.all([
    prisma.notebook.findMany({
      where: {
        userId,
        groupId: trashGroup.id,
        systemKey: null,
        deletedAt: { lte: cutoff },
      },
      select: { id: true },
    }),
    prisma.page.findMany({
      where: {
        userId,
        deletedAt: { lte: cutoff },
        notebook: { systemKey: TRASH_PAGES_NOTEBOOK_SYSTEM_KEY },
      },
      select: { id: true },
    }),
  ]);

  const [notebookCount, pageCount] = await Promise.all([
    purgeTrashNotebooks(
      userId,
      expiredNotebooks.map((notebook) => notebook.id),
    ),
    purgeTrashPages(
      userId,
      expiredPages.map((page) => page.id),
    ),
  ]);

  return notebookCount + pageCount;
}

export async function emptyTrash(userId: string) {
  const trashGroup = await ensureTrashGroup(userId);
  const trashNotebooks = await prisma.notebook.findMany({
    where: { userId, groupId: trashGroup.id },
    select: { id: true },
  });

  return purgeTrashNotebooks(
    userId,
    trashNotebooks.map((notebook) => notebook.id),
  );
}
