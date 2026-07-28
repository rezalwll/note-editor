import { env } from "@/lib/env";
import { sendTransactionalEmail } from "@/lib/mail";

export async function sendSupportReplyEmail(input: {
  email: string;
  displayName: string;
  ticketId: string;
  subject: string;
  reply: string;
}) {
  const ticketUrl = new URL(
    `/support/${encodeURIComponent(input.ticketId)}`,
    env.APP_BASE_URL,
  ).toString();
  const text = [
    `سلام ${input.displayName || "دوست عزیز"}،`,
    "",
    `درخواست «${input.subject}» پاسخ تازه‌ای دریافت کرد:`,
    "",
    input.reply,
    "",
    `مشاهده و ادامه گفتگو: ${ticketUrl}`,
  ].join("\n");

  return sendTransactionalEmail({
    to: input.email,
    subject: `پاسخ پشتیبانی: ${input.subject}`,
    text,
  });
}
