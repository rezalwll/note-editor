import { NextResponse } from "next/server";

import { requireUser } from "@/lib/auth";
import { InvalidSearchCursorError, searchWorkspace } from "@/lib/search";

const MAX_RESULTS_PER_TYPE = 20;

export async function GET(request: Request) {
  const user = await requireUser();
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q") ?? "";
  const rawLimit = searchParams.get("limit");
  const cursor = searchParams.get("cursor");
  const limit = rawLimit === null ? undefined : Number(rawLimit);

  if (
    limit !== undefined &&
    (!Number.isInteger(limit) || limit < 1 || limit > MAX_RESULTS_PER_TYPE)
  ) {
    return NextResponse.json(
      { error: `Search limit must be between 1 and ${MAX_RESULTS_PER_TYPE}.` },
      { status: 400 },
    );
  }

  try {
    const payload =
      cursor === null && limit === undefined
        ? await searchWorkspace(user.id, query)
        : await searchWorkspace(user.id, query, { cursor, limit });

    return NextResponse.json(payload, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    if (error instanceof InvalidSearchCursorError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    throw error;
  }
}
