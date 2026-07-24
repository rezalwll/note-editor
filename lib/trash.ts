import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { acquireSyncEntityLocks } from "@/lib/sync/entity-lock";
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

export async function moveNotebookToTrash(
  userId: string,
  notebookId: string,
  expectedUpdatedAt?: Date,
) {
  const trashGroup = await ensureTrashGroup(userId);

  const movedToTrash = await prisma.$transaction(async (transaction) => {
    await acquireSyncEntityLocks(transaction, userId, [
      { entityType: "notebook", entityId: notebookId },
    ]);

    const notebook = await transaction.notebook.findFirst({
      where: { id: notebookId, userId, deletedAt: null },
      select: { id: true, updatedAt: true },
    });
    if (
      !notebook ||
      (expectedUpdatedAt &&
        notebook.updatedAt.getTime() !== expectedUpdatedAt.getTime())
    ) {
      return false;
    }

    const deletedAt = new Date();
    const moved = await transaction.notebook.updateMany({
      where: {
        id: notebook.id,
        userId,
        deletedAt: null,
        updatedAt: notebook.updatedAt,
      },
      data: {
        groupId: trashGroup.id,
        archived: false,
        deletedAt,
      },
    });
    if (moved.count !== 1) {
      return false;
    }

    await transaction.page.updateMany({
      where: { userId, notebookId: notebook.id },
      data: { archived: false, deletedAt },
    });
    return true;
  });

  return movedToTrash ? trashGroup.id : null;
}

export async function restoreNotebooksToGroup(
  userId: string,
  notebookIds: string[],
  groupId: string,
) {
  if (notebookIds.length === 0) {
    return;
  }

  await prisma.$transaction(async (transaction) => {
    await acquireSyncEntityLocks(
      transaction,
      userId,
      notebookIds.map((entityId) => ({ entityType: "notebook", entityId })),
    );

    const notebooks = await transaction.notebook.findMany({
      where: {
        userId,
        id: { in: notebookIds },
        systemKey: null,
      },
      select: { id: true, deletedAt: true },
    });
    const assignableNotebookIds = notebooks.map((notebook) => notebook.id);
    if (assignableNotebookIds.length === 0) {
      return;
    }
    const restoredNotebookIds = notebooks
      .filter((notebook) => notebook.deletedAt !== null)
      .map((notebook) => notebook.id);

    await transaction.notebook.updateMany({
      where: {
        userId,
        id: { in: assignableNotebookIds },
        systemKey: null,
      },
      data: {
        groupId,
        archived: false,
        deletedAt: null,
      },
    });

    if (restoredNotebookIds.length > 0) {
      await transaction.page.updateMany({
        where: { userId, notebookId: { in: restoredNotebookIds } },
        data: { archived: false, deletedAt: null },
      });
    }
  });
}

export async function movePageToTrash(
  userId: string,
  pageId: string,
  expectedUpdatedAt?: Date,
) {
  const candidate = await prisma.page.findFirst({
    where: {
      id: pageId,
      userId,
      notebook: { userId, archived: false, deletedAt: null },
    },
    select: { id: true, notebookId: true, updatedAt: true },
  });

  if (!candidate) {
    return null;
  }

  const trashNotebook = await ensureTrashPagesNotebook(userId);

  return prisma.$transaction(async (transaction) => {
    await acquireSyncEntityLocks(transaction, userId, [
      { entityType: "notebook", entityId: candidate.notebookId },
      { entityType: "notebook", entityId: trashNotebook.id },
      { entityType: "page", entityId: pageId },
    ]);

    const [page, currentTrashNotebook] = await Promise.all([
      transaction.page.findFirst({
        where: {
          id: pageId,
          userId,
          notebookId: candidate.notebookId,
          deletedAt: null,
          notebook: { userId, archived: false, deletedAt: null },
        },
        select: { id: true, notebookId: true, updatedAt: true },
      }),
      transaction.notebook.findFirst({
        where: {
          id: trashNotebook.id,
          userId,
          systemKey: TRASH_PAGES_NOTEBOOK_SYSTEM_KEY,
        },
        select: { id: true },
      }),
    ]);
    if (
      !page ||
      !currentTrashNotebook ||
      (expectedUpdatedAt && page.updatedAt.getTime() !== expectedUpdatedAt.getTime())
    ) {
      return null;
    }

    const deletedAt = new Date();
    const moved = await transaction.page.updateMany({
      where: {
        id: page.id,
        userId,
        notebookId: page.notebookId,
        deletedAt: null,
        updatedAt: page.updatedAt,
      },
      data: {
        notebookId: currentTrashNotebook.id,
        originalNotebookId: page.notebookId,
        archived: false,
        deletedAt,
      },
    });
    if (moved.count !== 1) {
      return null;
    }

    await transaction.notebook.updateMany({
      where: {
        id: currentTrashNotebook.id,
        userId,
        systemKey: TRASH_PAGES_NOTEBOOK_SYSTEM_KEY,
      },
      data: { deletedAt },
    });

    return {
      notebookId: page.notebookId,
      trashNotebookId: currentTrashNotebook.id,
    };
  });
}

