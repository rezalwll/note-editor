import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

import { env } from "@/lib/env";
import { slugifyFileName } from "@/lib/utils";

export function getUploadRoot() {
  return path.resolve(/* turbopackIgnore: true */ process.cwd(), env.UPLOAD_DIR);
}

async function ensureUploadRoot() {
  const uploadRoot = getUploadRoot();
  await mkdir(uploadRoot, { recursive: true });
  return uploadRoot;
}

export async function storeUpload(file: File) {
  const uploadRoot = await ensureUploadRoot();

  const extension = path.extname(file.name);
  const baseName = path.basename(file.name, extension);
  const storageKey = `${Date.now()}-${slugifyFileName(baseName)}${extension}`;
  const outputPath = path.join(uploadRoot, storageKey);
  const arrayBuffer = await file.arrayBuffer();

  await writeFile(outputPath, Buffer.from(arrayBuffer));

  return { storageKey, outputPath };
}

export async function readUpload(storageKey: string) {
  const filePath = path.join(getUploadRoot(), storageKey);
  return readFile(filePath);
}

export async function writeUploadBuffer(storageKey: string, bytes: Uint8Array) {
  const uploadRoot = await ensureUploadRoot();
  const filePath = path.join(uploadRoot, storageKey);
  await writeFile(filePath, bytes);
  return filePath;
}

export async function deleteUpload(storageKey: string) {
  const filePath = path.join(getUploadRoot(), storageKey);
  await unlink(filePath).catch(() => undefined);
}
