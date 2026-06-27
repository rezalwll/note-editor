import { cache } from "react";

import { repairKnownMojibake } from "@/lib/mojibake-repair";
import { prisma } from "@/lib/prisma";
import { purgeExpiredTrash, TRASH_GROUP_SYSTEM_KEY } from "@/lib/trash";

export const getSidebarData = cache(async (userId: string) => {
  await repairKnownMojibake();
  await purgeExpiredTrash(userId);

  const [groups, notebooks] = await Promise.all([
    prisma.notebookGroup.findMany({
      where: { userId },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
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
      orderBy: [
        { group: { sortOrder: "asc" } },
        { sortOrder: "asc" },
        { createdAt: "asc" },
      ],
      include: {
        group: {
          select: {
            id: true,
            name: true,
            themeKey: true,
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
          orderBy: [{ sortOrder: "asc" }, { updatedAt: "asc" }],
          select: {
            id: true,
            title: true,
            updatedAt: true,
            deletedAt: true,
            originalNotebookId: true,
            sortOrder: true,
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

    return a.sortOrder - b.sortOrder || a.createdAt.getTime() - b.createdAt.getTime();
  });

  return { groups: sortedGroups, notebooks };
});
