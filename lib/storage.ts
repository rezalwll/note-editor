import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";

import { env } from "@/lib/env";
import { isValidStorageKey } from "@/lib/storage-key";
import { slugifyFileName } from "@/lib/utils";

export function getUploadRoot() {
  if (path.isAbsolute(env.UPLOAD_DIR)) {
    return env.UPLOAD_DIR;
  }

  return path.join(/* turbopackIgnore: true */ process.cwd(), env.UPLOAD_DIR);
}

function getStoragePath(storageKey: string) {
  if (!isValidStorageKey(storageKey)) {
    throw new Error("INVALID_STORAGE_KEY");
  }

  return path.join(getUploadRoot(), storageKey);
}

async function ensureUploadRoot() {
  const uploadRoot = getUploadRoot();
  await mkdir(uploadRoot, { recursive: true });
  return uploadRoot;
}

export async function storeUpload(file: File, canonicalExtension?: string) {
  const uploadRoot = await ensureUploadRoot();

  const extension = canonicalExtension ?? path.extname(file.name);
  const baseName = path.basename(file.name, extension);
  const storageKey = `${randomUUID()}-${slugifyFileName(baseName)}${extension}`;
  const outputPath = path.join(uploadRoot, storageKey);
  const arrayBuffer = await file.arrayBuffer();

  await writeFile(outputPath, Buffer.from(arrayBuffer));

  return { storageKey, outputPath };
}

export async function readUpload(storageKey: string) {
  const filePath = getStoragePath(storageKey);
  return readFile(filePath);
}

export async function writeUploadBuffer(storageKey: string, bytes: Uint8Array) {
  await ensureUploadRoot();
  const filePath = getStoragePath(storageKey);
  await writeFile(filePath, bytes);
  return filePath;
}

export async function deleteUpload(storageKey: string) {
  const filePath = getStoragePath(storageKey);
  await unlink(filePath).catch(() => undefined);
}
