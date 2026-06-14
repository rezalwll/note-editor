import JSZip from "jszip";
import { NextResponse } from "next/server";

import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { readUpload } from "@/lib/storage";
import {
  getWorkspaceArchiveFileName,
  WORKSPACE_ARCHIVE_APP,
  WORKSPACE_ARCHIVE_FORMAT_VERSION,
} from "@/lib/workspace-transfer";

export async function GET() {
  const user = await requireUser();

  const [groups, notebooks, pages, attachments] = await Promise.all([
    prisma.notebookGroup.findMany({
      where: { userId: user.id },
      orderBy: { updatedAt: "asc" },
    }),
    prisma.notebook.findMany({
      where: { userId: user.id },
      orderBy: { updatedAt: "asc" },
    }),
    prisma.page.findMany({
      where: { userId: user.id },
      include: {
        tags: {
          orderBy: { value: "asc" },
        },
      },
      orderBy: { updatedAt: "asc" },
    }),
    prisma.attachment.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  const exportedAt = new Date().toISOString();
  const zip = new JSZip();

  zip.file(
    "manifest.json",
    JSON.stringify(
      {
        formatVersion: WORKSPACE_ARCHIVE_FORMAT_VERSION,
        exportedAt,
        app: WORKSPACE_ARCHIVE_APP,
        user: {
          username: user.username,
          displayName: user.displayName,
        },
      },
      null,
      2,
    ),
  );

  zip.file(
    "workspace.json",
    JSON.stringify(
      {
        groups: groups.map((group) => ({
          id: group.id,
          name: group.name,
          createdAt: group.createdAt.toISOString(),
          updatedAt: group.updatedAt.toISOString(),
        })),
        notebooks: notebooks.map((notebook) => ({
          id: notebook.id,
          groupId: notebook.groupId,
          name: notebook.name,
          description: notebook.description,
          archived: notebook.archived,
          createdAt: notebook.createdAt.toISOString(),
          updatedAt: notebook.updatedAt.toISOString(),
        })),
        pages: pages.map((page) => ({
          id: page.id,
          notebookId: page.notebookId,
          title: page.title,
          bodyHtml: page.bodyHtml,
          bodyText: page.bodyText,
          archived: page.archived,
          tags: page.tags.map((tag) => tag.value),
          createdAt: page.createdAt.toISOString(),
          updatedAt: page.updatedAt.toISOString(),
        })),
        attachments: attachments.map((attachment) => ({
          id: attachment.id,
          pageId: attachment.pageId,
          fileName: attachment.fileName,
          mimeType: attachment.mimeType,
          sizeBytes: attachment.sizeBytes,
          storageKey: attachment.storageKey,
          createdAt: attachment.createdAt.toISOString(),
        })),
      },
      null,
      2,
    ),
  );

  for (const attachment of attachments) {
    const bytes = await readUpload(attachment.storageKey);
    zip.file(`attachments/${attachment.id}`, bytes);
  }

  const archive = await zip.generateAsync({
    type: "nodebuffer",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
  });

  return new NextResponse(new Uint8Array(archive), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${getWorkspaceArchiveFileName(
        user.username,
        exportedAt,
      )}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
