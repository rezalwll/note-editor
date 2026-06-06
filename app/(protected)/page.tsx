import { redirect } from "next/navigation";

import { prisma } from "@/lib/prisma";

export default async function DashboardPage() {
  const notebooks = await prisma.notebook.findMany({
    where: { archived: false },
    include: {
      pages: {
        where: { archived: false },
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

  return <div className="min-h-[calc(100vh-99px)] bg-white" />;
}
