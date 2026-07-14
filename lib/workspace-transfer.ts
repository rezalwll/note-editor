import JSZip from "jszip";
import { z } from "zod";

import { isValidStorageKey } from "@/lib/storage-key";
import { detectUploadMimeType } from "@/lib/upload-validation";

export const WORKSPACE_ARCHIVE_APP = "notebook";
export const WORKSPACE_ARCHIVE_FORMAT_VERSION = 1;
export const MAX_WORKSPACE_ARCHIVE_BYTES = 25 * 1024 * 1024;
export const MAX_WORKSPACE_EXTRACTED_BYTES = 100 * 1024 * 1024;
export const MAX_WORKSPACE_ITEMS = 10_000;

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
  groupId: z.string().cuid(),
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
  storageKey: z
    .string()
    .min(1)
    .max(255)
    .refine(isValidStorageKey),
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
  if (bytes.byteLength > MAX_WORKSPACE_ARCHIVE_BYTES) {
    throw new Error("حجم فایل آرشیو بیشتر از حد مجاز است.");
  }

  let zip: JSZip;

  try {
    zip = await JSZip.loadAsync(bytes);
  } catch {
    throw new Error("این فایل یک آرشیو معتبر برای دفترچه نیست.");
  }

  const manifestFile = zip.file("manifest.json");
  const workspaceFile = zip.file("workspace.json");

  if (!manifestFile || !workspaceFile) {
    throw new Error("فایل manifest.json یا workspace.json در آرشیو وجود ندارد.");
  }

  const manifest = manifestSchema.safeParse(
    JSON.parse(await manifestFile.async("text")),
  );
  const workspace = workspaceSchema.safeParse(
    JSON.parse(await workspaceFile.async("text")),
  );

  if (!manifest.success || !workspace.success) {
    throw new Error("ساختار آرشیو نامعتبر است.");
  }

  const itemCount =
    workspace.data.groups.length +
    workspace.data.notebooks.length +
    workspace.data.pages.length +
    workspace.data.attachments.length;
  const extractedBytes = workspace.data.attachments.reduce(
    (total, attachment) => total + attachment.sizeBytes,
    0,
  );

  if (itemCount > MAX_WORKSPACE_ITEMS || extractedBytes > MAX_WORKSPACE_EXTRACTED_BYTES) {
    throw new Error("اندازه محتوای استخراج‌شده آرشیو بیشتر از حد مجاز است.");
  }

  if (manifest.data.app !== WORKSPACE_ARCHIVE_APP) {
    throw new Error("این آرشیو توسط همین برنامه ساخته نشده است.");
  }

  if (manifest.data.formatVersion !== WORKSPACE_ARCHIVE_FORMAT_VERSION) {
    throw new Error("نسخه‌ی این آرشیو پشتیبانی نمی‌شود.");
  }

  const groupIds = new Set(workspace.data.groups.map((group) => group.id));
  const notebookIds = new Set(workspace.data.notebooks.map((notebook) => notebook.id));
  const pageIds = new Set(workspace.data.pages.map((page) => page.id));
  const attachmentFiles = new Map<string, Uint8Array>();

  for (const notebook of workspace.data.notebooks) {
    if (!groupIds.has(notebook.groupId)) {
      throw new Error("در آرشیو دفتری وجود دارد که دسته‌ی آن پیدا نشد.");
    }
  }

  for (const page of workspace.data.pages) {
    if (!notebookIds.has(page.notebookId)) {
      throw new Error("در آرشیو صفحه‌ای وجود دارد که دفتر آن پیدا نشد.");
    }
  }

  for (const attachment of workspace.data.attachments) {
    if (!pageIds.has(attachment.pageId)) {
      throw new Error("در آرشیو فایلی وجود دارد که صفحه‌ی مربوط به آن پیدا نشد.");
    }

    const file = zip.file(`attachments/${attachment.id}`);

    if (!file) {
      throw new Error(`فایل پیوست «${attachment.fileName}» در آرشیو وجود ندارد.`);
    }

    const bytes = await file.async("uint8array");

    if (bytes.byteLength !== attachment.sizeBytes) {
      throw new Error(`حجم فایل «${attachment.fileName}» با مقدار ثبت‌شده هم‌خوانی ندارد.`);
    }

    const detectedMimeType = detectUploadMimeType(bytes.slice(0, 16));
    if (!detectedMimeType || detectedMimeType !== attachment.mimeType) {
      throw new Error(`نوع واقعی فایل «${attachment.fileName}» معتبر نیست.`);
    }

    attachmentFiles.set(attachment.id, bytes);
  }

  return {
    manifest: manifest.data,
    workspace: workspace.data,
    attachmentFiles,
  };
}
