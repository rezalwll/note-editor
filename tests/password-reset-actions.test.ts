import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getUserByEmail: vi.fn(),
  headers: vi.fn(),
  sendPasswordResetEmail: vi.fn(),
  createPasswordResetTokenRecord: vi.fn(),
  getTokenHash: vi.fn(),
  getAuthHelpText: vi.fn(),
  passwordResetTokenDeleteMany: vi.fn(),
  passwordResetTokenCreate: vi.fn(),
  passwordResetTokenFindUnique: vi.fn(),
  userUpdate: vi.fn(),
  transaction: vi.fn(),
  redirect: vi.fn(),
}));

vi.mock("argon2", () => ({
  default: {
    hash: vi.fn(async (value: string) => `hashed:${value}`),
    verify: vi.fn(),
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
  createSession: vi.fn(),
  getUserByUsername: vi.fn(),
  getUserByEmail: mocks.getUserByEmail,
}));

vi.mock("@/lib/email-auth", () => ({
  createPasswordResetTokenRecord: mocks.createPasswordResetTokenRecord,
  createSignupVerificationCodeRecord: vi.fn(),
  getAuthHelpText: mocks.getAuthHelpText,
  getTokenHash: mocks.getTokenHash,
  getVerificationCodeHash: vi.fn(),
  sendPasswordResetEmail: mocks.sendPasswordResetEmail,
  sendSignupVerificationCodeEmail: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: mocks.transaction,
    passwordResetToken: {
      deleteMany: mocks.passwordResetTokenDeleteMany,
      create: mocks.passwordResetTokenCreate,
      findUnique: mocks.passwordResetTokenFindUnique,
    },
    user: {
      update: mocks.userUpdate,
      create: vi.fn(),
      findFirst: vi.fn(),
    },
    pendingSignup: {
      findUnique: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
      upsert: vi.fn(),
      update: vi.fn(),
    },
  },
}));

vi.mock("@/lib/storage", () => ({
  deleteUpload: vi.fn(),
}));

import {
  requestPasswordResetAction,
  resetPasswordAction,
} from "@/app/actions";

describe("password reset actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.headers.mockResolvedValue({
      get: vi.fn(() => null),
    });
    mocks.getAuthHelpText.mockReturnValue(
      "اگر ایمیل را ندیدید، پوشه Spam را هم چک کنید. در صورت مشکل با support@notava.app تماس بگیرید.",
    );
    mocks.createPasswordResetTokenRecord.mockReturnValue({
      rawToken: "raw-token",
      tokenHash: "hashed-token",
      expiresAt: new Date("2026-06-27T01:00:00.000Z"),
    });
    mocks.transaction.mockImplementation((items: Promise<unknown>[]) =>
      Promise.all(items),
    );
    mocks.userUpdate.mockResolvedValue({ id: "user-1" });
    mocks.passwordResetTokenDeleteMany.mockResolvedValue({ count: 1 });
    mocks.passwordResetTokenCreate.mockResolvedValue({ id: "reset-token-1" });
    mocks.sendPasswordResetEmail.mockResolvedValue({
      ok: true,
      messageId: "message-1",
    });
    mocks.redirect.mockImplementation(() => undefined);
  });

  it("returns a generic success message and sends mail for known emails", async () => {
    mocks.getUserByEmail.mockResolvedValue({
      id: "user-1",
      email: "hello@example.com",
      displayName: "Hello",
    });

    const formData = new FormData();
    formData.set("email", "hello@example.com");

    await expect(requestPasswordResetAction({}, formData)).resolves.toEqual({
      success:
        "اگر حسابی با این ایمیل وجود داشته باشد، لینک بازیابی ارسال شد. اگر ایمیل را ندیدید، پوشه Spam را هم چک کنید. در صورت مشکل با support@notava.app تماس بگیرید.",
    });

    expect(mocks.passwordResetTokenCreate).toHaveBeenCalled();
    expect(mocks.sendPasswordResetEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        email: "hello@example.com",
        token: "raw-token",
      }),
    );
  });

  it("returns the same generic success message for unknown emails", async () => {
    mocks.getUserByEmail.mockResolvedValue(null);

    const formData = new FormData();
    formData.set("email", "missing@example.com");

    await expect(requestPasswordResetAction({}, formData)).resolves.toEqual({
      success:
        "اگر حسابی با این ایمیل وجود داشته باشد، لینک بازیابی ارسال شد. اگر ایمیل را ندیدید، پوشه Spam را هم چک کنید. در صورت مشکل با support@notava.app تماس بگیرید.",
    });

    expect(mocks.sendPasswordResetEmail).not.toHaveBeenCalled();
  });

  it("rejects invalid reset tokens", async () => {
    mocks.getTokenHash.mockReturnValue("bad-hash");
    mocks.passwordResetTokenFindUnique.mockResolvedValue(null);

    const formData = new FormData();
    formData.set("token", "bad-token");
    formData.set("password", "new-password");
    formData.set("confirmPassword", "new-password");

    await expect(resetPasswordAction({}, formData)).resolves.toEqual({
      error: "لینک بازیابی نامعتبر یا منقضی شده است. دوباره درخواست بدهید.",
    });
  });

  it("updates the password and redirects after a valid token", async () => {
    mocks.getTokenHash.mockReturnValue("good-hash");
    mocks.passwordResetTokenFindUnique.mockResolvedValue({
      userId: "user-1",
      email: "hello@example.com",
      tokenHash: "good-hash",
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      user: { id: "user-1" },
    });

    const formData = new FormData();
    formData.set("token", "good-token");
    formData.set("password", "new-password");
    formData.set("confirmPassword", "new-password");

    await resetPasswordAction({}, formData);

    expect(mocks.userUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "user-1" },
      }),
    );
    expect(mocks.passwordResetTokenDeleteMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: [{ userId: "user-1" }, { email: "hello@example.com" }],
        }),
      }),
    );
    expect(mocks.redirect).toHaveBeenCalledWith("/login?passwordReset=success");
  });
});
