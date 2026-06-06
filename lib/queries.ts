import { cache } from "react";

import { prisma } from "@/lib/prisma";

export const getSidebarData = cache(async () => {
  const notebooks = await prisma.notebook.findMany({
    where: { archived: false },
    orderBy: { updatedAt: "desc" },
    include: {
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
  });

  return { notebooks };
});
