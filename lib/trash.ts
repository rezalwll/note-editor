import { prisma } from "@/lib/prisma";
import { deleteUpload } from "@/lib/storage";

export const TRASH_GROUP_SYSTEM_KEY = "deleted-items";
export const TRASH_RETENTION_DAYS = 30;

export async function ensureTrashGroup(userId: string) {
  const existing = await prisma.notebookGroup.findFirst({
    where: {
      userId,
      OR: [
        { systemKey: TRASH_GROUP_SYSTEM_KEY },
        { name: "حذف‌شده‌ها" },
      ],
    },
    select: {
      id: true,
      name: true,
      systemKey: true,
    },
  });

  if (existing) {
    if (existing.name !== "حذف‌شده‌ها" || existing.systemKey !== TRASH_GROUP_SYSTEM_KEY) {
      return prisma.notebookGroup.update({
        where: { id: existing.id },
        data: {
          name: "حذف‌شده‌ها",
          systemKey: TRASH_GROUP_SYSTEM_KEY,
        },
        select: {
          id: true,
          name: true,
          systemKey: true,
        },
      });
    }

    return existing;
  }

  return prisma.notebookGroup.create({
    data: {
      userId,
      name: "حذف‌شده‌ها",
      systemKey: TRASH_GROUP_SYSTEM_KEY,
    },
    select: {
      id: true,
      name: true,
      systemKey: true,
    },
  });
}

async function purgeTrashNotebooks(userId: string, notebookIds: string[]) {
  if (notebookIds.length === 0) {
    return 0;
  }

  const attachments = await prisma.attachment.findMany({
    where: {
      userId,
      page: {
        notebookId: {
          in: notebookIds,
        },
      },
    },
    select: {
      storageKey: true,
    },
  });

  const result = await prisma.notebook.deleteMany({
    where: {
      userId,
      id: {
        in: notebookIds,
      },
    },
  });

  await Promise.all(attachments.map((attachment) => deleteUpload(attachment.storageKey)));

  return result.count;
}

export async function purgeExpiredTrash(userId: string) {
  const trashGroup = await ensureTrashGroup(userId);
  const cutoff = new Date(Date.now() - TRASH_RETENTION_DAYS * 24 * 60 * 60 * 1000);

  const expiredNotebooks = await prisma.notebook.findMany({
    where: {
      userId,
      groupId: trashGroup.id,
      deletedAt: {
        lte: cutoff,
      },
    },
    select: {
      id: true,
    },
  });

  return purgeTrashNotebooks(
    userId,
    expiredNotebooks.map((notebook) => notebook.id),
  );
}

export async function emptyTrash(userId: string) {
  const trashGroup = await ensureTrashGroup(userId);

  const trashNotebooks = await prisma.notebook.findMany({
    where: {
      userId,
      groupId: trashGroup.id,
    },
    select: {
      id: true,
    },
  });

  return purgeTrashNotebooks(
    userId,
    trashNotebooks.map((notebook) => notebook.id),
  );
}
