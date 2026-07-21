import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  argonHash: vi.fn(),
  argonVerify: vi.fn(),
  clearAttempts: vi.fn(),
  clearSession: vi.fn(),
  createPasswordResetTokenRecord: vi.fn(),
  createSession: vi.fn(),
  createSignupVerificationCodeRecord: vi.fn(),
  getAuthHelpText: vi.fn(),
  getFriendlyDatabaseError: vi.fn(),
  getRateLimitState: vi.fn(),
  getTokenHash: vi.fn(),
  getUserByEmail: vi.fn(),
  getUserByUsername: vi.fn(),
  getVerificationCodeHash: vi.fn(),
  headerGet: vi.fn(),
  pendingDelete: vi.fn(),
  pendingDeleteMany: vi.fn(),
  pendingFindUnique: vi.fn(),
  pendingUpdate: vi.fn(),
  pendingUpsert: vi.fn(),
  recordFailedAttempt: vi.fn(),
  redirect: vi.fn(),
  revalidatePath: vi.fn(),
  requireUser: vi.fn(),
  resetCreate: vi.fn(),
  resetDeleteMany: vi.fn(),
  resetFindUnique: vi.fn(),
  sendPasswordResetEmail: vi.fn(),
  sendSignupVerificationCodeEmail: vi.fn(),
  transaction: vi.fn(),
  userCreate: vi.fn(),
  userFindFirst: vi.fn(),
  userUpdate: vi.fn(),
  createWelcomeWorkspace: vi.fn(),
  ensureWelcomeWorkspace: vi.fn(),
}));

vi.mock("argon2", () => ({
  default: { hash: mocks.argonHash, verify: mocks.argonVerify },
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("next/headers", () => ({
  headers: async () => ({ get: mocks.headerGet }),
}));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));

vi.mock("@/lib/auth", () => ({
  clearSession: mocks.clearSession,
  createSession: mocks.createSession,
  getUserByEmail: mocks.getUserByEmail,
  getUserByUsername: mocks.getUserByUsername,
  requireUser: mocks.requireUser,
}));

vi.mock("@/lib/email-auth", () => ({
  createPasswordResetTokenRecord: mocks.createPasswordResetTokenRecord,
  createSignupVerificationCodeRecord: mocks.createSignupVerificationCodeRecord,
  getAuthHelpText: mocks.getAuthHelpText,
  getTokenHash: mocks.getTokenHash,
  getVerificationCodeHash: mocks.getVerificationCodeHash,
  sendPasswordResetEmail: mocks.sendPasswordResetEmail,
  sendSignupVerificationCodeEmail: mocks.sendSignupVerificationCodeEmail,
}));

vi.mock("@/lib/errors", () => ({
  getFriendlyDatabaseError: mocks.getFriendlyDatabaseError,
}));

vi.mock("@/lib/rate-limit", () => ({
  clearAttempts: mocks.clearAttempts,
  getRateLimitState: mocks.getRateLimitState,
  recordFailedAttempt: mocks.recordFailedAttempt,
}));

vi.mock("@/lib/welcome-workspace", () => ({
  createWelcomeWorkspace: mocks.createWelcomeWorkspace,
  ensureWelcomeWorkspace: mocks.ensureWelcomeWorkspace,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: mocks.transaction,
    pendingSignup: {
      delete: mocks.pendingDelete,
      deleteMany: mocks.pendingDeleteMany,
      findUnique: mocks.pendingFindUnique,
      update: mocks.pendingUpdate,
      upsert: mocks.pendingUpsert,
    },
    passwordResetToken: {
      create: mocks.resetCreate,
      deleteMany: mocks.resetDeleteMany,
      findUnique: mocks.resetFindUnique,
    },
    user: {
      create: mocks.userCreate,
      findFirst: mocks.userFindFirst,
      update: mocks.userUpdate,
    },
  },
}));

import {
  changePasswordAction,
  completeSignupVerificationAction,
  loginAction,
  logoutAction,
  requestPasswordResetAction,
  resendSignupVerificationCodeAction,
  resetPasswordAction,
  signupAction,
  updateProfileAction,
} from "@/app/actions/auth-actions";

const future = new Date(Date.now() + 60_000);
const past = new Date(Date.now() - 60_000);

function form(values: Record<string, string | Blob>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) {
    data.set(key, value);
  }
  return data;
}

