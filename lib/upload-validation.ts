const MIME_EXTENSIONS = {
  "application/pdf": ".pdf",
  "image/gif": ".gif",
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
} as const;

export type AllowedUploadMimeType = keyof typeof MIME_EXTENSIONS;

function startsWith(bytes: Uint8Array, signature: number[]) {
  return signature.every((value, index) => bytes[index] === value);
}

export function detectUploadMimeType(bytes: Uint8Array): AllowedUploadMimeType | null {
  if (startsWith(bytes, [0x25, 0x50, 0x44, 0x46, 0x2d])) return "application/pdf";
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return "image/jpeg";
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return "image/png";
  }

  const header = new TextDecoder("ascii").decode(bytes.slice(0, 12));
  if (header.startsWith("GIF87a") || header.startsWith("GIF89a")) return "image/gif";
  if (header.startsWith("RIFF") && header.slice(8, 12) === "WEBP") return "image/webp";
  return null;
}

export async function inspectUpload(file: File) {
  const bytes = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  const mimeType = detectUploadMimeType(bytes);
  return mimeType ? { mimeType, extension: MIME_EXTENSIONS[mimeType] } : null;
}
