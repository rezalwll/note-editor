import nodemailer from "nodemailer";

import { env } from "@/lib/env";

type SendTransactionalEmailInput = {
  to: string;
  subject: string;
  text: string;
  html?: string;
};

type SendTransactionalEmailResult =
  | {
      ok: false;
      skipped: true;
      message: string;
    }
  | {
      ok: true;
      messageId: string;
    };

function getGmailTransport() {
  if (!env.GMAIL_USER || !env.GMAIL_APP_PASSWORD) {
    throw new Error("Missing Gmail email config");
  }

  return nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: env.GMAIL_USER,
      pass: env.GMAIL_APP_PASSWORD,
    },
  });
}

export async function sendTransactionalEmail({
  to,
  subject,
  text,
  html,
}: SendTransactionalEmailInput): Promise<SendTransactionalEmailResult> {
  if (!env.EMAIL_ENABLED) {
    return {
      ok: false,
      skipped: true,
      message: "Email is disabled",
    };
  }

  const transporter = getGmailTransport();
  const result = await transporter.sendMail({
    from: env.MAIL_FROM || env.GMAIL_USER,
    to,
    subject,
    text,
    html,
  });

  return {
    ok: true,
    messageId: result.messageId,
  };
}