function signupForm(overrides: Record<string, string> = {}) {
  return form({
    displayName: "Test User",
    username: "test-user",
    email: "test@example.com",
    password: "secret",
    confirmPassword: "secret",
    ...overrides,
  });
}

function pending(overrides: Record<string, unknown> = {}) {
  return {
    id: "pending-1",
    email: "test@example.com",
    username: "test-user",
    displayName: "Test User",
    passwordHash: "password-hash",
    verificationCodeHash: "code-hash",
    expiresAt: future,
    resendCount: 2,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.argonHash.mockImplementation(async (value: string) => `hashed:${value}`);
  mocks.argonVerify.mockResolvedValue(true);
  mocks.createPasswordResetTokenRecord.mockReturnValue({
    rawToken: "raw-token",
    tokenHash: "token-hash",
    expiresAt: future,
  });
  mocks.createSignupVerificationCodeRecord.mockReturnValue({
    rawCode: "123456",
    codeHash: "code-hash",
    expiresAt: future,
  });
  mocks.getAuthHelpText.mockReturnValue("help");
  mocks.getFriendlyDatabaseError.mockReturnValue(null);
  mocks.getRateLimitState.mockReturnValue({ blocked: false, retryAfterMs: 0 });
  mocks.getTokenHash.mockReturnValue("token-hash");
  mocks.getUserByEmail.mockResolvedValue(null);
  mocks.getUserByUsername.mockResolvedValue(null);
  mocks.getVerificationCodeHash.mockReturnValue("code-hash");
  mocks.createWelcomeWorkspace.mockResolvedValue({
    groupId: "group-1",
    notebookId: "notebook-1",
    pageId: "page-1",
  });
  mocks.ensureWelcomeWorkspace.mockResolvedValue(null);
  mocks.headerGet.mockReturnValue(null);
  mocks.pendingFindUnique.mockResolvedValue(null);
  mocks.redirect.mockImplementation(() => undefined);
  mocks.requireUser.mockResolvedValue({
    id: "user-1",
    passwordHash: "old-hash",
  });
  mocks.sendPasswordResetEmail.mockResolvedValue({ ok: true });
  mocks.sendSignupVerificationCodeEmail.mockResolvedValue({ ok: true });
  mocks.transaction.mockImplementation(async (input: unknown) => {
    if (typeof input === "function") {
      return input({
        user: { create: mocks.userCreate },
        pendingSignup: { delete: mocks.pendingDelete },
      });
    }
    return Promise.all(input as Promise<unknown>[]);
  });
  mocks.userCreate.mockResolvedValue({ id: "user-1" });
  mocks.userFindFirst.mockResolvedValue(null);
});

