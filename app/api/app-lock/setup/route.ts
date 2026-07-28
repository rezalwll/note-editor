import { NextResponse } from "next/server";

import {
  clearAppLockCookie,
  hashAppLockPattern,
} from "@/lib/app-lock";
import { requireAuthenticatedUser } from "@/lib/auth";
import { normalizePattern } from "@/lib/pattern-lock";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request) {
  const user = await requireAuthenticatedUser();
  const body = await request.json().catch(() => null);
  const pattern = normalizePattern(body?.pattern);

  if (!pattern) {
    return NextResponse.json(
      { error: "الگو باید حداقل چهار نقطه متفاوت داشته باشد." },
      { status: 400 },
    );
  }
  if (!user.email) {
    return NextResponse.json(
      { error: "برای فعال‌کردن قفل، ابتدا یک ایمیل در تنظیمات حساب ثبت کنید." },
      { status: 400 },
    );
  }
  if (user.appLockPatternHash) {
    return NextResponse.json(
      { error: "قفل برنامه قبلاً تنظیم شده است." },
      { status: 409 },
    );
  }

  const patternHash = await hashAppLockPattern(pattern);
  const result = await prisma.user.updateMany({
    where: { id: user.id, appLockPatternHash: null },
    data: {
      appLockPatternHash: patternHash,
      appLockVersion: { increment: 1 },
      appLockFailedAttempts: 0,
      appLockBlockedUntil: null,
    },
  });
  if (result.count !== 1) {
    return NextResponse.json(
      { error: "قفل برنامه قبلاً تنظیم شده است." },
      { status: 409 },
    );
  }

  await clearAppLockCookie();
  return NextResponse.json(
    { configured: true, locked: true },
    { headers: { "Cache-Control": "no-store" } },
  );
}
