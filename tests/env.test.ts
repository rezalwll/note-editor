import { afterEach, describe, expect, it, vi } from "vitest";

const originalEnv = { ...process.env };

async function loadEnvModule() {
  vi.resetModules();
  return import("@/lib/env");
}

describe("env email configuration", () => {
  afterEach(() => {
    process.env = { ...originalEnv };
    vi.resetModules();
  });

  it("accepts configured email variables when email sending is enabled", async () => {
    process.env.DATABASE_URL = "postgres://user:pass@localhost:5432/test";
    process.env.SESSION_SECRET = "12345678901234567890123456789012";
    process.env.EMAIL_ENABLED = "true";
    process.env.MAIL_PROVIDER = "gmail";
    process.env.GMAIL_USER = "pilot@gmail.com";
    process.env.GMAIL_APP_PASSWORD = "gmail-app-password";
    process.env.APP_BASE_URL = "http://localhost:3000";
    process.env.MAIL_FROM = "no-reply@notava.app";
    process.env.SUPPORT_EMAIL = "support@notava.app";

    const { env } = await loadEnvModule();

    expect(env.EMAIL_ENABLED).toBe(true);
    expect(env.MAIL_PROVIDER).toBe("gmail");
    expect(env.GMAIL_USER).toBe("pilot@gmail.com");
    expect(env.GMAIL_APP_PASSWORD).toBe("gmail-app-password");
    expect(env.APP_BASE_URL).toBe("http://localhost:3000");
    expect(env.MAIL_FROM).toBe("no-reply@notava.app");
    expect(env.SUPPORT_EMAIL).toBe("support@notava.app");
  });

  it("does not require Gmail variables when email sending is disabled", async () => {
    process.env.DATABASE_URL = "postgres://user:pass@localhost:5432/test";
    process.env.SESSION_SECRET = "12345678901234567890123456789012";
    process.env.EMAIL_ENABLED = "false";
    delete process.env.MAIL_PROVIDER;
    delete process.env.GMAIL_USER;
    delete process.env.GMAIL_APP_PASSWORD;
    delete process.env.APP_BASE_URL;
    delete process.env.MAIL_FROM;
    delete process.env.SUPPORT_EMAIL;

    const { env } = await loadEnvModule();

    expect(env.EMAIL_ENABLED).toBe(false);
    expect(env.MAIL_PROVIDER).toBeUndefined();
    expect(env.GMAIL_USER).toBeUndefined();
    expect(env.GMAIL_APP_PASSWORD).toBeUndefined();
    expect(env.APP_BASE_URL).toBeUndefined();
    expect(env.MAIL_FROM).toBeUndefined();
    expect(env.SUPPORT_EMAIL).toBeUndefined();
  });
});