describe("login action", () => {
  it("validates required credentials", async () => {
    await expect(loginAction({}, form({}))).resolves.toMatchObject({
      error: expect.any(String),
    });
  });

  it("blocks rate-limited clients using the forwarded address", async () => {
    mocks.headerGet.mockImplementation((name: string) =>
      name === "x-forwarded-for" ? "203.0.113.1" : null,
    );
    mocks.getRateLimitState.mockReturnValue({ blocked: true, retryAfterMs: 61_000 });
    const result = await loginAction({}, form({ username: "owner", password: "secret" }));
    expect(result.error).toContain("2");
    expect(mocks.getRateLimitState).toHaveBeenCalledWith("203.0.113.1");
  });

  it("uses the real IP and local identity fallbacks", async () => {
    mocks.getUserByUsername.mockResolvedValue(null);
    mocks.headerGet.mockImplementation((name: string) =>
      name === "x-real-ip" ? "198.51.100.2" : null,
    );
    await loginAction({}, form({ username: "owner", password: "secret" }));
    expect(mocks.recordFailedAttempt).toHaveBeenCalledWith("198.51.100.2");

    mocks.headerGet.mockReturnValue(null);
    await loginAction({}, form({ username: "owner", password: "secret" }));
    expect(mocks.recordFailedAttempt).toHaveBeenCalledWith("local-user:owner");
  });

  it("returns friendly and fallback lookup failures", async () => {
    mocks.getUserByUsername.mockRejectedValueOnce(new Error("db"));
    mocks.getFriendlyDatabaseError.mockReturnValueOnce("friendly");
    await expect(
      loginAction({}, form({ username: "owner", password: "secret" })),
    ).resolves.toEqual({ error: "friendly" });

    mocks.getUserByUsername.mockRejectedValueOnce(new Error("db"));
    await expect(
      loginAction({}, form({ username: "owner", password: "secret" })),
    ).resolves.toMatchObject({ error: expect.any(String) });
  });

  it("rejects a wrong password and records the failure", async () => {
    mocks.getUserByUsername.mockResolvedValue({ id: "user-1", passwordHash: "hash" });
    mocks.argonVerify.mockResolvedValue(false);
    await expect(
      loginAction({}, form({ username: "owner", password: "wrong" })),
    ).resolves.toMatchObject({ error: expect.any(String) });
    expect(mocks.recordFailedAttempt).toHaveBeenCalled();
  });

  it.each([
    [undefined, "/"],
    ["https://evil.test", "/"],
    ["//evil.test", "/"],
    ["/pages/1", "/pages/1"],
  ])("logs in and sanitizes redirect %#", async (next, expected) => {
    mocks.getUserByUsername.mockResolvedValue({ id: "user-1", passwordHash: "hash" });
    const values: Record<string, string | Blob> = { username: "owner", password: "secret" };
    if (next !== undefined) values.next = next;
    await loginAction({}, form(values));
    expect(mocks.clearAttempts).toHaveBeenCalled();
    expect(mocks.ensureWelcomeWorkspace).toHaveBeenCalledWith("user-1");
    expect(mocks.createSession).toHaveBeenCalledWith("user-1");
    expect(mocks.redirect).toHaveBeenCalledWith(expected);
  });

  it("does not create a session when the welcome workspace cannot be prepared", async () => {
    mocks.getUserByUsername.mockResolvedValue({ id: "user-1", passwordHash: "hash" });
    mocks.ensureWelcomeWorkspace.mockRejectedValueOnce(new Error("db"));
    mocks.getFriendlyDatabaseError.mockReturnValueOnce("friendly");

    await expect(
      loginAction({}, form({ username: "owner", password: "secret" })),
    ).resolves.toEqual({ error: "friendly" });

    expect(mocks.createSession).not.toHaveBeenCalled();

    mocks.ensureWelcomeWorkspace.mockRejectedValueOnce(new Error("db"));
    await expect(
      loginAction({}, form({ username: "owner", password: "secret" })),
    ).resolves.toMatchObject({ error: expect.any(String) });
  });

});

