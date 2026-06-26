import { NextResponse } from "next/server";

import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { writeUploadBuffer } from "@/lib/storage";
import { parseWorkspaceArchive } from "@/lib/workspace-transfer";

export async function POST(request: Request) {
  const user = await requireUser();
  const formData = await request.formData();
  const archive = formData.get("archive");

  if (!(archive instanceof File)) {
    return NextResponse.json(
      { error: "یک آرشیو برای درون‌ریزی انتخاب کنید." },
      { status: 400 },
    );
  }

  let parsedArchive: Awaited<ReturnType<typeof parseWorkspaceArchive>>;

  try {
    parsedArchive = await parseWorkspaceArchive(await archive.arrayBuffer());
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "خواندن آرشیو فضای کاری ممکن نشد.",
      },
      { status: 400 },
    );
  }

  const { workspace, attachmentFiles } = parsedArchive;

  try {
    await prisma.$transaction(async (tx) => {
      for (const group of workspace.groups) {
        const existing = await tx.notebookGroup.findUnique({
          where: { id: group.id },
          select: { id: true, userId: true },
        });

        if (existing && existing.userId !== user.id) {
          throw new Error("یکی از مجموعه‌های این آرشیو متعلق به حساب دیگری است.");
        }

        if (existing) {
          await tx.notebookGroup.update({
            where: { id: group.id },
            data: {
              name: group.name,
              createdAt: new Date(group.createdAt),
              updatedAt: new Date(group.updatedAt),
            },
          });
        } else {
          await tx.notebookGroup.create({
            data: {
              id: group.id,
              userId: user.id,
              name: group.name,
              createdAt: new Date(group.createdAt),
              updatedAt: new Date(group.updatedAt),
            },
          });
        }
      }

      for (const notebook of workspace.notebooks) {
        const existing = await tx.notebook.findUnique({
          where: { id: notebook.id },
          select: { id: true, userId: true },
        });

        if (existing && existing.userId !== user.id) {
          throw new Error("یکی از زیر مجموعه‌های این آرشیو متعلق به حساب دیگری است.");
        }

        if (existing) {
          await tx.notebook.update({
            where: { id: notebook.id },
            data: {
              groupId: notebook.groupId,
              name: notebook.name,
              description: notebook.description ?? undefined,
              archived: notebook.archived,
              createdAt: new Date(notebook.createdAt),
              updatedAt: new Date(notebook.updatedAt),
            },
          });
        } else {
          await tx.notebook.create({
            data: {
              id: notebook.id,
              userId: user.id,
              groupId: notebook.groupId,
              name: notebook.name,
              description: notebook.description ?? undefined,
              archived: notebook.archived,
              createdAt: new Date(notebook.createdAt),
              updatedAt: new Date(notebook.updatedAt),
            },
          });
        }
      }

      for (const page of workspace.pages) {
        const existing = await tx.page.findUnique({
          where: { id: page.id },
          select: { id: true, userId: true },
        });

        if (existing && existing.userId !== user.id) {
          throw new Error("یکی از صفحه‌های این آرشیو متعلق به حساب دیگری است.");
        }

        if (existing) {
          await tx.page.update({
            where: { id: page.id },
            data: {
              notebookId: page.notebookId,
              title: page.title,
              bodyHtml: page.bodyHtml,
              bodyText: page.bodyText,
              archived: page.archived,
              createdAt: new Date(page.createdAt),
              updatedAt: new Date(page.updatedAt),
            },
          });
        } else {
          await tx.page.create({
            data: {
              id: page.id,
              userId: user.id,
              notebookId: page.notebookId,
              title: page.title,
              bodyHtml: page.bodyHtml,
              bodyText: page.bodyText,
              archived: page.archived,
              createdAt: new Date(page.createdAt),
              updatedAt: new Date(page.updatedAt),
            },
          });
        }

        await tx.pageTag.deleteMany({
          where: { pageId: page.id },
        });

        if (page.tags.length > 0) {
          await tx.pageTag.createMany({
            data: page.tags.map((value) => ({
              pageId: page.id,
              value,
            })),
          });
        }
      }

      for (const attachment of workspace.attachments) {
        const existing = await tx.attachment.findUnique({
          where: { id: attachment.id },
          select: { id: true, userId: true },
        });

        if (existing && existing.userId !== user.id) {
          throw new Error("یکی از فایل‌های این آرشیو متعلق به حساب دیگری است.");
        }

        if (existing) {
          await tx.attachment.update({
            where: { id: attachment.id },
            data: {
              pageId: attachment.pageId,
              fileName: attachment.fileName,
              mimeType: attachment.mimeType,
              sizeBytes: attachment.sizeBytes,
              storageKey: attachment.storageKey,
              createdAt: new Date(attachment.createdAt),
            },
          });
        } else {
          await tx.attachment.create({
            data: {
              id: attachment.id,
              userId: user.id,
              pageId: attachment.pageId,
              fileName: attachment.fileName,
              mimeType: attachment.mimeType,
              sizeBytes: attachment.sizeBytes,
              storageKey: attachment.storageKey,
              createdAt: new Date(attachment.createdAt),
            },
          });
        }
      }
    });

    for (const attachment of workspace.attachments) {
      const bytes = attachmentFiles.get(attachment.id);

      if (!bytes) {
        throw new Error(`داده‌ی فایل «${attachment.fileName}» پیدا نشد.`);
      }

      await writeUploadBuffer(attachment.storageKey, bytes);
    }
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "درون‌ریزی آرشیو فضای کاری انجام نشد.",
      },
      { status: 400 },
    );
  }

  return NextResponse.json({
    success: true,
    imported: {
      groups: workspace.groups.length,
      notebooks: workspace.notebooks.length,
      pages: workspace.pages.length,
      attachments: workspace.attachments.length,
    },
  });
}
