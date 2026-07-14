import { access, mkdir } from "node:fs/promises";
import { constants } from "node:fs";
import { NextResponse } from "next/server";

import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { getUploadRoot } from "@/lib/storage";

export const dynamic = "force-dynamic";

export async function GET() {
  const startedAt = performance.now();

  try {
    await Promise.all([
      prisma.$queryRaw`SELECT 1`,
      mkdir(getUploadRoot(), { recursive: true }).then(() =>
        access(getUploadRoot(), constants.R_OK | constants.W_OK),
      ),
    ]);

    return NextResponse.json(
      { status: "ok", latencyMs: Math.round(performance.now() - startedAt) },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    logger.error("Health check failed", {
      error: error instanceof Error ? error.message : "unknown",
    });
    return NextResponse.json(
      { status: "unavailable" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