describe("signup and verification actions", () => {
  it("validates signup fields and matching passwords", async () => {
    await expect(signupAction({}, form({}))).resolves.toMatchObject({ error: expect.any(String) });
    await expect(
      signupAction({}, signupForm({ confirmPassword: "different" })),
    ).resolves.toMatchObject({ error: expect.any(String) });
  });

  it("rejects existing users by email or username", async () => {
    mocks.getUserByEmail.mockResolvedValueOnce({ id: "email-owner" });
    await expect(signupAction({}, signupForm())).resolves.toMatchObject({ error: expect.any(String) });
    mocks.getUserByUsername.mockResolvedValueOnce({ id: "username-owner" });
    await expect(signupAction({}, signupForm())).resolves.toMatchObject({ error: expect.any(String) });
  });

  it("deletes expired pending identities and creates a fresh pending signup", async () => {
    mocks.pendingFindUnique.mockImplementation(async ({ where }: { where: Record<string, string> }) =>
      where.email
        ? pending({ expiresAt: past })
        : pending({ id: "pending-username", expiresAt: past }),
    );
    await signupAction({}, signupForm());
    expect(mocks.pendingDelete).toHaveBeenCalledTimes(2);
    expect(mocks.pendingUpsert).toHaveBeenCalledWith(
      expect.objectContaining({ update: expect.objectContaining({ resendCount: 0 }) }),
    );
    expect(mocks.redirect).toHaveBeenCalled();
  });

  it("rejects a pending username owned by another email", async () => {
    mocks.pendingFindUnique.mockImplementation(async ({ where }: { where: Record<string, string> }) =>
      where.username ? pending({ email: "other@example.com" }) : null,
    );
    await expect(signupAction({}, signupForm())).resolves.toMatchObject({ error: expect.any(String) });
  });

  it("increments resend state for an existing pending email", async () => {
    mocks.pendingFindUnique.mockImplementation(async ({ where }: { where: Record<string, string> }) =>
      where.email ? pending() : pending(),
    );
    await signupAction({}, signupForm());
    expect(mocks.pendingUpsert).toHaveBeenCalledWith(
      expect.objectContaining({ update: expect.objectContaining({ resendCount: 3 }) }),
    );
  });

  it("reports signup mail and database failures", async () => {
    mocks.sendSignupVerificationCodeEmail.mockResolvedValueOnce({ ok: false, message: "mail failed" });
    await expect(signupAction({}, signupForm())).resolves.toEqual({ error: "mail failed. help" });

    mocks.pendingDeleteMany.mockRejectedValueOnce({ code: "P2002" });
    await expect(signupAction({}, signupForm())).resolves.toMatchObject({ error: expect.any(String) });
    mocks.pendingDeleteMany.mockRejectedValueOnce(new Error("db"));
    mocks.getFriendlyDatabaseError.mockReturnValueOnce("friendly");
    await expect(signupAction({}, signupForm())).resolves.toEqual({ error: "friendly" });
    mocks.pendingDeleteMany.mockRejectedValueOnce(new Error("db"));
    await expect(signupAction({}, signupForm())).resolves.toMatchObject({ error: expect.any(String) });
  });

  it("covers non-duplicate database error shapes", async () => {
    for (const error of [null, 1, {}, { code: "OTHER" }]) {
      mocks.pendingDeleteMany.mockRejectedValueOnce(error);
      await expect(signupAction({}, signupForm())).resolves.toMatchObject({ error: expect.any(String) });
    }
  });

  it("validates verification requests, expiration and incorrect codes", async () => {
    await expect(completeSignupVerificationAction({}, form({}))).resolves.toMatchObject({ error: expect.any(String) });
    await expect(
      completeSignupVerificationAction({}, form({ email: "test@example.com", code: "123456" })),
    ).resolves.toMatchObject({ error: expect.any(String) });

    mocks.pendingFindUnique.mockResolvedValueOnce(pending({ expiresAt: past }));
    await expect(
      completeSignupVerificationAction({}, form({ email: "test@example.com", code: "123456" })),
    ).resolves.toMatchObject({ error: expect.any(String) });
    expect(mocks.pendingDelete).toHaveBeenCalled();

    mocks.pendingFindUnique.mockResolvedValueOnce(pending());
    mocks.getVerificationCodeHash.mockReturnValueOnce("wrong");
    await expect(
      completeSignupVerificationAction({}, form({ email: "test@example.com", code: "123456" })),
    ).resolves.toMatchObject({ error: expect.any(String), email: "test@example.com" });
  });

  it("rejects verification if a user appeared before completion", async () => {
    mocks.pendingFindUnique.mockResolvedValue(pending());
    mocks.userFindFirst.mockResolvedValue({ id: "existing" });
    await expect(
      completeSignupVerificationAction({}, form({ email: "test@example.com", code: "123456" })),
    ).resolves.toMatchObject({ error: expect.any(String) });
    expect(mocks.pendingDelete).toHaveBeenCalled();
  });

  it("creates a verified user and session", async () => {
    mocks.pendingFindUnique.mockResolvedValue(pending());
    await completeSignupVerificationAction({}, form({ email: "test@example.com", code: "123456" }));
    expect(mocks.userCreate).toHaveBeenCalled();
    expect(mocks.createWelcomeWorkspace).toHaveBeenCalledWith(
      expect.any(Object),
      "user-1",
    );
    expect(mocks.pendingDelete).toHaveBeenCalled();
    expect(mocks.createSession).toHaveBeenCalledWith("user-1");
    expect(mocks.redirect).toHaveBeenCalledWith("/");
  });

  it("reports duplicate, friendly and fallback verification failures", async () => {
    mocks.pendingFindUnique.mockResolvedValue(pending());
    mocks.transaction.mockRejectedValueOnce({ code: "P2002" });
    await expect(
      completeSignupVerificationAction({}, form({ email: "test@example.com", code: "123456" })),
    ).resolves.toMatchObject({ error: expect.any(String) });

    mocks.transaction.mockRejectedValueOnce(new Error("db"));
    mocks.getFriendlyDatabaseError.mockReturnValueOnce("friendly");
    await expect(
      completeSignupVerificationAction({}, form({ email: "test@example.com", code: "123456" })),
    ).resolves.toEqual({ error: "friendly", email: "test@example.com" });

    mocks.transaction.mockRejectedValueOnce(new Error("db"));
    await expect(
      completeSignupVerificationAction({}, form({ email: "test@example.com", code: "123456" })),
    ).resolves.toMatchObject({ error: expect.any(String), email: "test@example.com" });
  });

  it("validates and rate-limits verification-code resends", async () => {
    await expect(resendSignupVerificationCodeAction({}, form({}))).resolves.toMatchObject({ error: expect.any(String) });
    mocks.getRateLimitState.mockReturnValueOnce({ blocked: true, retryAfterMs: 1000 });
    await expect(
      resendSignupVerificationCodeAction({}, form({ email: "test@example.com" })),
    ).resolves.toMatchObject({ error: expect.any(String), email: "test@example.com" });
  });

  it("handles missing, failed, successful and exceptional resend attempts", async () => {
    await expect(
      resendSignupVerificationCodeAction({}, form({ email: "test@example.com" })),
    ).resolves.toMatchObject({ error: expect.any(String) });

    mocks.pendingFindUnique.mockResolvedValue(pending());
    mocks.sendSignupVerificationCodeEmail.mockResolvedValueOnce({ ok: false, message: "mail failed" });
    await expect(
      resendSignupVerificationCodeAction({}, form({ email: "test@example.com" })),
    ).resolves.toEqual({ error: "mail failed. help", email: "test@example.com" });

    mocks.sendSignupVerificationCodeEmail.mockResolvedValueOnce({ ok: true });
    await expect(
      resendSignupVerificationCodeAction({}, form({ email: "test@example.com" })),
    ).resolves.toEqual({ success: "کد تایید ارسال شد. help", email: "test@example.com" });

    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.pendingUpdate.mockRejectedValueOnce(new Error("db"));
    await expect(
      resendSignupVerificationCodeAction({}, form({ email: "test@example.com" })),
    ).resolves.toMatchObject({ error: expect.any(String), email: "test@example.com" });
    expect(consoleError).toHaveBeenCalled();
  });
});

