import { NextResponse } from "next/server";

import { requireUser } from "@/lib/auth";
import { observeRequest } from "@/lib/request-observability";
import { parseSyncPageRequest } from "@/lib/sync/cursor";
import { getSyncPage } from "@/lib/sync/server-page";

export async function GET(request: Request) {
  const observation = observeRequest(request, "/api/sync/pull");
  const user = await requireUser();
  const parsed = parseSyncPageRequest(request, "pull");
  if ("error" in parsed) {
    return observation.json({ error: parsed.error }, { status: 400 });
  }

  try {
    const payload = await getSyncPage(user.id, parsed.cursor, parsed.limit);
    const tombstoneCount = payload.tombstones?.length ?? 0;
    const operationCount =
      payload.notebooks.length + payload.pages.length + tombstoneCount;
    observation.log.metric("sync.pull.operations", operationCount, {
      userId: user.id,
      phase: parsed.cursor.phase,
      tombstoneCount,
      hasMore: payload.hasMore,
    });
    return observation.complete(NextResponse.json(payload), {
      userId: user.id,
      operationCount,
      phase: parsed.cursor.phase,
      tombstoneCount,
      hasMore: payload.hasMore,
    });
  } catch (error) {
    return observation.failure(error, { userId: user.id });
  }
}
