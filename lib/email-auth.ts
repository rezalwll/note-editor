import { createHash, randomInt, randomBytes } from "node:crypto";

import { env } from "@/lib/env";
import { sendTransactionalEmail } from "@/lib/mail";

export const SIGNUP_VERIFICATION_TTL_MS = 30 * 60 * 1000;
const PASSWORD_RESET_TTL_MS = 30 * 60 * 1000;

function hashValue(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function createTokenRecord(ttlMs: number) {
  const rawToken = randomBytes(32).toString("hex");

  return {
    rawToken,
    tokenHash: hashValue(rawToken),
    expiresAt: new Date(Date.now() + ttlMs),
  };
}

export function createSignupVerificationCodeRecord() {
  const rawCode = String(randomInt(0, 1_000_000)).padStart(6, "0");

  return {
    rawCode,
    codeHash: hashValue(rawCode),
    expiresAt: new Date(Date.now() + SIGNUP_VERIFICATION_TTL_MS),
  };
}

export function createPasswordResetTokenRecord() {
  return createTokenRecord(PASSWORD_RESET_TTL_MS);
}

export function getTokenHash(token: string) {
  return hashValue(token);
}

export function getVerificationCodeHash(code: string) {
  return hashValue(code);
}

export function getSupportEmail() {
  return env.SUPPORT_EMAIL ?? env.MAIL_FROM ?? env.GMAIL_USER ?? null;
}

export function getAuthHelpText() {
  const supportEmail = getSupportEmail();

  return supportEmail
    ? `اگر ایمیل را ندیدید، پوشه Spam را هم بررسی کنید. در صورت نیاز با ${supportEmail} تماس بگیرید.`
    : "اگر ایمیل را ندیدید، پوشه Spam را هم بررسی کنید.";
}

function buildAppUrl(pathname: string) {
  return new URL(pathname, env.APP_BASE_URL).toString();
}

export function getResetPasswordUrl(token: string) {
  return buildAppUrl(`/reset-password?token=${encodeURIComponent(token)}`);
}

export async function sendSignupVerificationCodeEmail(input: {
  email: string;
  displayName: string;
  code: string;
}) {
  const expiresInMinutes = Math.round(SIGNUP_VERIFICATION_TTL_MS / 60000);
  const text = [
    `سلام ${input.displayName || "دوست عزیز"},`,
    "",
    "کد تایید ثبت نام شما:",
    input.code,
    "",
    `این کد تا ${expiresInMinutes} دقیقه معتبر است.`,
    "اگر این درخواست از طرف شما نبوده، این پیام را نادیده بگیرید.",
    getAuthHelpText(),
  ].join("\n");

  return sendTransactionalEmail({
    to: input.email,
    subject: "کد تایید ثبت نام",
    text,
  });
}

export async function sendPasswordResetEmail(input: {
  email: string;
  displayName: string;
  token: string;
}) {
  const url = getResetPasswordUrl(input.token);
  const text = [
    `سلام ${input.displayName || "دوست عزیز"},`,
    "",
    "برای ساخت رمز عبور جدید روی لینک زیر بزنید:",
    url,
    "",
    "این لینک مدت محدودی اعتبار دارد. اگر این درخواست از طرف شما نبوده، این پیام را نادیده بگیرید.",
    getAuthHelpText(),
  ].join("\n");

  return sendTransactionalEmail({
    to: input.email,
    subject: "بازیابی رمز عبور",
    text,
  });
}
