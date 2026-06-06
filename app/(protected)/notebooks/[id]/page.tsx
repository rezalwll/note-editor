import { notFound, redirect } from "next/navigation";

import { prisma } from "@/lib/prisma";

type NotebookPageProps = {
  params: Promise<{ id: string }>;
};

export default async function NotebookPage({ params }: NotebookPageProps) {
  const { id } = await params;

  const notebook = await prisma.notebook.findUnique({
    where: { id },
    include: {
      pages: {
        where: { archived: false },
        orderBy: { updatedAt: "desc" },
        take: 1,
      },
    },
  });

  if (!notebook || notebook.archived) {
    notFound();
  }

  if (notebook.pages[0]) {
    redirect(`/pages/${notebook.pages[0].id}`);
  }

  return <div className="min-h-[calc(100vh-99px)] bg-white" />;
}
