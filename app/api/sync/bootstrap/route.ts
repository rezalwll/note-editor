import { NextResponse } from "next/server";

import { requireUser } from "@/lib/auth";
import { observeRequest } from "@/lib/request-observability";
import { parseSyncPageRequest } from "@/lib/sync/cursor";
import { getSyncPage } from "@/lib/sync/server-page";

export async function GET(request: Request) {
  const observation = observeRequest(request, "/api/sync/bootstrap");
  const user = await requireUser();
  const parsed = parseSyncPageRequest(request, "bootstrap");
  if ("error" in parsed) {
    return observation.json({ error: parsed.error }, { status: 400 });
  }

  try {
    const payload = await getSyncPage(user.id, parsed.cursor, parsed.limit);
    const operationCount = payload.notebooks.length + payload.pages.length;
    observation.log.metric("sync.bootstrap.operations", operationCount, {
      userId: user.id,
      phase: parsed.cursor.phase,
      hasMore: payload.hasMore,
    });
    return observation.complete(NextResponse.json(payload), {
      userId: user.id,
      operationCount,
      phase: parsed.cursor.phase,
      hasMore: payload.hasMore,
    });
  } catch (error) {
    return observation.failure(error, { userId: user.id });
  }
}
