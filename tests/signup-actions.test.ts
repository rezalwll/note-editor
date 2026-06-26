import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getUserByEmail: vi.fn(),
  getUserByUsername: vi.fn(),
  createSession: vi.fn(),
  headers: vi.fn(),
  createSignupVerificationCodeRecord: vi.fn(),
  getVerificationCodeHash: vi.fn(),
  sendSignupVerificationCodeEmail: vi.fn(),
  getAuthHelpText: vi.fn(),
  pendingSignupDeleteMany: vi.fn(),
  pendingSignupUpsert: vi.fn(),
  pendingSignupFindUnique: vi.fn(),
  pendingSignupDelete: vi.fn(),
  pendingSignupUpdate: vi.fn(),
  userCreate: vi.fn(),
  userFindFirst: vi.fn(),
  transaction: vi.fn(),
  redirect: vi.fn(),
}));

vi.mock("argon2", () => ({
  default: {
    hash: vi.fn(async (value: string) => `hashed:${value}`),
    verify: vi.fn(async () => false),
  },
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("next/headers", () => ({
  headers: mocks.headers,
}));

vi.mock("next/navigation", () => ({
  redirect: mocks.redirect,
}));

vi.mock("@/lib/auth", () => ({
  requireUser: vi.fn(),
  clearSession: vi.fn(),
  createSession: mocks.createSession,
  getUserByUsername: mocks.getUserByUsername,
  getUserByEmail: mocks.getUserByEmail,
}));

vi.mock("@/lib/email-auth", () => ({
  createPasswordResetTokenRecord: vi.fn(),
  createSignupVerificationCodeRecord: mocks.createSignupVerificationCodeRecord,
  getAuthHelpText: mocks.getAuthHelpText,
  getTokenHash: vi.fn(),
  getVerificationCodeHash: mocks.getVerificationCodeHash,
  sendPasswordResetEmail: vi.fn(),
  sendSignupVerificationCodeEmail: mocks.sendSignupVerificationCodeEmail,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: mocks.transaction,
    pendingSignup: {
      deleteMany: mocks.pendingSignupDeleteMany,
      upsert: mocks.pendingSignupUpsert,
      findUnique: mocks.pendingSignupFindUnique,
      delete: mocks.pendingSignupDelete,
      update: mocks.pendingSignupUpdate,
    },
    user: {
      create: mocks.userCreate,
      findFirst: mocks.userFindFirst,
      update: vi.fn(),
    },
    passwordResetToken: {
      deleteMany: vi.fn(),
      create: vi.fn(),
      findUnique: vi.fn(),
    },
  },
}));

vi.mock("@/lib/storage", () => ({
  deleteUpload: vi.fn(),
}));

import {
  completeSignupVerificationAction,
  resendSignupVerificationCodeAction,
  signupAction,
} from "@/app/actions";

describe("signup actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.headers.mockResolvedValue({ get: vi.fn(() => null) });
    mocks.getAuthHelpText.mockReturnValue(
      "اگر ایمیل را ندیدید، پوشه Spam را هم بررسی کنید.",
    );
    mocks.getUserByEmail.mockResolvedValue(null);
    mocks.getUserByUsername.mockResolvedValue(null);
    mocks.createSignupVerificationCodeRecord.mockReturnValue({
      rawCode: "123456",
      codeHash: "code-hash",
      expiresAt: new Date("2026-06-27T01:00:00.000Z"),
    });
    mocks.sendSignupVerificationCodeEmail.mockResolvedValue({
      ok: true,
      messageId: "mail-1",
    });
    mocks.pendingSignupDeleteMany.mockResolvedValue({ count: 0 });
    mocks.pendingSignupUpsert.mockResolvedValue({ id: "pending-1" });
    mocks.pendingSignupFindUnique.mockResolvedValue(null);
    mocks.pendingSignupDelete.mockResolvedValue({ id: "pending-1" });
    mocks.pendingSignupUpdate.mockResolvedValue({ id: "pending-1" });
    mocks.userFindFirst.mockResolvedValue(null);
    mocks.userCreate.mockResolvedValue({ id: "user-1" });
    mocks.transaction.mockImplementation(async (input: unknown) => {
      if (typeof input === "function") {
        return input({
          user: { create: mocks.userCreate },
          pendingSignup: { delete: mocks.pendingSignupDelete },
        });
      }

      return Promise.all(input as Promise<unknown>[]);
    });
    mocks.redirect.mockImplementation(() => undefined);
  });

  it("creates a pending signup and redirects to verification", async () => {
    const formData = new FormData();
    formData.set("displayName", "Hello");
    formData.set("username", "hello");
    formData.set("email", "hello@example.com");
    formData.set("password", "secret");
    formData.set("confirmPassword", "secret");

    await signupAction({}, formData);

    expect(mocks.pendingSignupUpsert).toHaveBeenCalled();
    expect(mocks.sendSignupVerificationCodeEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        email: "hello@example.com",
        code: "123456",
      }),
    );
    expect(mocks.redirect).toHaveBeenCalledWith(
      "/signup/verify?email=hello%40example.com",
    );
  });

  it("creates the real user after a valid verification code", async () => {
    mocks.pendingSignupFindUnique.mockResolvedValue({
      id: "pending-1",
      email: "hello@example.com",
      username: "hello",
      displayName: "Hello",
      passwordHash: "hashed:secret",
      verificationCodeHash: "code-hash",
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
    });
    mocks.getVerificationCodeHash.mockReturnValue("code-hash");

    const formData = new FormData();
    formData.set("email", "hello@example.com");
    formData.set("code", "123456");

    await completeSignupVerificationAction({}, formData);

    expect(mocks.userCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          username: "hello",
          email: "hello@example.com",
          emailVerifiedAt: expect.any(Date),
        }),
      }),
    );
    expect(mocks.pendingSignupDelete).toHaveBeenCalledWith({
      where: { id: "pending-1" },
    });
    expect(mocks.createSession).toHaveBeenCalledWith("user-1");
    expect(mocks.redirect).toHaveBeenCalledWith("/");
  });

  it("resends and refreshes the pending signup code", async () => {
    mocks.pendingSignupFindUnique.mockResolvedValue({
      id: "pending-1",
      email: "hello@example.com",
      username: "hello",
      displayName: "Hello",
      passwordHash: "hashed:secret",
      verificationCodeHash: "old-hash",
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
    });

    const formData = new FormData();
    formData.set("email", "hello@example.com");

    await expect(resendSignupVerificationCodeAction({}, formData)).resolves.toEqual({
      success:
        "کد تایید ارسال شد. اگر ایمیل را ندیدید، پوشه Spam را هم بررسی کنید.",
      email: "hello@example.com",
    });

    expect(mocks.pendingSignupUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "pending-1" },
      }),
    );
    expect(mocks.sendSignupVerificationCodeEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        email: "hello@example.com",
        code: "123456",
      }),
    );
  });
});
