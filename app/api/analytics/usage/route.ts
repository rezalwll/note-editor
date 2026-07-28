import { NextResponse } from "next/server";
import { z } from "zod";

import type { Prisma } from "@/generated/prisma/client";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  getUtcDay,
  normalizeAnalyticsPath,
} from "@/lib/usage-analytics";

const usageEventSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("page_view"),
    path: z.string().max(300),
  }),
  z.object({
    type: z.literal("heartbeat"),
    activeSeconds: z.number().int().min(15).max(90),
  }),
]);

export async function POST(request: Request) {
  const user = await requireUser();
  const body = await request.json().catch(() => null);
  const parsed = usageEventSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid usage event." }, { status: 400 });
  }

  const now = new Date();
  const day = getUtcDay(now);
  const pageViews = parsed.data.type === "page_view" ? 1 : 0;
  const activeSeconds =
    parsed.data.type === "heartbeat" ? parsed.data.activeSeconds : 0;
  const operations: Prisma.PrismaPromise<unknown>[] = [
    prisma.user.update({
      where: { id: user.id },
      data: {
        lastSeenAt: now,
        totalPageViews: { increment: pageViews },
        totalActiveSeconds: { increment: activeSeconds },
      },
    }),
    prisma.userUsageDaily.upsert({
      where: { userId_day: { userId: user.id, day } },
      create: {
        userId: user.id,
        day,
        pageViews,
        activeSeconds,
        lastSeenAt: now,
      },
      update: {
        pageViews: { increment: pageViews },
        activeSeconds: { increment: activeSeconds },
        lastSeenAt: now,
      },
    }),
  ];

  if (parsed.data.type === "page_view") {
    const path = normalizeAnalyticsPath(parsed.data.path);
    operations.push(
      prisma.routeUsageDaily.upsert({
        where: { day_path: { day, path } },
        create: { day, path, pageViews: 1 },
        update: { pageViews: { increment: 1 } },
      }),
    );
  }
  await prisma.$transaction(operations);

  return new NextResponse(null, {
    status: 204,
    headers: { "Cache-Control": "no-store" },
  });
}
