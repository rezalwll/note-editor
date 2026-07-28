import { NextResponse } from "next/server";

import {
  APP_LOCK_BLOCK_MS,
  APP_LOCK_MAX_ATTEMPTS,
  setAppLockUnlockedCookie,
  verifyAppLockPattern,
} from "@/lib/app-lock";
import { requireAuthenticatedUser } from "@/lib/auth";
import { normalizePattern } from "@/lib/pattern-lock";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request) {
  let user = await requireAuthenticatedUser();
  const body = await request.json().catch(() => null);
  const pattern = normalizePattern(body?.pattern);

  if (!user.appLockPatternHash) {
    return NextResponse.json(
      { error: "قفل برنامه برای این حساب فعال نیست." },
      { status: 409 },
    );
  }
  const patternHash = user.appLockPatternHash;
  if (!pattern) {
    return NextResponse.json(
      { error: "یک الگوی معتبر رسم کنید." },
      { status: 400 },
    );
  }

  const now = new Date();
  if (user.appLockBlockedUntil && user.appLockBlockedUntil > now) {
    return NextResponse.json(
      {
        error: "تلاش‌های ناموفق بیش از حد بوده است. کمی بعد دوباره تلاش کنید.",
        retryAfterMs: user.appLockBlockedUntil.getTime() - now.getTime(),
      },
      { status: 429 },
    );
  }
  if (user.appLockBlockedUntil || user.appLockFailedAttempts >= APP_LOCK_MAX_ATTEMPTS) {
    user = await prisma.user.update({
      where: { id: user.id },
      data: { appLockFailedAttempts: 0, appLockBlockedUntil: null },
    });
  }

  const matches = await verifyAppLockPattern(
    patternHash,
    pattern,
  );
  if (!matches) {
    const failedUser = await prisma.user.update({
      where: { id: user.id },
      data: { appLockFailedAttempts: { increment: 1 } },
    });
    const shouldBlock =
      failedUser.appLockFailedAttempts >= APP_LOCK_MAX_ATTEMPTS;
    const blockedUntil = shouldBlock
      ? new Date(Date.now() + APP_LOCK_BLOCK_MS)
      : null;
    if (blockedUntil) {
      await prisma.user.update({
        where: { id: user.id },
        data: { appLockBlockedUntil: blockedUntil },
      });
    }

    return NextResponse.json(
      {
        error: shouldBlock
          ? "تعداد تلاش‌ها بیش از حد شد. پانزده دقیقه بعد دوباره امتحان کنید."
          : "الگوی واردشده درست نیست.",
        remainingAttempts: Math.max(
          0,
          APP_LOCK_MAX_ATTEMPTS - failedUser.appLockFailedAttempts,
        ),
      },
      { status: shouldBlock ? 429 : 401 },
    );
  }

  if (user.appLockFailedAttempts > 0 || user.appLockBlockedUntil) {
    await prisma.user.update({
      where: { id: user.id },
      data: { appLockFailedAttempts: 0, appLockBlockedUntil: null },
    });
  }
  await setAppLockUnlockedCookie(user.id, user.appLockVersion);

  return NextResponse.json(
    { unlocked: true },
    { headers: { "Cache-Control": "no-store" } },
  );
}