describe("account maintenance actions", () => {
  it("clears the session on logout", async () => {
    await expect(logoutAction()).resolves.toEqual({ success: true });
    expect(mocks.clearSession).toHaveBeenCalled();
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it("validates, updates and revalidates profile data", async () => {
    await expect(updateProfileAction({}, form({}))).resolves.toMatchObject({ error: expect.any(String) });
    await expect(updateProfileAction({}, form({
      username: "owner",
      email: "owner@example.com",
      displayName: "Owner",
    }))).resolves.toMatchObject({ success: expect.any(String) });
    expect(mocks.userUpdate).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "user-1" } }));
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/settings");
  });

  it("reports duplicate, friendly and fallback profile failures", async () => {
    const data = form({ username: "owner", email: "owner@example.com", displayName: "Owner" });
    mocks.userUpdate.mockRejectedValueOnce({ code: "P2002" });
    await expect(updateProfileAction({}, data)).resolves.toMatchObject({ error: expect.any(String) });
    mocks.userUpdate.mockRejectedValueOnce(new Error("db"));
    mocks.getFriendlyDatabaseError.mockReturnValueOnce("friendly");
    await expect(updateProfileAction({}, data)).resolves.toEqual({ error: "friendly" });
    mocks.userUpdate.mockRejectedValueOnce(new Error("db"));
    await expect(updateProfileAction({}, data)).resolves.toMatchObject({ error: expect.any(String) });
  });

  it("validates current passwords and changes valid passwords", async () => {
    await expect(changePasswordAction({}, form({}))).resolves.toMatchObject({ error: expect.any(String) });
    mocks.argonVerify.mockResolvedValueOnce(false);
    await expect(changePasswordAction({}, form({ currentPassword: "wrong", newPassword: "new" })))
      .resolves.toMatchObject({ error: expect.any(String) });
    await expect(changePasswordAction({}, form({ currentPassword: "old", newPassword: "new" })))
      .resolves.toMatchObject({ success: expect.any(String) });
    expect(mocks.userUpdate).toHaveBeenCalledWith(expect.objectContaining({
      data: { passwordHash: "hashed:new", mustChangePassword: false },
    }));
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/settings/security");
  });
});

