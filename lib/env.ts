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
});

const parsed = envSchema.safeParse({
  DATABASE_URL: process.env.DATABASE_URL,
  SESSION_SECRET: process.env.SESSION_SECRET,
  BOOTSTRAP_PASSWORD: process.env.BOOTSTRAP_PASSWORD ?? "reza1071377",
  SESSION_COOKIE_SECURE: process.env.SESSION_COOKIE_SECURE ?? "false",
  UPLOAD_DIR: process.env.UPLOAD_DIR ?? "./uploads",
  MAX_UPLOAD_SIZE_MB: process.env.MAX_UPLOAD_SIZE_MB ?? "10",
});

if (!parsed.success) {
  console.error(parsed.error.flatten().fieldErrors);
  throw new Error("Invalid environment variables.");
}

export const env = parsed.data;
