import { cache } from "react";

import { prisma } from "@/lib/prisma";

export const getSidebarData = cache(async (userId: string) => {
  const [groups, notebooks] = await Promise.all([
    prisma.notebookGroup.findMany({
      where: { userId },
      orderBy: { createdAt: "asc" },
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
          },
        },
      },
    }),
  ]);

  return { groups, notebooks };
});
