import { NextResponse } from "next/server";
import { z } from "zod";

import { requireUser } from "@/lib/auth";
import {
  extractFreeformPlainText,
  extractPlainText,
  parseFreeformDocument,
  sanitizeNoteHtml,
} from "@/lib/notes";
import { prisma } from "@/lib/prisma";

const updatePageSchema = z.object({
  title: z.string().trim().min(1).max(160),
  bodyHtml: z.string().trim(),
});

type RouteProps = {
  params: Promise<{ id: string }>;
};

export async function PUT(request: Request, { params }: RouteProps) {
  const user = await requireUser();
  const { id } = await params;

  const parsed = updatePageSchema.safeParse(await request.json());

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Title is required and must stay under 160 characters." },
      { status: 400 },
    );
  }

  const freeformDocument = parseFreeformDocument(parsed.data.bodyHtml);

  const safeHtml = freeformDocument
    ? parsed.data.bodyHtml
    : sanitizeNoteHtml(parsed.data.bodyHtml);

  const page = await prisma.page.findFirst({
    where: { id, userId: user.id },
    select: { id: true },
  });

  if (!page) {
    return NextResponse.json({ error: "Page not found." }, { status: 404 });
  }

  await prisma.page.update({
    where: { id: page.id },
    data: {
      title: parsed.data.title,
      bodyHtml: safeHtml,
      bodyText: freeformDocument
        ? extractFreeformPlainText(freeformDocument)
        : extractPlainText(safeHtml),
    },
  });

  return NextResponse.json({ ok: true });
}
