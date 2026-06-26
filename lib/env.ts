import { z } from "zod";

const booleanFromString = z.preprocess((value) => {
  if (value === "true") {
    return true;
  }

  if (value === "false") {
    return false;
  }

  return value;
}, z.boolean());

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  SESSION_SECRET: z.string().min(32),
  BOOTSTRAP_PASSWORD: z.string().min(1).default("reza1071377"),
  SESSION_COOKIE_SECURE: booleanFromString.default(false),
  UPLOAD_DIR: z.string().min(1).default("./uploads"),
  MAX_UPLOAD_SIZE_MB: z.coerce.number().int().positive().default(10),
  EMAIL_ENABLED: booleanFromString.default(false),
  MAIL_PROVIDER: z.literal("gmail").optional(),
  GMAIL_USER: z.string().trim().email().optional(),
  GMAIL_APP_PASSWORD: z.string().min(1).optional(),
  APP_BASE_URL: z.string().url().optional(),
  MAIL_FROM: z.string().trim().email().optional(),
  SUPPORT_EMAIL: z.string().trim().email().optional(),
}).superRefine((value, ctx) => {
  if (!value.EMAIL_ENABLED) {
    return;
  }

  if (value.MAIL_PROVIDER !== "gmail") {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["MAIL_PROVIDER"],
      message: "MAIL_PROVIDER must be gmail when EMAIL_ENABLED is true.",
    });
  }

  if (!value.GMAIL_USER) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["GMAIL_USER"],
      message: "GMAIL_USER is required when EMAIL_ENABLED is true.",
    });
  }

  if (!value.GMAIL_APP_PASSWORD) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["GMAIL_APP_PASSWORD"],
      message: "GMAIL_APP_PASSWORD is required when EMAIL_ENABLED is true.",
    });
  }

  if (!value.MAIL_FROM) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["MAIL_FROM"],
      message: "MAIL_FROM is required when EMAIL_ENABLED is true.",
    });
  }

  if (!value.APP_BASE_URL) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["APP_BASE_URL"],
      message: "APP_BASE_URL is required when EMAIL_ENABLED is true.",
    });
  }
});

const parsed = envSchema.safeParse({
  DATABASE_URL: process.env.DATABASE_URL,
  SESSION_SECRET: process.env.SESSION_SECRET,
  BOOTSTRAP_PASSWORD: process.env.BOOTSTRAP_PASSWORD ?? "reza1071377",
  SESSION_COOKIE_SECURE: process.env.SESSION_COOKIE_SECURE ?? "false",
  UPLOAD_DIR: process.env.UPLOAD_DIR ?? "./uploads",
  MAX_UPLOAD_SIZE_MB: process.env.MAX_UPLOAD_SIZE_MB ?? "10",
  EMAIL_ENABLED: process.env.EMAIL_ENABLED ?? "false",
  MAIL_PROVIDER: process.env.MAIL_PROVIDER,
  GMAIL_USER: process.env.GMAIL_USER,
  GMAIL_APP_PASSWORD: process.env.GMAIL_APP_PASSWORD,
  APP_BASE_URL: process.env.APP_BASE_URL,
  MAIL_FROM: process.env.MAIL_FROM,
  SUPPORT_EMAIL: process.env.SUPPORT_EMAIL,
});

if (!parsed.success) {
  console.error(parsed.error.flatten().fieldErrors);
  throw new Error("Invalid environment variables.");
}

export const env = parsed.data;
