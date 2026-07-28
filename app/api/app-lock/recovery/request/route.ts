import { NextResponse } from "next/server";

import {
  APP_LOCK_RESET_CODE_TTL_MS,
  APP_LOCK_RESET_RESEND_MS,
  createAppLockResetCode,
} from "@/lib/app-lock";
import { sendAppLockResetCodeEmail } from "@/lib/app-lock-email";
import { requireAuthenticatedUser } from "@/lib/auth";
import { maskEmail } from "@/lib/pattern-lock";
import { prisma } from "@/lib/prisma";

export async function POST() {
  const user = await requireAuthenticatedUser();
  if (!user.appLockPatternHash) {
    return NextResponse.json(
      { error: "قفل برنامه برای این حساب فعال نیست." },
      { status: 409 },
    );
  }
  if (!user.email) {
    return NextResponse.json(
      { error: "برای این حساب ایمیلی ثبت نشده است." },
      { status: 400 },
    );
  }

  const existingCode = await prisma.appLockResetCode.findUnique({
    where: { userId: user.id },
  });
  const elapsedSinceLastSend = existingCode
    ? Date.now() - existingCode.lastSentAt.getTime()
    : APP_LOCK_RESET_RESEND_MS;
  if (elapsedSinceLastSend < APP_LOCK_RESET_RESEND_MS) {
    return NextResponse.json(
      {
        error: "برای ارسال دوباره کمی صبر کنید.",
        retryAfterMs: APP_LOCK_RESET_RESEND_MS - elapsedSinceLastSend,
      },
      { status: 429 },
    );
  }

  const code = createAppLockResetCode(user.id);
  await prisma.appLockResetCode.upsert({
    where: { userId: user.id },
    create: {
      userId: user.id,
      codeHash: code.codeHash,
      expiresAt: code.expiresAt,
      lastSentAt: new Date(),
    },
    update: {
      codeHash: code.codeHash,
      expiresAt: code.expiresAt,
      lastSentAt: new Date(),
      failedAttempts: 0,
    },
  });

  try {
    const result = await sendAppLockResetCodeEmail({
      email: user.email,
      displayName: user.displayName,
      code: code.rawCode,
      expiresInMinutes: Math.round(APP_LOCK_RESET_CODE_TTL_MS / 60_000),
    });
    if (result.ok) {
      return NextResponse.json(
        {
          sent: true,
          email: maskEmail(user.email),
          expiresInMs: APP_LOCK_RESET_CODE_TTL_MS,
        },
        { headers: { "Cache-Control": "no-store" } },
      );
    }
  } catch {
    // The pending code is removed below so an unsent code can never be used.
  }

  await prisma.appLockResetCode.deleteMany({ where: { userId: user.id } });
  return NextResponse.json(
    { error: "ارسال ایمیل در حال حاضر ممکن نیست. کمی بعد دوباره تلاش کنید." },
    { status: 503 },
  );
}
