import { NextResponse } from "next/server";

import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { readUpload } from "@/lib/storage";

type RouteProps = {
  params: Promise<{ id: string }>;
};

export async function GET(_request: Request, { params }: RouteProps) {
  await requireUser();
  const { id } = await params;

  const attachment = await prisma.attachment.findUnique({
    where: { id },
  });

  if (!attachment) {
    return NextResponse.json({ error: "Attachment not found." }, { status: 404 });
  }

  const bytes = await readUpload(attachment.storageKey);

  return new NextResponse(bytes, {
    headers: {
      "Content-Type": attachment.mimeType,
      "Content-Disposition": `inline; filename="${encodeURIComponent(
        attachment.fileName,
      )}"`,
      "Cache-Control": "private, max-age=60",
    },
  });
}
