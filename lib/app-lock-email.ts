import { getAuthHelpText } from "@/lib/email-auth";
import { sendTransactionalEmail } from "@/lib/mail";

export async function sendAppLockResetCodeEmail(input: {
  email: string;
  displayName: string;
  code: string;
  expiresInMinutes: number;
}) {
  const text = [
    `سلام ${input.displayName || "دوست عزیز"}،`,
    "",
    "کد بازیابی قفل برنامه شما:",
    input.code,
    "",
    `این کد تا ${input.expiresInMinutes} دقیقه معتبر و فقط برای یک‌بار قابل استفاده است.`,
    "اگر این درخواست از طرف شما نبوده، کد را در اختیار کسی نگذارید و این پیام را نادیده بگیرید.",
    getAuthHelpText(),
  ].join("\n");

  return sendTransactionalEmail({
    to: input.email,
    subject: "کد بازیابی قفل نوتاوا",
    text,
  });
}
