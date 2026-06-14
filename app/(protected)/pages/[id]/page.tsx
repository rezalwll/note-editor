import { notFound } from "next/navigation";

import { NoteEditor } from "@/components/editor/note-editor";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type PageViewProps = {
  params: Promise<{ id: string }>;
};

export default async function PageView({ params }: PageViewProps) {
  const { id } = await params;
  const user = await requireUser();

  const page = await prisma.page.findFirst({
    where: { id, userId: user.id },
    include: {
      notebook: true,
      attachments: {
        orderBy: { createdAt: "desc" },
      },
      tags: {
        orderBy: { value: "asc" },
      },
    },
  });

  if (!page || page.archived || page.notebook.archived) {
    notFound();
  }

  return (
    <div className="min-h-[calc(100vh-99px)] bg-white">
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
