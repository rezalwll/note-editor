import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";

import { NoteEditor } from "@/components/editor/note-editor";
import { requireUser } from "@/lib/auth";
import { getPageDocumentTitle } from "@/lib/page-title";
import { prisma } from "@/lib/prisma";

type PageViewProps = {
  params: Promise<{ id: string }>;
};

const getPage = cache(async (id: string, userId: string) =>
  prisma.page.findFirst({
    where: { id, userId },
    include: {
      notebook: true,
      attachments: {
        orderBy: { createdAt: "desc" },
      },
      tags: {
        orderBy: { value: "asc" },
      },
    },
  }),
);

export async function generateMetadata({
  params,
}: PageViewProps): Promise<Metadata> {
  const { id } = await params;
  const user = await requireUser();
  const page = await getPage(id, user.id);

  return {
    title: getPageDocumentTitle(page?.title),
  };
}

export default async function PageView({ params }: PageViewProps) {
  const { id } = await params;
  const user = await requireUser();

  const page = await getPage(id, user.id);

  if (!page || page.archived || page.notebook.archived) {
    notFound();
  }

  return (
    <div className="h-full bg-white">
      <div className="mx-auto max-w-[1400px]">
        <NoteEditor
          userId={user.id}
          notebookId={page.notebook.id}
          pageId={page.id}
          initialTitle={page.title}
          initialHtml={page.bodyHtml}
          initialUpdatedAt={page.updatedAt.toISOString()}
          attachments={page.attachments.map((attachment) => ({
            id: attachment.id,
            fileName: attachment.fileName,
            mimeType: attachment.mimeType,
            sizeBytes: attachment.sizeBytes,
          }))}
        />
      </div>
    </div>
  );
}
