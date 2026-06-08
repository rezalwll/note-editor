import { cache } from "react";

import { prisma } from "@/lib/prisma";

export const getSidebarData = cache(async () => {
  const [groups, notebooks] = await Promise.all([
    prisma.notebookGroup.findMany({
      orderBy: { createdAt: "asc" },
      include: {
        _count: {
          select: {
            notebooks: {
              where: { archived: false },
            },
          },
        },
      },
    }),
    prisma.notebook.findMany({
      where: { archived: false },
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
              },
            },
          },
        },
        pages: {
          where: { archived: false },
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
