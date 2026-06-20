import { redirect } from "next/navigation";

import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export default async function DashboardPage() {
  const user = await requireUser();
  const notebooks = await prisma.notebook.findMany({
    where: { archived: false, deletedAt: null, userId: user.id },
    include: {
      pages: {
        where: { archived: false, deletedAt: null, userId: user.id },
        orderBy: { updatedAt: "desc" },
        take: 1,
      },
    },
    orderBy: { updatedAt: "desc" },
    take: 1,
  });

  const activeNotebook = notebooks[0];

  if (activeNotebook?.pages[0]) {
    redirect(`/pages/${activeNotebook.pages[0].id}`);
  }

  if (activeNotebook) {
    redirect(`/notebooks/${activeNotebook.id}`);
  }

  return <div className="h-full bg-white" />;
}