export async function restorePageFromTrash(userId: string, pageId: string) {
  const candidate = await prisma.page.findFirst({
    where: { id: pageId, userId, deletedAt: { not: null } },
    select: {
      id: true,
      notebookId: true,
      originalNotebookId: true,
      updatedAt: true,
    },
  });
  if (!candidate?.originalNotebookId) {
    return null;
  }
  const originalNotebookId = candidate.originalNotebookId;

  return prisma.$transaction(async (transaction) => {
    await acquireSyncEntityLocks(transaction, userId, [
      { entityType: "notebook", entityId: candidate.notebookId },
      { entityType: "notebook", entityId: originalNotebookId },
      { entityType: "page", entityId: pageId },
    ]);

    const page = await transaction.page.findFirst({
      where: {
        id: pageId,
        userId,
        notebookId: candidate.notebookId,
        originalNotebookId,
        deletedAt: { not: null },
      },
      select: { id: true, originalNotebookId: true, updatedAt: true },
    });
    if (!page?.originalNotebookId) {
      return null;
    }

    const targetNotebook = await transaction.notebook.findFirst({
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

    const restored = await transaction.page.updateMany({
      where: {
        id: page.id,
        userId,
        notebookId: candidate.notebookId,
        originalNotebookId: targetNotebook.id,
        deletedAt: { not: null },
        updatedAt: page.updatedAt,
      },
      data: {
        notebookId: targetNotebook.id,
        originalNotebookId: null,
        archived: false,
        deletedAt: null,
      },
    });

    return restored.count === 1 ? { notebookId: targetNotebook.id } : null;
  });
}

async function getAttachmentStorageKeys(
  userId: string,
  pageIds: string[],
  database: Pick<Prisma.TransactionClient, "attachment"> = prisma,
) {
  if (pageIds.length === 0) {
    return [];
  }

  const attachments = await database.attachment.findMany({
    where: { userId, pageId: { in: pageIds } },
    select: { storageKey: true },
  });

  return attachments.map((attachment) => attachment.storageKey);
}

async function deleteUploads(storageKeys: string[]) {
  await Promise.all(storageKeys.map((storageKey) => deleteUpload(storageKey)));
}

async function purgeTrashPages(
  userId: string,
  pageIds: string[],
  deletedBefore?: Date,
) {
  if (pageIds.length === 0) {
    return 0;
  }

  const deletedAtFilter = deletedBefore
    ? { lte: deletedBefore }
    : { not: null };
  const candidates = await prisma.page.findMany({
    where: { userId, id: { in: pageIds }, deletedAt: deletedAtFilter },
    select: { id: true, notebookId: true },
  });
  if (candidates.length === 0) {
    return 0;
  }
  const candidateNotebookByPage = new Map(
    candidates.map((page) => [page.id, page.notebookId]),
  );

  const result = await prisma.$transaction(async (transaction) => {
    await acquireSyncEntityLocks(
      transaction,
      userId,
      [
        ...candidates.map((page) => ({
          entityType: "notebook" as const,
          entityId: page.notebookId,
        })),
      ],
    );
    const pages = await transaction.page.findMany({
      where: { userId, id: { in: pageIds }, deletedAt: deletedAtFilter },
      select: { id: true, notebookId: true },
    });
    const authoritativePages = pages.filter(
      (page) => candidateNotebookByPage.get(page.id) === page.notebookId,
    );
    const authoritativePageIds = authoritativePages.map((page) => page.id);
    if (authoritativePageIds.length === 0) {
      return { count: 0, storageKeys: [] };
    }

    const storageKeys = await getAttachmentStorageKeys(
      userId,
      authoritativePageIds,
      transaction,
    );
    const deletedAt = new Date();
    await transaction.entityTombstone.deleteMany({
      where: {
        userId,
        entityType: "page",
        entityId: { in: authoritativePageIds },
      },
    });
    const deleted = await transaction.page.deleteMany({
      where: {
        userId,
        id: { in: authoritativePageIds },
        OR: authoritativePages.map((page) => ({
          id: page.id,
          notebookId: page.notebookId,
        })),
        deletedAt: deletedAtFilter,
      },
    });
    if (deleted.count !== authoritativePageIds.length) {
      throw new Error("TRASH_PURGE_CHANGED_DURING_TRANSACTION");
    }
    await transaction.entityTombstone.createMany({
      data: authoritativePageIds.map((entityId) => ({
        userId,
        entityType: "page",
        entityId,
        deletedAt,
      })),
    });
    return { count: deleted.count, storageKeys };
  });

  await deleteUploads(result.storageKeys);
  return result.count;
}

async function purgeTrashNotebooks(
  userId: string,
  notebookIds: string[],
  deletedBefore?: Date,
) {
  if (notebookIds.length === 0) {
    return 0;
  }

  const result = await prisma.$transaction(async (transaction) => {
    await acquireSyncEntityLocks(
      transaction,
      userId,
      notebookIds.map((entityId) => ({ entityType: "notebook", entityId })),
    );
    const deletedAtFilter = deletedBefore
      ? { lte: deletedBefore }
      : { not: null };
    const notebooks = await transaction.notebook.findMany({
      where: {
        userId,
        id: { in: notebookIds },
        deletedAt: deletedAtFilter,
      },
      select: { id: true },
    });
    const authoritativeNotebookIds = notebooks.map((notebook) => notebook.id);
    if (authoritativeNotebookIds.length === 0) {
      return { count: 0, storageKeys: [] };
    }

    const pages = await transaction.page.findMany({
      where: { userId, notebookId: { in: authoritativeNotebookIds } },
      select: { id: true },
    });
    const storageKeys = await getAttachmentStorageKeys(
      userId,
      pages.map((page) => page.id),
      transaction,
    );

    const tombstones = [
      ...authoritativeNotebookIds.map((entityId) => ({
        userId,
        entityType: "notebook",
        entityId,
      })),
      ...pages.map((page) => ({
        userId,
        entityType: "page",
        entityId: page.id,
      })),
    ];
    const deletedAt = new Date();
    await transaction.entityTombstone.deleteMany({
      where: {
        userId,
        OR: [
          {
            entityType: "notebook",
            entityId: { in: authoritativeNotebookIds },
          },
          { entityType: "page", entityId: { in: pages.map((page) => page.id) } },
        ],
      },
    });
    const deleted = await transaction.notebook.deleteMany({
      where: {
        userId,
        id: { in: authoritativeNotebookIds },
        deletedAt: deletedAtFilter,
      },
    });
    if (deleted.count !== authoritativeNotebookIds.length) {
      throw new Error("TRASH_PURGE_CHANGED_DURING_TRANSACTION");
    }
    await transaction.entityTombstone.createMany({
      data: tombstones.map((item) => ({ ...item, deletedAt })),
    });
    return { count: deleted.count, storageKeys };
  });

  await deleteUploads(result.storageKeys);
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

  return (await purgeTrashPages(userId, [page.id])) === 1;
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
      cutoff,
    ),
    purgeTrashPages(
      userId,
      expiredPages.map((page) => page.id),
      cutoff,
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
