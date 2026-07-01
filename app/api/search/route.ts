import { NextResponse } from "next/server";

import { requireUser } from "@/lib/auth";
import { searchWorkspace } from "@/lib/search";

export async function GET(request: Request) {
  const user = await requireUser();
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q") ?? "";
  const payload = await searchWorkspace(user.id, query);

  return NextResponse.json(payload);
}
