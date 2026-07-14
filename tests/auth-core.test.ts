import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  userFindUnique: vi.fn(),
  userFindFirst: vi.fn(),
  userUpdate: vi.fn(),
  userCreate: vi.fn(),
  cookieSet: vi.fn(),
  cookieDelete: vi.fn(),
  cookieGet: vi.fn(),
  redirect: vi.fn(),
  hashPassword: vi.fn(),
  sendMail: vi.fn(),
}));

vi.mock("@/lib/env", () => ({
  env: {
    SESSION_SECRET: "test-session-secret-at-least-32-characters",
    SESSION_COOKIE_SECURE: false,
    BOOTSTRAP_PASSWORD: "bootstrap-password",
    APP_BASE_URL: "https://notava.test",
    SUPPORT_EMAIL: "help@notava.test",
    MAIL_FROM: null,
    GMAIL_USER: null,
  },
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: mocks.userFindUnique,
      findFirst: mocks.userFindFirst,
      update: mocks.userUpdate,
      create: mocks.userCreate,
    },
  },
}));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    set: mocks.cookieSet,
    delete: mocks.cookieDelete,
    get: mocks.cookieGet,
  }),
}));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("argon2", () => ({ default: { hash: mocks.hashPassword } }));
vi.mock("@/lib/mail", () => ({ sendTransactionalEmail: mocks.sendMail }));
vi.mock("jose", () => ({
  SignJWT: class {
    setProtectedHeader() { return this; }
    setIssuedAt() { return this; }
    setExpirationTime() { return this; }
    async sign() { return "signed-token"; }
  },
  jwtVerify: async (token: string) => {
    if (token !== "signed-token") throw new Error("invalid");
    return { payload: { userId: "user-1" } };
  },
}));

import {
  clearSession,
  createBootstrapOwnerIfNeeded,
  createSession,
  getSessionCookieName,
  getUserByEmail,
  getUserByUsername,
  verifySession,
} from "@/lib/auth";
import {
  createPasswordResetTokenRecord,
  createSignupVerificationCodeRecord,
  getAuthHelpText,
  getResetPasswordUrl,
  getSupportEmail,
  getTokenHash,
  getVerificationCodeHash,
  sendPasswordResetEmail,
  sendSignupVerificationCodeEmail,
} from "@/lib/email-auth";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.hashPassword.mockResolvedValue("password-hash");
  mocks.sendMail.mockResolvedValue({ accepted: true });
});

describe("authentication primitives", () => {
  it("normalizes user lookups", async () => {
    mocks.userFindUnique.mockResolvedValue({ id: "user-1" });
    await getUserByUsername(" Owner ");
    await getUserByEmail(" OWNER@Example.COM ");
    expect(mocks.userFindUnique).toHaveBeenNthCalledWith(1, { where: { username: "Owner" } });
    expect(mocks.userFindUnique).toHaveBeenNthCalledWith(2, { where: { email: "owner@example.com" } });
  });

  it("repairs incomplete bootstrap owners and creates the first owner", async () => {
    mocks.userFindFirst.mockResolvedValueOnce({ id: "user-1", username: "", displayName: "" });
    mocks.userUpdate.mockResolvedValue({ id: "user-1", username: "owner", displayName: "Owner" });
    await expect(createBootstrapOwnerIfNeeded()).resolves.toMatchObject({ username: "owner" });
    expect(mocks.userUpdate).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "user-1" } }));

    mocks.userFindFirst.mockResolvedValueOnce(null);
    mocks.userCreate.mockResolvedValue({ id: "user-2", username: "owner" });
    await expect(createBootstrapOwnerIfNeeded()).resolves.toMatchObject({ id: "user-2" });
    expect(mocks.hashPassword).toHaveBeenCalledWith("bootstrap-password");
  });

  it("creates, verifies and clears signed sessions", async () => {
    await createSession("user-1");
    const token = mocks.cookieSet.mock.calls[0][1] as string;
    expect(getSessionCookieName()).toBe("notebook_session");
    expect(mocks.cookieSet).toHaveBeenCalledWith(
      "notebook_session",
      expect.any(String),
      expect.objectContaining({ httpOnly: true, sameSite: "lax", secure: false }),
    );
    await expect(verifySession(token)).resolves.toMatchObject({ userId: "user-1" });
    await expect(verifySession("invalid-token")).resolves.toBeNull();
    await expect(verifySession(null)).resolves.toBeNull();

    await clearSession();
    expect(mocks.cookieDelete).toHaveBeenCalledWith("notebook_session");
  });
});

describe("email authentication helpers", () => {
  it("creates hashed verification and reset credentials", () => {
    const code = createSignupVerificationCodeRecord();
    expect(code.rawCode).toMatch(/^\d{6}$/);
    expect(code.codeHash).toBe(getVerificationCodeHash(code.rawCode));
    expect(code.expiresAt.getTime()).toBeGreaterThan(Date.now());

    const reset = createPasswordResetTokenRecord();
    expect(reset.rawToken).toHaveLength(64);
    expect(reset.tokenHash).toBe(getTokenHash(reset.rawToken));
    expect(getResetPasswordUrl("a b")).toBe("https://notava.test/reset-password?token=a%20b");
    expect(getSupportEmail()).toBe("help@notava.test");
    expect(getAuthHelpText()).toContain("help@notava.test");
  });

  it("sends verification and password-reset messages", async () => {
    await sendSignupVerificationCodeEmail({
      email: "owner@example.com",
      displayName: "Owner",
      code: "123456",
    });
    await sendPasswordResetEmail({
      email: "owner@example.com",
      displayName: "Owner",
      token: "reset-token",
    });

    expect(mocks.sendMail).toHaveBeenCalledTimes(2);
    expect(mocks.sendMail.mock.calls[0][0]).toMatchObject({ to: "owner@example.com" });
    expect(mocks.sendMail.mock.calls[0][0].text).toContain("123456");
    expect(mocks.sendMail.mock.calls[1][0].text).toContain("reset-token");
  });
});
