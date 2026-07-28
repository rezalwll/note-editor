import { timingSafeEqual } from "node:crypto";

import { NextResponse } from "next/server";

import {
  APP_LOCK_MAX_ATTEMPTS,
  getAppLockResetCodeHash,
  hashAppLockPattern,
  setAppLockUnlockedCookie,
} from "@/lib/app-lock";
import { requireAuthenticatedUser } from "@/lib/auth";
import {
  normalizePattern,
  normalizeVerificationCode,
} from "@/lib/pattern-lock";
import { prisma } from "@/lib/prisma";

function hashesMatch(first: string, second: string) {
  const firstBuffer = Buffer.from(first, "hex");
  const secondBuffer = Buffer.from(second, "hex");
  return (
    firstBuffer.length === secondBuffer.length &&
    timingSafeEqual(firstBuffer, secondBuffer)
  );
}

export async function POST(request: Request) {
  const user = await requireAuthenticatedUser();
  const body = await request.json().catch(() => null);
  const code = normalizeVerificationCode(body?.code);
  const pattern = normalizePattern(body?.pattern);

  if (!code || !pattern) {
    return NextResponse.json(
      { error: "کد شش‌رقمی و الگوی جدید را کامل وارد کنید." },
      { status: 400 },
    );
  }
  if (!user.appLockPatternHash) {
    return NextResponse.json(
      { error: "قفل برنامه برای این حساب فعال نیست." },
      { status: 409 },
    );
  }

  const resetCode = await prisma.appLockResetCode.findUnique({
    where: { userId: user.id },
  });
  if (!resetCode || resetCode.expiresAt <= new Date()) {
    await prisma.appLockResetCode.deleteMany({ where: { userId: user.id } });
    return NextResponse.json(
      { error: "کد بازیابی منقضی یا نامعتبر است. کد جدیدی درخواست کنید." },
      { status: 410 },
    );
  }
  if (resetCode.failedAttempts >= APP_LOCK_MAX_ATTEMPTS) {
    return NextResponse.json(
      { error: "تعداد تلاش‌ها بیش از حد شد. کد جدیدی درخواست کنید." },
      { status: 429 },
    );
  }

  const submittedHash = getAppLockResetCodeHash(user.id, code);
  if (!hashesMatch(resetCode.codeHash, submittedHash)) {
    const updatedCode = await prisma.appLockResetCode.update({
      where: { userId: user.id },
      data: { failedAttempts: { increment: 1 } },
    });
    return NextResponse.json(
      {
        error:
          updatedCode.failedAttempts >= APP_LOCK_MAX_ATTEMPTS
            ? "تعداد تلاش‌ها بیش از حد شد. کد جدیدی درخواست کنید."
            : "کد بازیابی درست نیست.",
        remainingAttempts: Math.max(
          0,
          APP_LOCK_MAX_ATTEMPTS - updatedCode.failedAttempts,
        ),
      },
      { status: updatedCode.failedAttempts >= APP_LOCK_MAX_ATTEMPTS ? 429 : 401 },
    );
  }

  const patternHash = await hashAppLockPattern(pattern);
  const updatedUser = await prisma.$transaction(async (transaction) => {
    const nextUser = await transaction.user.update({
      where: { id: user.id },
      data: {
        appLockPatternHash: patternHash,
        appLockVersion: { increment: 1 },
        appLockFailedAttempts: 0,
        appLockBlockedUntil: null,
      },
    });
    await transaction.appLockResetCode.delete({ where: { userId: user.id } });
    return nextUser;
  });
  await setAppLockUnlockedCookie(user.id, updatedUser.appLockVersion);

  return NextResponse.json(
    { reset: true, unlocked: true },
    { headers: { "Cache-Control": "no-store" } },
  );
}
