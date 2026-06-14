import { NextResponse } from "next/server";

import { requireUser } from "@/lib/auth";
import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { storeUpload } from "@/lib/storage";

const ALLOWED_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

type RouteProps = {
  params: Promise<{ id: string }>;
};

export async function POST(request: Request, { params }: RouteProps) {
  const user = await requireUser();
  const { id } = await params;

  const page = await prisma.page.findFirst({
    where: { id, userId: user.id },
    select: { id: true, archived: true, notebook: { select: { archived: true } } },
  });

  if (!page || page.archived || page.notebook.archived) {
    return NextResponse.json({ error: "صفحه پیدا نشد." }, { status: 404 });
  }

  const formData = await request.formData();
  const file = formData.get("file");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "هیچ فایلی بارگذاری نشده است." }, { status: 400 });
  }

  if (!ALLOWED_TYPES.has(file.type)) {
    return NextResponse.json(
      { error: "فقط فایل‌های تصویری و PDF مجاز هستند." },
      { status: 400 },
    );
  }

  const maxBytes = env.MAX_UPLOAD_SIZE_MB * 1024 * 1024;

  if (file.size > maxBytes) {
    return NextResponse.json(
      { error: `حجم فایل از ${env.MAX_UPLOAD_SIZE_MB} مگابایت بیشتر است.` },
      { status: 400 },
    );
  }

  const stored = await storeUpload(file);

  const attachment = await prisma.attachment.create({
    data: {
      userId: user.id,
      pageId: id,
      fileName: file.name,
      mimeType: file.type,
      sizeBytes: file.size,
      storageKey: stored.storageKey,
    },
  });

  return NextResponse.json({
    attachment: {
      id: attachment.id,
      fileName: attachment.fileName,
      mimeType: attachment.mimeType,
      sizeBytes: attachment.sizeBytes,
    },
    url: `/api/attachments/${attachment.id}`,
  });
}
