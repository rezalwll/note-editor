import { NextResponse } from "next/server";

import { clearAppLockCookie } from "@/lib/app-lock";
import { requireAuthenticatedUser } from "@/lib/auth";

export async function POST() {
  const user = await requireAuthenticatedUser();
  if (!user.appLockPatternHash) {
    return NextResponse.json(
      { error: "ابتدا یک الگوی قفل تعریف کنید." },
      { status: 409 },
    );
  }

  await clearAppLockCookie();
  return NextResponse.json(
    { locked: true },
    { headers: { "Cache-Control": "no-store" } },
  );
}
