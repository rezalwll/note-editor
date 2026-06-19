import { cache } from "react";

import { prisma } from "@/lib/prisma";
import { ensureTrashGroup, TRASH_GROUP_SYSTEM_KEY } from "@/lib/trash";

export const getSidebarData = cache(async (userId: string) => {
  await ensureTrashGroup(userId);

  const [groups, notebooks] = await Promise.all([
    prisma.notebookGroup.findMany({
      where: { userId },
      orderBy: [{ createdAt: "asc" }],
      include: {
        _count: {
          select: {
            notebooks: {
              where: { archived: false, userId },
            },
          },
        },
      },
    }),
    prisma.notebook.findMany({
      where: { archived: false, userId },
      orderBy: { createdAt: "asc" },
      include: {
        group: {
          select: {
            id: true,
            name: true,
          },
        },
        _count: {
          select: {
            pages: {
              where: {
                archived: false,
                userId,
              },
            },
          },
        },
        pages: {
          where: { archived: false, userId },
          orderBy: { updatedAt: "desc" },
          select: {
            id: true,
            title: true,
            updatedAt: true,
            deletedAt: true,
          },
        },
      },
    }),
  ]);

  const sortedGroups = groups.sort((a, b) => {
    if (a.systemKey === TRASH_GROUP_SYSTEM_KEY) {
      return 1;
    }

    if (b.systemKey === TRASH_GROUP_SYSTEM_KEY) {
      return -1;
    }

    return a.createdAt.getTime() - b.createdAt.getTime();
  });

  return { groups: sortedGroups, notebooks };
});
