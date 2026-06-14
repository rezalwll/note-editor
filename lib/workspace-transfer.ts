import JSZip from "jszip";
import { z } from "zod";

export const WORKSPACE_ARCHIVE_APP = "notebook";
export const WORKSPACE_ARCHIVE_FORMAT_VERSION = 1;

const manifestSchema = z.object({
  formatVersion: z.number().int(),
  exportedAt: z.string().datetime(),
  app: z.string(),
  user: z.object({
    username: z.string(),
    displayName: z.string(),
  }),
});

const groupSchema = z.object({
  id: z.string().cuid(),
  name: z.string(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

const notebookSchema = z.object({
  id: z.string().cuid(),
  groupId: z.string().cuid().nullable(),
  name: z.string(),
  description: z.string().nullable(),
  archived: z.boolean(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

const pageSchema = z.object({
  id: z.string().cuid(),
  notebookId: z.string().cuid(),
  title: z.string(),
  bodyHtml: z.string(),
  bodyText: z.string(),
  archived: z.boolean(),
  tags: z.array(z.string()),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

const attachmentSchema = z.object({
  id: z.string().cuid(),
  pageId: z.string().cuid(),
  fileName: z.string(),
  mimeType: z.string(),
  sizeBytes: z.number().int().nonnegative(),
  storageKey: z.string(),
  createdAt: z.string().datetime(),
});

const workspaceSchema = z.object({
  groups: z.array(groupSchema),
  notebooks: z.array(notebookSchema),
  pages: z.array(pageSchema),
  attachments: z.array(attachmentSchema),
});

export type WorkspaceArchiveManifest = z.infer<typeof manifestSchema>;
export type WorkspaceArchiveData = z.infer<typeof workspaceSchema>;

export function getWorkspaceArchiveFileName(username: string, exportedAt: string) {
  const safeDate = exportedAt.replaceAll(":", "-");
  return `notebook-workspace-${username}-${safeDate}.zip`;
}

export async function parseWorkspaceArchive(bytes: ArrayBuffer | Uint8Array) {
  let zip: JSZip;

  try {
    zip = await JSZip.loadAsync(bytes);
  } catch {
    throw new Error("This file is not a valid notebook archive.");
  }

  const manifestFile = zip.file("manifest.json");
  const workspaceFile = zip.file("workspace.json");

  if (!manifestFile || !workspaceFile) {
    throw new Error("The archive is missing manifest.json or workspace.json.");
  }

  const manifest = manifestSchema.safeParse(
    JSON.parse(await manifestFile.async("text")),
  );
  const workspace = workspaceSchema.safeParse(
    JSON.parse(await workspaceFile.async("text")),
  );

  if (!manifest.success || !workspace.success) {
    throw new Error("The archive format is malformed.");
  }

  if (manifest.data.app !== WORKSPACE_ARCHIVE_APP) {
    throw new Error("This archive was not created by this app.");
  }

  if (manifest.data.formatVersion !== WORKSPACE_ARCHIVE_FORMAT_VERSION) {
    throw new Error("This archive version is not supported.");
  }

  const groupIds = new Set(workspace.data.groups.map((group) => group.id));
  const notebookIds = new Set(workspace.data.notebooks.map((notebook) => notebook.id));
  const pageIds = new Set(workspace.data.pages.map((page) => page.id));
  const attachmentFiles = new Map<string, Uint8Array>();

  for (const notebook of workspace.data.notebooks) {
    if (notebook.groupId && !groupIds.has(notebook.groupId)) {
      throw new Error("The archive contains a notebook with a missing group.");
    }
  }

  for (const page of workspace.data.pages) {
    if (!notebookIds.has(page.notebookId)) {
      throw new Error("The archive contains a page with a missing notebook.");
    }
  }

  for (const attachment of workspace.data.attachments) {
    if (!pageIds.has(attachment.pageId)) {
      throw new Error("The archive contains an attachment with a missing page.");
    }

    const file = zip.file(`attachments/${attachment.id}`);

    if (!file) {
      throw new Error(`The archive is missing the file for attachment "${attachment.fileName}".`);
    }

    const bytes = await file.async("uint8array");

    if (bytes.byteLength !== attachment.sizeBytes) {
      throw new Error(`Attachment "${attachment.fileName}" does not match its recorded size.`);
    }

    attachmentFiles.set(attachment.id, bytes);
  }

  return {
    manifest: manifest.data,
    workspace: workspace.data,
    attachmentFiles,
  };
}