describe("password reset actions", () => {
  it("validates and rate-limits reset requests without leaking account state", async () => {
    await expect(requestPasswordResetAction({}, form({}))).resolves.toMatchObject({ error: expect.any(String) });
    mocks.headerGet.mockImplementation((name: string) => name === "x-forwarded-for" ? "203.0.113.1" : null);
    mocks.getRateLimitState.mockReturnValueOnce({ blocked: true, retryAfterMs: 1000 });
    await expect(requestPasswordResetAction({}, form({ email: "test@example.com" })))
      .resolves.toEqual({ success: "اگر حسابی با این ایمیل وجود داشته باشد، لینک بازیابی ارسال شد. help" });
  });

  it("uses real-IP and email rate keys for unknown accounts", async () => {
    mocks.headerGet.mockImplementation((name: string) => name === "x-real-ip" ? "198.51.100.2" : null);
    await requestPasswordResetAction({}, form({ email: "test@example.com" }));
    expect(mocks.recordFailedAttempt).toHaveBeenCalledWith("password-reset:198.51.100.2");
    mocks.headerGet.mockReturnValue(null);
    await requestPasswordResetAction({}, form({ email: "test@example.com" }));
    expect(mocks.recordFailedAttempt).toHaveBeenCalledWith("password-reset:password-reset:test@example.com");
  });

  it("creates reset credentials and logs mail delivery failures", async () => {
    mocks.getUserByEmail.mockResolvedValue({
      id: "user-1",
      email: "test@example.com",
      displayName: "Test",
    });
    const consoleWarn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    mocks.sendPasswordResetEmail.mockResolvedValueOnce({ ok: false, message: "mail disabled" });
    await requestPasswordResetAction({}, form({ email: "test@example.com" }));
    expect(mocks.resetDeleteMany).toHaveBeenCalled();
    expect(mocks.resetCreate).toHaveBeenCalled();
    expect(consoleWarn).toHaveBeenCalled();

    mocks.sendPasswordResetEmail.mockResolvedValueOnce({ ok: true });
    await requestPasswordResetAction({}, form({ email: "test@example.com" }));
  });

  it("hides reset request processing exceptions", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.getUserByEmail.mockRejectedValueOnce(new Error("db"));
    await expect(requestPasswordResetAction({}, form({ email: "test@example.com" })))
      .resolves.toMatchObject({ success: expect.any(String) });
    expect(consoleError).toHaveBeenCalled();
  });

  it("validates reset forms and password confirmation", async () => {
    await expect(resetPasswordAction({}, form({}))).resolves.toMatchObject({ error: expect.any(String) });
    await expect(resetPasswordAction({}, form({
      token: "token",
      password: "new",
      confirmPassword: "different",
    }))).resolves.toMatchObject({ error: expect.any(String) });
  });

  it("rejects missing and expired reset tokens and deletes expired records", async () => {
    mocks.resetFindUnique.mockResolvedValueOnce(null);
    await expect(resetPasswordAction({}, form({ token: "token", password: "new", confirmPassword: "new" })))
      .resolves.toMatchObject({ error: expect.any(String) });
    mocks.resetFindUnique.mockResolvedValueOnce({
      userId: "user-1",
      email: "test@example.com",
      expiresAt: past,
    });
    await expect(resetPasswordAction({}, form({ token: "token", password: "new", confirmPassword: "new" })))
      .resolves.toMatchObject({ error: expect.any(String) });
    expect(mocks.resetDeleteMany).toHaveBeenCalledWith({ where: { tokenHash: "token-hash" } });
  });

  it("updates the password and invalidates every reset token", async () => {
    mocks.resetFindUnique.mockResolvedValue({
      userId: "user-1",
      email: "test@example.com",
      expiresAt: future,
    });
    await resetPasswordAction({}, form({ token: "token", password: "new", confirmPassword: "new" }));
    expect(mocks.userUpdate).toHaveBeenCalledWith(expect.objectContaining({
      data: { passwordHash: "hashed:new", mustChangePassword: false },
    }));
    expect(mocks.transaction).toHaveBeenCalled();
    expect(mocks.redirect).toHaveBeenCalledWith("/login?passwordReset=success");
  });
});
