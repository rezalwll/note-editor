import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAuthenticatedUser: vi.fn(),
  clearCookie: vi.fn(),
  hashPattern: vi.fn(),
  verifyPattern: vi.fn(),
  setUnlockedCookie: vi.fn(),
  createResetCode: vi.fn(),
  getResetCodeHash: vi.fn(),
  userUpdate: vi.fn(),
  userUpdateMany: vi.fn(),
  resetFindUnique: vi.fn(),
  resetUpsert: vi.fn(),
  resetUpdate: vi.fn(),
  resetDelete: vi.fn(),
  resetDeleteMany: vi.fn(),
  transaction: vi.fn(),
  sendResetEmail: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  requireAuthenticatedUser: mocks.requireAuthenticatedUser,
}));
vi.mock("@/lib/app-lock", () => ({
  APP_LOCK_BLOCK_MS: 15 * 60 * 1000,
  APP_LOCK_MAX_ATTEMPTS: 5,
  APP_LOCK_RESET_CODE_TTL_MS: 10 * 60 * 1000,
  APP_LOCK_RESET_RESEND_MS: 60 * 1000,
  clearAppLockCookie: mocks.clearCookie,
  hashAppLockPattern: mocks.hashPattern,
  verifyAppLockPattern: mocks.verifyPattern,
  setAppLockUnlockedCookie: mocks.setUnlockedCookie,
  createAppLockResetCode: mocks.createResetCode,
  getAppLockResetCodeHash: mocks.getResetCodeHash,
}));
vi.mock("@/lib/app-lock-email", () => ({
  sendAppLockResetCodeEmail: mocks.sendResetEmail,
}));
vi.mock("@/lib/prisma", () => {
  const prisma = {
    user: {
      update: mocks.userUpdate,
      updateMany: mocks.userUpdateMany,
    },
    appLockResetCode: {
      findUnique: mocks.resetFindUnique,
      upsert: mocks.resetUpsert,
      update: mocks.resetUpdate,
      delete: mocks.resetDelete,
      deleteMany: mocks.resetDeleteMany,
    },
    $transaction: mocks.transaction,
  };
  return { prisma };
});

import { POST as lockApp } from "@/app/api/app-lock/lock/route";
import { POST as requestRecovery } from "@/app/api/app-lock/recovery/request/route";
import { POST as resetPattern } from "@/app/api/app-lock/recovery/reset/route";
import { POST as setupPattern } from "@/app/api/app-lock/setup/route";
import { POST as unlockApp } from "@/app/api/app-lock/unlock/route";
import { prisma } from "@/lib/prisma";

const pattern = [0, 1, 2, 5];
const validHash = "ab".repeat(32);

function jsonRequest(body: unknown) {
  return new Request("https://notava.test/api/app-lock", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireAuthenticatedUser.mockResolvedValue({
    id: "user-1",
    displayName: "کاربر",
    email: "owner@example.com",
    appLockPatternHash: "stored-pattern-hash",
    appLockVersion: 3,
    appLockFailedAttempts: 0,
    appLockBlockedUntil: null,
  });
  mocks.hashPattern.mockResolvedValue("new-pattern-hash");
  mocks.verifyPattern.mockResolvedValue(true);
  mocks.userUpdateMany.mockResolvedValue({ count: 1 });
  mocks.userUpdate.mockResolvedValue({
    id: "user-1",
    appLockVersion: 4,
    appLockFailedAttempts: 0,
    appLockBlockedUntil: null,
  });
  mocks.createResetCode.mockReturnValue({
    rawCode: "123456",
    codeHash: validHash,
    expiresAt: new Date(Date.now() + 600_000),
  });
  mocks.getResetCodeHash.mockReturnValue(validHash);
  mocks.resetFindUnique.mockResolvedValue(null);
  mocks.resetUpsert.mockResolvedValue({ id: "reset-1" });
  mocks.resetDeleteMany.mockResolvedValue({ count: 1 });
  mocks.sendResetEmail.mockResolvedValue({ ok: true, messageId: "mail-1" });
  mocks.transaction.mockImplementation(async (callback) => callback(prisma));
});

describe("app lock routes", () => {
  it("sets the first pattern and immediately locks the app", async () => {
    mocks.requireAuthenticatedUser.mockResolvedValueOnce({
      id: "user-1",
      email: "owner@example.com",
      appLockPatternHash: null,
    });

    const response = await setupPattern(jsonRequest({ pattern }));

    expect(response.status).toBe(200);
    expect(mocks.hashPattern).toHaveBeenCalledWith("0-1-2-5");
    expect(mocks.userUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "user-1", appLockPatternHash: null },
      }),
    );
    expect(mocks.clearCookie).toHaveBeenCalledOnce();
  });

  it("locks an already configured app", async () => {
    const response = await lockApp();
    expect(response.status).toBe(200);
    expect(mocks.clearCookie).toHaveBeenCalledOnce();
  });

  it("unlocks a matching pattern and limits failed attempts", async () => {
    const successResponse = await unlockApp(jsonRequest({ pattern }));
    expect(successResponse.status).toBe(200);
    expect(mocks.setUnlockedCookie).toHaveBeenCalledWith("user-1", 3);

    mocks.verifyPattern.mockResolvedValueOnce(false);
    mocks.userUpdate.mockResolvedValueOnce({
      appLockFailedAttempts: 1,
      appLockBlockedUntil: null,
    });
    const failedResponse = await unlockApp(jsonRequest({ pattern }));
    expect(failedResponse.status).toBe(401);
    await expect(failedResponse.json()).resolves.toMatchObject({
      remainingAttempts: 4,
    });
  });

  it("sends a time-limited recovery code to the account email", async () => {
    const response = await requestRecovery();

    expect(response.status).toBe(200);
    expect(mocks.resetUpsert).toHaveBeenCalled();
    expect(mocks.sendResetEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        email: "owner@example.com",
        code: "123456",
      }),
    );
    await expect(response.json()).resolves.toMatchObject({
      sent: true,
      email: "ow•••@example.com",
    });
  });

  it("replaces the pattern after a valid one-time recovery code", async () => {
    mocks.resetFindUnique.mockResolvedValueOnce({
      userId: "user-1",
      codeHash: validHash,
      expiresAt: new Date(Date.now() + 60_000),
      failedAttempts: 0,
    });
    mocks.resetDelete.mockResolvedValueOnce({ id: "reset-1" });

    const response = await resetPattern(
      jsonRequest({ code: "۱۲۳۴۵۶", pattern }),
    );

    expect(response.status).toBe(200);
    expect(mocks.hashPattern).toHaveBeenCalledWith("0-1-2-5");
    expect(mocks.resetDelete).toHaveBeenCalledWith({
      where: { userId: "user-1" },
    });
    expect(mocks.setUnlockedCookie).toHaveBeenCalledWith("user-1", 4);
  });

  it("rejects a wrong recovery code and counts the attempt", async () => {
    mocks.resetFindUnique.mockResolvedValueOnce({
      userId: "user-1",
      codeHash: "cd".repeat(32),
      expiresAt: new Date(Date.now() + 60_000),
      failedAttempts: 0,
    });
    mocks.resetUpdate.mockResolvedValueOnce({ failedAttempts: 1 });

    const response = await resetPattern(
      jsonRequest({ code: "123456", pattern }),
    );

    expect(response.status).toBe(401);
    expect(mocks.resetUpdate).toHaveBeenCalled();
    expect(mocks.hashPattern).not.toHaveBeenCalled();
  });
});
