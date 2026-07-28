import { createHmac, randomInt } from "node:crypto";

import argon2 from "argon2";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";

import { env } from "@/lib/env";

const APP_LOCK_COOKIE = "notebook_app_unlocked";
const APP_LOCK_COOKIE_MAX_AGE = 60 * 60 * 24 * 14;
export const APP_LOCK_RESET_CODE_TTL_MS = 10 * 60 * 1000;
export const APP_LOCK_RESET_RESEND_MS = 60 * 1000;
export const APP_LOCK_MAX_ATTEMPTS = 5;
export const APP_LOCK_BLOCK_MS = 15 * 60 * 1000;

const secret = new TextEncoder().encode(env.SESSION_SECRET);

type AppLockCookiePayload = {
  purpose: "app-lock";
  userId: string;
  version: number;
};

type AppLockUser = {
  id: string;
  appLockPatternHash: string | null;
  appLockVersion: number;
};

export async function hashAppLockPattern(pattern: string) {
  return argon2.hash(pattern, {
    type: argon2.argon2id,
    memoryCost: 19_456,
    timeCost: 2,
    parallelism: 1,
  });
}

export async function verifyAppLockPattern(hash: string, pattern: string) {
  try {
    return await argon2.verify(hash, pattern);
  } catch {
    return false;
  }
}

export async function setAppLockUnlockedCookie(
  userId: string,
  version: number,
) {
  const token = await new SignJWT({
    purpose: "app-lock",
    userId,
    version,
  } satisfies AppLockCookiePayload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${APP_LOCK_COOKIE_MAX_AGE}s`)
    .sign(secret);
  const cookieStore = await cookies();

  cookieStore.set(APP_LOCK_COOKIE, token, {
    httpOnly: true,
    sameSite: "strict",
    secure: env.SESSION_COOKIE_SECURE,
    path: "/",
    maxAge: APP_LOCK_COOKIE_MAX_AGE,
  });
}

export async function clearAppLockCookie() {
  const cookieStore = await cookies();
  cookieStore.delete(APP_LOCK_COOKIE);
}

export async function isAppLockUnlocked(user: AppLockUser) {
  if (!user.appLockPatternHash) {
    return true;
  }

  const cookieStore = await cookies();
  const token = cookieStore.get(APP_LOCK_COOKIE)?.value;
  if (!token) {
    return false;
  }

  try {
    const { payload } = await jwtVerify(token, secret);
    return (
      payload.purpose === "app-lock" &&
      payload.userId === user.id &&
      payload.version === user.appLockVersion
    );
  } catch {
    return false;
  }
}

export function createAppLockResetCode(userId: string) {
  const rawCode = String(randomInt(0, 1_000_000)).padStart(6, "0");
  return {
    rawCode,
    codeHash: getAppLockResetCodeHash(userId, rawCode),
    expiresAt: new Date(Date.now() + APP_LOCK_RESET_CODE_TTL_MS),
  };
}

export function getAppLockResetCodeHash(userId: string, code: string) {
  return createHmac("sha256", env.SESSION_SECRET)
    .update(`${userId}:${code}`)
    .digest("hex");
}

export function getAppLockCookieName() {
  return APP_LOCK_COOKIE;
}
