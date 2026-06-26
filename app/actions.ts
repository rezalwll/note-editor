"use server";

import argon2 from "argon2";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";

import {
  clearSession,
  createSession,
  getUserByEmail,
  getUserByUsername,
  requireUser,
} from "@/lib/auth";
import {
  createPasswordResetTokenRecord,
  createSignupVerificationCodeRecord,
  getAuthHelpText,
  getTokenHash,
  getVerificationCodeHash,
  sendPasswordResetEmail,
  sendSignupVerificationCodeEmail,
} from "@/lib/email-auth";
import { getFriendlyDatabaseError } from "@/lib/errors";
import { parseTags } from "@/lib/notes";
import { prisma } from "@/lib/prisma";
import {
  clearAttempts,
  getRateLimitState,
  recordFailedAttempt,
} from "@/lib/rate-limit";
import {
  deleteTrashNotebooks,
  deleteTrashPage,
  emptyTrash,
  ensureTrashGroup,
  moveNotebookToTrash,
  movePageToTrash,
  restoreNotebooksToGroup,
  restorePageFromTrash,
  TRASH_GROUP_SYSTEM_KEY,
} from "@/lib/trash";
import { normalizeEmail, normalizeUsername } from "@/lib/users";

export type AuthActionState = {
  error?: string;
  success?: string;
  email?: string;
};

export type PasswordActionState = {
  error?: string;
  success?: string;
};

export type ProfileActionState = {
  error?: string;
  success?: string;
};

export type ForgotPasswordActionState = {
  error?: string;
  success?: string;
};

export type ResetPasswordActionState = {
  error?: string;
  success?: string;
};

const notebookSchema = z.object({
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().max(180).optional(),
});

const notebookGroupSchema = z.object({
  name: z.string().trim().min(1).max(80),
});

const notebookNameSchema = z.string().trim().min(1).max(80);
const defaultInlinePageTitle = "ØµÙØ­Ù‡ Ø¨Ø¯ÙˆÙ† Ø¹Ù†ÙˆØ§Ù†";

const pageSchema = z.object({
  notebookId: z.string().cuid(),
  title: z.string().trim().min(1).max(160),
});

const usernameSchema = z
  .string()
  .trim()
  .min(1)
  .max(120)
  .transform(normalizeUsername);
const normalizedEmailSchema = z
  .string()
  .trim()
  .email()
  .max(320)
  .transform(normalizeEmail);

const displayNameSchema = z.string().trim().min(1).max(80);
const passwordSchema = z.string().min(1).max(1024);
const verificationCodeSchema = z.string().trim().regex(/^\d{6}$/);
const pendingSignupStore = prisma as typeof prisma & {
  pendingSignup: any;
};

function getSafeRedirectTarget(value: FormDataEntryValue | null) {
  if (typeof value !== "string") {
    return "/";
  }

  if (!value.startsWith("/") || value.startsWith("//")) {
    return "/";
  }

  return value;
}

async function getOwnedNotebook(userId: string, id: string) {
  return prisma.notebook.findFirst({
    where: { id, userId },
    select: {
      id: true,
      userId: true,
      archived: true,
      groupId: true,
      systemKey: true,
      deletedAt: true,
    },
  });
}

async function getOwnedPage(userId: string, id: string) {
  return prisma.page.findFirst({
    where: { id, userId },
    select: { id: true, notebookId: true, archived: true },
  });
}

async function getOwnedGroup(userId: string, id: string) {
  return prisma.notebookGroup.findFirst({
    where: { id, userId },
    select: { id: true, name: true, systemKey: true },
  });
}

function isDuplicateUsernameError(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "P2002"
  );
}

function getDuplicateSignupMessage() {
  return "این نام کاربری یا ایمیل قبلا استفاده شده است.";
}

function getPasswordResetResponseMessage() {
  return `اگر حسابی با این ایمیل وجود داشته باشد، لینک بازیابی ارسال شد. ${getAuthHelpText()}`;
}

function getSignupHelpText() {
  return `کد تایید ارسال شد. ${getAuthHelpText()}`;
}

async function getActivePendingSignupByEmail(email: string) {
  const pendingSignup = await pendingSignupStore.pendingSignup.findUnique({
    where: { email },
  });

  if (!pendingSignup) {
    return null;
  }

  if (pendingSignup.expiresAt <= new Date()) {
    await pendingSignupStore.pendingSignup.delete({ where: { id: pendingSignup.id } });
    return null;
  }

  return pendingSignup;
}

async function getActivePendingSignupByUsername(username: string) {
  const pendingSignup = await pendingSignupStore.pendingSignup.findUnique({
    where: { username },
  });

  if (!pendingSignup) {
    return null;
  }

  if (pendingSignup.expiresAt <= new Date()) {
    await pendingSignupStore.pendingSignup.delete({ where: { id: pendingSignup.id } });
    return null;
  }

  return pendingSignup;
}

export async function loginAction(
  _prevState: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const parsed = z
    .object({
      username: usernameSchema,
      password: z.string().min(1),
      next: z.string().optional(),
    })
    .safeParse({
      username: formData.get("username"),
      password: formData.get("password"),
      next: formData.get("next") ?? undefined,
    });

  if (!parsed.success) {
    return { error: "نام کاربری و رمز عبور الزامی است." };
  }

  const headerList = await headers();
  const key =
    headerList.get("x-forwarded-for") ??
    headerList.get("x-real-ip") ??
    `local-user:${parsed.data.username}`;

  const rateLimit = getRateLimitState(key);

  if (rateLimit.blocked) {
    const retryMinutes = Math.ceil(rateLimit.retryAfterMs / 60000);
    return {
      error: `تعداد تلاش‌ها بیش از حد مجاز بوده است. ${retryMinutes} دقیقه‌ی دیگر دوباره تلاش کنید.`,
    };
  }

  let user;

  try {
    user = await getUserByUsername(parsed.data.username);
  } catch (error) {
    return {
      error:
        getFriendlyDatabaseError(error) ??
        "ورود انجام نشد چون پایگاه داده هنوز آماده نیست.",
    };
  }

  if (!user) {
    recordFailedAttempt(key);
    return { error: "نام کاربری یا رمز عبور نادرست است." };
  }

  const isValid = await argon2.verify(user.passwordHash, parsed.data.password);

  if (!isValid) {
    recordFailedAttempt(key);
    return { error: "نام کاربری یا رمز عبور نادرست است." };
  }

  clearAttempts(key);
  await createSession(user.id);
  redirect(getSafeRedirectTarget(formData.get("next")));
}

export async function signupAction(
  _prevState: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const parsed = z
    .object({
      username: usernameSchema,
      email: normalizedEmailSchema,
      displayName: displayNameSchema,
      password: passwordSchema,
      confirmPassword: z.string().min(1),
    })
    .safeParse({
      username: formData.get("username"),
      email: formData.get("email"),
      displayName: formData.get("displayName"),
      password: formData.get("password"),
      confirmPassword: formData.get("confirmPassword"),
    });

  if (!parsed.success) {
    return { error: "یک نام، نام کاربری، ایمیل و رمز عبور معتبر وارد کنید." };
  }

  if (parsed.data.password !== parsed.data.confirmPassword) {
    return { error: "تکرار رمز عبور با رمز اصلی یکسان نیست." };
  }

  try {
    await pendingSignupStore.pendingSignup.deleteMany({
      where: {
        expiresAt: { lte: new Date() },
        OR: [{ email: parsed.data.email }, { username: parsed.data.username }],
      },
    });

    const [existingUserByEmail, existingUserByUsername] = await Promise.all([
      getUserByEmail(parsed.data.email),
      getUserByUsername(parsed.data.username),
    ]);

    if (existingUserByEmail || existingUserByUsername) {
      return { error: getDuplicateSignupMessage() };
    }

    const [existingPendingByEmail, existingPendingByUsername] = await Promise.all([
      getActivePendingSignupByEmail(parsed.data.email),
      getActivePendingSignupByUsername(parsed.data.username),
    ]);

    if (
      existingPendingByUsername &&
      existingPendingByUsername.email !== parsed.data.email
    ) {
      return { error: getDuplicateSignupMessage() };
    }

    const code = createSignupVerificationCodeRecord();
    const passwordHash = await argon2.hash(parsed.data.password);

    await pendingSignupStore.pendingSignup.upsert({
      where: { email: parsed.data.email },
      update: {
        username: parsed.data.username,
        displayName: parsed.data.displayName,
        passwordHash,
        verificationCodeHash: code.codeHash,
        expiresAt: code.expiresAt,
        lastSentAt: new Date(),
        resendCount: existingPendingByEmail ? existingPendingByEmail.resendCount + 1 : 0,
      },
      create: {
        email: parsed.data.email,
        username: parsed.data.username,
        displayName: parsed.data.displayName,
        passwordHash,
        verificationCodeHash: code.codeHash,
        expiresAt: code.expiresAt,
        lastSentAt: new Date(),
      },
    });

    const emailResult = await sendSignupVerificationCodeEmail({
      email: parsed.data.email,
      displayName: parsed.data.displayName,
      code: code.rawCode,
    });

    if (!emailResult.ok) {
      return { error: `${emailResult.message}. ${getAuthHelpText()}` };
    }
  } catch (error) {
    if (isDuplicateUsernameError(error)) {
      return { error: getDuplicateSignupMessage() };
    }

    return {
      error:
        getFriendlyDatabaseError(error) ??
        "در حال حاضر ساخت حساب ممکن نیست.",
    };
  }

  redirect(`/signup/verify?email=${encodeURIComponent(parsed.data.email)}`);
}

export async function completeSignupVerificationAction(
  _prevState: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const parsed = z
    .object({
      email: normalizedEmailSchema,
      code: verificationCodeSchema,
    })
    .safeParse({
      email: formData.get("email"),
      code: formData.get("code"),
    });

  if (!parsed.success) {
    return { error: "کد تایید ۶ رقمی را درست وارد کنید." };
  }

  const pendingSignup = await getActivePendingSignupByEmail(parsed.data.email);

  if (!pendingSignup) {
    return {
      error: "درخواست ثبت‌نام منقضی شده است. دوباره ثبت‌نام را شروع کنید.",
    };
  }

  if (
    getVerificationCodeHash(parsed.data.code) !==
    pendingSignup.verificationCodeHash
  ) {
    return {
      error: "کد واردشده درست نیست. دوباره بررسی کنید.",
      email: parsed.data.email,
    };
  }

  try {
    const existingUser = await prisma.user.findFirst({
      where: {
        OR: [
          { email: pendingSignup.email },
          { username: pendingSignup.username },
        ],
      },
      select: { id: true },
    });

    if (existingUser) {
      await pendingSignupStore.pendingSignup.delete({ where: { id: pendingSignup.id } });
      return { error: getDuplicateSignupMessage() };
    }

    const user = await prisma.$transaction(async (tx) => {
      const txWithPendingSignup = tx as typeof tx & { pendingSignup: any };
      const createdUser = await tx.user.create({
        data: {
          username: pendingSignup.username,
          email: pendingSignup.email,
          emailVerifiedAt: new Date(),
          displayName: pendingSignup.displayName,
          passwordHash: pendingSignup.passwordHash,
          mustChangePassword: false,
        },
      });

      await txWithPendingSignup.pendingSignup.delete({
        where: { id: pendingSignup.id },
      });

      return createdUser;
    });

    await createSession(user.id);
  } catch (error) {
    if (isDuplicateUsernameError(error)) {
      return { error: getDuplicateSignupMessage() };
    }

    return {
      error:
        getFriendlyDatabaseError(error) ??
        "تکمیل ثبت‌نام در حال حاضر ممکن نیست.",
      email: parsed.data.email,
    };
  }

  redirect("/");
}

export async function resendSignupVerificationCodeAction(
  _prevState: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const parsed = z
    .object({
      email: normalizedEmailSchema,
    })
    .safeParse({
      email: formData.get("email"),
    });

  if (!parsed.success) {
    return { error: "ایمیل معتبر وارد کنید." };
  }

  const rateLimitKey = `signup-code:${parsed.data.email}`;
  const rateLimit = getRateLimitState(rateLimitKey);

  if (rateLimit.blocked) {
    return {
      error: `برای ارسال دوباره کمی صبر کنید. ${getAuthHelpText()}`,
      email: parsed.data.email,
    };
  }

  const pendingSignup = await getActivePendingSignupByEmail(parsed.data.email);

  if (!pendingSignup) {
    return {
      error: "درخواست ثبت‌نام منقضی شده است. دوباره ثبت‌نام را شروع کنید.",
    };
  }

  try {
    const code = createSignupVerificationCodeRecord();

    await pendingSignupStore.pendingSignup.update({
      where: { id: pendingSignup.id },
      data: {
        verificationCodeHash: code.codeHash,
        expiresAt: code.expiresAt,
        lastSentAt: new Date(),
        resendCount: {
          increment: 1,
        },
      },
    });

    const emailResult = await sendSignupVerificationCodeEmail({
      email: pendingSignup.email,
      displayName: pendingSignup.displayName,
      code: code.rawCode,
    });

    recordFailedAttempt(rateLimitKey);

    if (!emailResult.ok) {
      return {
        error: `${emailResult.message}. ${getAuthHelpText()}`,
        email: parsed.data.email,
      };
    }
  } catch (error) {
    console.error("Failed to resend signup verification code", error);
    return {
      error: `ارسال کد تایید ناموفق بود. ${getAuthHelpText()}`,
      email: parsed.data.email,
    };
  }

  return {
    success: getSignupHelpText(),
    email: parsed.data.email,
  };
}

export async function logoutAction() {
  await clearSession();
  redirect("/login");
}

export async function updateProfileAction(
  _prevState: ProfileActionState,
  formData: FormData,
): Promise<ProfileActionState> {
  const user = await requireUser();
  const parsed = z
    .object({
      username: usernameSchema,
      email: normalizedEmailSchema,
      displayName: displayNameSchema,
    })
    .safeParse({
      username: formData.get("username"),
      email: formData.get("email"),
      displayName: formData.get("displayName"),
    });

  if (!parsed.success) {
    return { error: "نام نمایشی، نام کاربری و ایمیل معتبر وارد کنید." };
  }

  try {
    await prisma.user.update({
      where: { id: user.id },
      data: {
        username: parsed.data.username,
        email: parsed.data.email,
        displayName: parsed.data.displayName,
      },
    });
  } catch (error) {
    if (isDuplicateUsernameError(error)) {
      return { error: getDuplicateSignupMessage() };
    }

    return {
      error:
        getFriendlyDatabaseError(error) ??
        "در حال حاضر به‌روزرسانی پروفایل ممکن نیست.",
    };
  }

  revalidatePath("/");
  revalidatePath("/settings");
  return { success: "پروفایل با موفقیت به‌روزرسانی شد." };
}

export async function changePasswordAction(
  _prevState: PasswordActionState,
  formData: FormData,
): Promise<PasswordActionState> {
  const user = await requireUser();

  const parsed = z
    .object({
      currentPassword: z.string().min(1),
      newPassword: passwordSchema,
    })
    .safeParse({
      currentPassword: formData.get("currentPassword"),
      newPassword: formData.get("newPassword"),
    });

  if (!parsed.success) {
    return { error: "یک رمز عبور جدید وارد کنید." };
  }

  const matches = await argon2.verify(
    user.passwordHash,
    parsed.data.currentPassword,
  );

  if (!matches) {
    return { error: "رمز عبور فعلی نادرست است." };
  }

  await prisma.user.update({
    where: { id: user.id },
    data: {
      passwordHash: await argon2.hash(parsed.data.newPassword),
      mustChangePassword: false,
    },
  });

  revalidatePath("/settings");
  revalidatePath("/settings/security");
  return { success: "رمز عبور با موفقیت تغییر کرد." };
}

export async function requestPasswordResetAction(
  _prevState: ForgotPasswordActionState,
  formData: FormData,
): Promise<ForgotPasswordActionState> {
  const parsed = z
    .object({
      email: normalizedEmailSchema,
    })
    .safeParse({
      email: formData.get("email"),
    });

  if (!parsed.success) {
    return { error: "یک ایمیل معتبر وارد کنید." };
  }

  const headerList = await headers();
  const rateLimitKey =
    headerList.get("x-forwarded-for") ??
    headerList.get("x-real-ip") ??
    `password-reset:${parsed.data.email}`;
  const rateLimit = getRateLimitState(`password-reset:${rateLimitKey}`);

  if (rateLimit.blocked) {
    return {
      success: getPasswordResetResponseMessage(),
    };
  }

  try {
    const user = await getUserByEmail(parsed.data.email);

    if (user?.email) {
      const token = createPasswordResetTokenRecord();

      await prisma.passwordResetToken.deleteMany({
        where: {
          OR: [{ userId: user.id }, { email: parsed.data.email }],
        },
      });

      await prisma.passwordResetToken.create({
        data: {
          userId: user.id,
          email: parsed.data.email,
          tokenHash: token.tokenHash,
          expiresAt: token.expiresAt,
        },
      });

      const emailResult = await sendPasswordResetEmail({
        email: parsed.data.email,
        displayName: user.displayName,
        token: token.rawToken,
      });

      if (!emailResult.ok) {
        console.warn("Password reset email skipped", {
          userId: user.id,
          email: parsed.data.email,
          reason: emailResult.message,
        });
      }
    }
  } catch (error) {
    console.error("Failed to request password reset", error);
  }

  recordFailedAttempt(`password-reset:${rateLimitKey}`);

  return {
    success: getPasswordResetResponseMessage(),
  };
}

export async function resetPasswordAction(
  _prevState: ResetPasswordActionState,
  formData: FormData,
): Promise<ResetPasswordActionState> {
  const parsed = z
    .object({
      token: z.string().min(1),
      password: passwordSchema,
      confirmPassword: z.string().min(1),
    })
    .safeParse({
      token: formData.get("token"),
      password: formData.get("password"),
      confirmPassword: formData.get("confirmPassword"),
    });

  if (!parsed.success) {
    return { error: "اطلاعات بازیابی رمز عبور کامل نیست." };
  }

  if (parsed.data.password !== parsed.data.confirmPassword) {
    return { error: "تکرار رمز عبور با رمز اصلی یکسان نیست." };
  }

  const tokenHash = getTokenHash(parsed.data.token);
  const resetToken = await prisma.passwordResetToken.findUnique({
    where: { tokenHash },
    include: { user: true },
  });

  if (!resetToken || resetToken.expiresAt <= new Date()) {
    if (resetToken) {
      await prisma.passwordResetToken.deleteMany({
        where: { tokenHash },
      });
    }

    return {
      error: "لینک بازیابی نامعتبر یا منقضی شده است. دوباره درخواست بدهید.",
    };
  }

  await prisma.$transaction([
    prisma.user.update({
      where: { id: resetToken.userId },
      data: {
        passwordHash: await argon2.hash(parsed.data.password),
        mustChangePassword: false,
      },
    }),
    prisma.passwordResetToken.deleteMany({
      where: {
        OR: [{ userId: resetToken.userId }, { email: resetToken.email }],
      },
    }),
  ]);

  redirect("/login?passwordReset=success");
}

export async function createNotebookAction(formData: FormData) {
  const user = await requireUser();
  const groupId = z.string().cuid().safeParse(formData.get("groupId"));

  const parsed = notebookSchema.safeParse({
    name: formData.get("name"),
    description: formData.get("description") || undefined,
  });

  if (!parsed.success || !groupId.success) {
    return;
  }

  const group = await getOwnedGroup(user.id, groupId.data);

  if (!group || group.systemKey === TRASH_GROUP_SYSTEM_KEY) {
    return;
  }

  await prisma.notebook.create({
    data: {
      ...parsed.data,
      userId: user.id,
      groupId: groupId.data,
    },
  });

  revalidatePath("/");
}

export async function createNotebookInlineAction(
  name: string,
  groupId: string,
) {
  const user = await requireUser();
  const parsedName = notebookNameSchema.safeParse(name);
  const parsedGroupId = z.string().cuid().safeParse(groupId);

  if (!parsedName.success || !parsedGroupId.success) {
    return { error: "Ù†Ø§Ù… Ø²ÛŒØ± Ù…Ø¬Ù…ÙˆØ¹Ù‡ Ù…Ø¹ØªØ¨Ø± Ù†ÛŒØ³Øª." };
  }

  {
    const group = await getOwnedGroup(user.id, parsedGroupId.data);

    if (!group || group.systemKey === TRASH_GROUP_SYSTEM_KEY) {
      return { error: "Ù…Ø¬Ù…ÙˆØ¹Ù‡ Ù…Ø¹ØªØ¨Ø± Ù†ÛŒØ³Øª." };
    }
  }

  const { notebook, page } = await prisma.$transaction(async (tx) => {
    const notebook = await tx.notebook.create({
      data: {
        userId: user.id,
        name: parsedName.data,
        description: undefined,
        groupId: parsedGroupId.data,
      },
    });

    const page = await tx.page.create({
      data: {
        userId: user.id,
        notebookId: notebook.id,
        title: defaultInlinePageTitle,
        bodyHtml: "<p></p>",
        bodyText: "",
      },
    });

    return { notebook, page };
  });

  revalidatePath("/");
  revalidatePath(`/notebooks/${notebook.id}`);
  revalidatePath(`/pages/${page.id}`);
  return { id: notebook.id, pageId: page.id };
}

export async function createNotebookGroupInlineAction(name: string) {
  const user = await requireUser();

  const parsed = notebookGroupSchema.safeParse({ name });

  if (!parsed.success) {
    return { error: "Ù†Ø§Ù… Ù…Ø¬Ù…ÙˆØ¹Ù‡ Ø§Ù„Ø²Ø§Ù…ÛŒ Ø§Ø³Øª." };
  }

  const { group, notebook, page } = await prisma.$transaction(async (tx) => {
    const group = await tx.notebookGroup.create({
      data: {
        userId: user.id,
        name: parsed.data.name,
      },
    });

    const notebook = await tx.notebook.create({
      data: {
        userId: user.id,
        name: "Ø²ÛŒØ± Ù…Ø¬Ù…ÙˆØ¹Ù‡ Ø¨Ø¯ÙˆÙ† Ø¹Ù†ÙˆØ§Ù†",
        description: undefined,
        groupId: group.id,
      },
    });

    const page = await tx.page.create({
      data: {
        userId: user.id,
        notebookId: notebook.id,
        title: defaultInlinePageTitle,
        bodyHtml: "<p></p>",
        bodyText: "",
      },
    });

    return { group, notebook, page };
  });

  revalidatePath("/");
  revalidatePath(`/notebooks/${notebook.id}`);
  revalidatePath(`/pages/${page.id}`);
  return { id: group.id, notebookId: notebook.id, pageId: page.id };
}

export async function renameNotebookGroupInlineAction(id: string, name: string) {
  const user = await requireUser();

  const groupId = z.string().cuid().safeParse(id);
  const groupName = z.string().trim().max(80).safeParse(name);

  if (!groupId.success || !groupName.success) {
    return { error: "Ù†Ø§Ù… Ù…Ø¬Ù…ÙˆØ¹Ù‡ Ù…Ø¹ØªØ¨Ø± Ù†ÛŒØ³Øª." };
  }

  const group = await getOwnedGroup(user.id, groupId.data);

  if (!group || group.systemKey === TRASH_GROUP_SYSTEM_KEY) {
    return { error: "Ù…Ø¬Ù…ÙˆØ¹Ù‡ Ù¾ÛŒØ¯Ø§ Ù†Ø´Ø¯." };
  }

  await prisma.notebookGroup.update({
    where: { id: group.id },
    data: { name: groupName.data || "Ù…Ø¬Ù…ÙˆØ¹Ù‡ Ø¨Ø¯ÙˆÙ† Ø¹Ù†ÙˆØ§Ù†" },
  });

  revalidatePath("/");
  return { success: true };
}

export async function deleteNotebookGroupInlineAction(id: string) {
  const user = await requireUser();

  const groupId = z.string().cuid().safeParse(id);

  if (!groupId.success) {
    return { error: "Ù…Ø¬Ù…ÙˆØ¹Ù‡ Ù…Ø¹ØªØ¨Ø± Ù†ÛŒØ³Øª." };
  }

  const group = await getOwnedGroup(user.id, groupId.data);

  if (!group || group.systemKey === TRASH_GROUP_SYSTEM_KEY) {
    return { error: "Ù…Ø¬Ù…ÙˆØ¹Ù‡ Ù¾ÛŒØ¯Ø§ Ù†Ø´Ø¯." };
  }

  const trashGroup = await ensureTrashGroup(user.id);
  const deletedAt = new Date();
  const notebooksInGroup = await prisma.notebook.findMany({
    where: { groupId: group.id, userId: user.id },
    select: { id: true },
  });

  const notebookIds = notebooksInGroup.map((notebook) => notebook.id);

  await prisma.$transaction([
    prisma.notebook.updateMany({
      where: { id: { in: notebookIds }, userId: user.id },
      data: {
        groupId: trashGroup.id,
        deletedAt,
      },
    }),
    prisma.page.updateMany({
      where: {
        notebookId: { in: notebookIds },
        userId: user.id,
      },
      data: {
        deletedAt,
      },
    }),
    prisma.notebookGroup.delete({
      where: { id: group.id },
    }),
    ...(notebookIds.length === 0
      ? [
          prisma.notebook.create({
            data: {
              userId: user.id,
              groupId: trashGroup.id,
              name: group.name || "Ù…Ø¬Ù…ÙˆØ¹Ù‡ Ø¨Ø¯ÙˆÙ† Ø¹Ù†ÙˆØ§Ù†",
              deletedAt,
            },
          }),
        ]
      : []),
  ]);

  revalidatePath("/");
  return { success: true, trashGroupId: trashGroup.id };
}

export async function assignNotebookGroupInlineAction(
  notebookIds: string[],
  groupId: string,
) {
  const user = await requireUser();

  const parsedNotebookIds = z.array(z.string().cuid()).safeParse(notebookIds);
  const parsedGroupId = z.string().cuid().safeParse(groupId);

  if (!parsedNotebookIds.success || !parsedGroupId.success) {
    return { error: "Ø§Ù†ØªØ®Ø§Ø¨ Ù…Ø¬Ù…ÙˆØ¹Ù‡ Ù…Ø¹ØªØ¨Ø± Ù†ÛŒØ³Øª." };
  }

  const notebooks = await prisma.notebook.findMany({
    where: { userId: user.id, id: { in: parsedNotebookIds.data } },
    select: { id: true, systemKey: true },
  });

  if (
    notebooks.length !== parsedNotebookIds.data.length ||
    notebooks.some((notebook) => notebook.systemKey)
  ) {
    return { error: "Ø²ÛŒØ± Ù…Ø¬Ù…ÙˆØ¹Ù‡ Ù…Ø¹ØªØ¨Ø± Ù†ÛŒØ³Øª." };
  }

  {
    const group = await getOwnedGroup(user.id, parsedGroupId.data);

    if (!group || group.systemKey === TRASH_GROUP_SYSTEM_KEY) {
      return { error: "Ù…Ø¬Ù…ÙˆØ¹Ù‡ Ù¾ÛŒØ¯Ø§ Ù†Ø´Ø¯." };
    }
  }

  await restoreNotebooksToGroup(
    user.id,
    parsedNotebookIds.data,
    parsedGroupId.data,
  );

  revalidatePath("/");
  return { success: true };
}

export async function renameNotebookInlineAction(id: string, name: string) {
  const user = await requireUser();

  const notebookId = z.string().cuid().safeParse(id);
  const notebookName = notebookNameSchema.safeParse(name);

  if (!notebookId.success || !notebookName.success) {
    return { error: "Ù†Ø§Ù… Ø²ÛŒØ± Ù…Ø¬Ù…ÙˆØ¹Ù‡ Ù…Ø¹ØªØ¨Ø± Ù†ÛŒØ³Øª." };
  }

  const notebook = await getOwnedNotebook(user.id, notebookId.data);

  if (!notebook || notebook.systemKey) {
    return { error: "Ø²ÛŒØ± Ù…Ø¬Ù…ÙˆØ¹Ù‡ Ù¾ÛŒØ¯Ø§ Ù†Ø´Ø¯." };
  }

  await prisma.notebook.update({
    where: { id: notebook.id },
    data: { name: notebookName.data },
  });

  revalidatePath("/");
  revalidatePath(`/notebooks/${notebookId.data}`);
  return { success: true };
}

export async function updateNotebookAction(formData: FormData) {
  const user = await requireUser();

  const id = z.string().cuid().safeParse(formData.get("id"));
  const parsed = notebookSchema.safeParse({
    name: formData.get("name"),
    description: formData.get("description") || undefined,
  });

  if (!id.success || !parsed.success) {
    return;
  }

  const notebook = await getOwnedNotebook(user.id, id.data);

  if (!notebook || notebook.systemKey) {
    return;
  }

  await prisma.notebook.update({
    where: { id: notebook.id },
    data: parsed.data,
  });

  revalidatePath("/");
  revalidatePath(`/notebooks/${id.data}`);
}

export async function archiveNotebookAction(formData: FormData) {
  const user = await requireUser();
  const id = z.string().cuid().safeParse(formData.get("id"));

  if (!id.success) {
    return;
  }

  const notebook = await getOwnedNotebook(user.id, id.data);

  if (!notebook || notebook.systemKey || notebook.deletedAt) {
    return;
  }

  await moveNotebookToTrash(user.id, notebook.id);

  revalidatePath("/");
  redirect("/");
}

export async function archiveNotebookInlineAction(id: string) {
  const user = await requireUser();
  const notebookId = z.string().cuid().safeParse(id);

  if (!notebookId.success) {
    return { error: "Ø²ÛŒØ± Ù…Ø¬Ù…ÙˆØ¹Ù‡ Ù…Ø¹ØªØ¨Ø± Ù†ÛŒØ³Øª." };
  }

  const notebook = await getOwnedNotebook(user.id, notebookId.data);

  if (!notebook || notebook.systemKey || notebook.deletedAt) {
    return { error: "Ø²ÛŒØ± Ù…Ø¬Ù…ÙˆØ¹Ù‡ Ù¾ÛŒØ¯Ø§ Ù†Ø´Ø¯." };
  }

  const trashGroupId = await moveNotebookToTrash(user.id, notebook.id);

  revalidatePath("/");
  return { success: true, trashGroupId };
}

export async function deleteNotebookPermanentlyInlineAction(id: string) {
  const user = await requireUser();
  const notebookId = z.string().cuid().safeParse(id);

  if (!notebookId.success) {
    return { error: "Ø²ÛŒØ± Ù…Ø¬Ù…ÙˆØ¹Ù‡ Ù…Ø¹ØªØ¨Ø± Ù†ÛŒØ³Øª." };
  }

  const deletedCount = await deleteTrashNotebooks(user.id, [notebookId.data]);
  if (deletedCount === 0) {
    return { error: "Ø²ÛŒØ± Ù…Ø¬Ù…ÙˆØ¹Ù‡ Ø­Ø°Ùâ€ŒØ´Ø¯Ù‡ Ù¾ÛŒØ¯Ø§ Ù†Ø´Ø¯." };
  }

  revalidatePath("/");
  return { success: true };
}

export async function createPageAction(formData: FormData) {
  const user = await requireUser();

  const parsed = pageSchema.safeParse({
    notebookId: formData.get("notebookId"),
    title: formData.get("title"),
  });

  if (!parsed.success) {
    return;
  }

  const notebook = await getOwnedNotebook(user.id, parsed.data.notebookId);

  if (!notebook || notebook.archived || notebook.deletedAt) {
    return;
  }

  const page = await prisma.page.create({
    data: {
      userId: user.id,
      notebookId: parsed.data.notebookId,
      title: parsed.data.title,
      bodyHtml: "<p></p>",
      bodyText: "",
    },
  });

  revalidatePath(`/notebooks/${parsed.data.notebookId}`);
  redirect(`/pages/${page.id}`);
}

export async function createPageInlineAction(notebookId: string, title: string) {
  const user = await requireUser();

  const parsed = pageSchema.safeParse({
    notebookId,
    title,
  });

  if (!parsed.success) {
    return { error: "Ø¹Ù†ÙˆØ§Ù† ØµÙØ­Ù‡ Ø§Ù„Ø²Ø§Ù…ÛŒ Ø§Ø³Øª." };
  }

  const notebook = await getOwnedNotebook(user.id, parsed.data.notebookId);

  if (!notebook || notebook.archived || notebook.deletedAt) {
    return { error: "Ø²ÛŒØ± Ù…Ø¬Ù…ÙˆØ¹Ù‡ Ù¾ÛŒØ¯Ø§ Ù†Ø´Ø¯." };
  }

  const page = await prisma.page.create({
    data: {
      userId: user.id,
      notebookId: parsed.data.notebookId,
      title: parsed.data.title,
      bodyHtml: "<p></p>",
      bodyText: "",
    },
  });

  revalidatePath(`/notebooks/${parsed.data.notebookId}`);
  revalidatePath("/");
  return { id: page.id };
}

export async function archivePageAction(formData: FormData) {
  const user = await requireUser();
  const pageId = z.string().cuid().safeParse(formData.get("pageId"));

  if (!pageId.success) {
    return;
  }

  const result = await movePageToTrash(user.id, pageId.data);
  if (!result) {
    return;
  }

  revalidatePath(`/notebooks/${result.notebookId}`);
  revalidatePath("/");
  redirect(`/notebooks/${result.notebookId}`);
}

export async function archivePageInlineAction(pageId: string) {
  const user = await requireUser();
  const parsedPageId = z.string().cuid().safeParse(pageId);

  if (!parsedPageId.success) {
    return { error: "ØµÙØ­Ù‡ Ù…Ø¹ØªØ¨Ø± Ù†ÛŒØ³Øª." };
  }

  const result = await movePageToTrash(user.id, parsedPageId.data);
  if (!result) {
    return { error: "ØµÙØ­Ù‡ Ù¾ÛŒØ¯Ø§ Ù†Ø´Ø¯." };
  }

  revalidatePath(`/notebooks/${result.notebookId}`);
  revalidatePath(`/pages/${parsedPageId.data}`);
  revalidatePath("/");
  return {
    success: true,
    notebookId: result.notebookId,
    trashNotebookId: result.trashNotebookId,
  };
}

export async function restorePageInlineAction(pageId: string) {
  const user = await requireUser();
  const parsedPageId = z.string().cuid().safeParse(pageId);

  if (!parsedPageId.success) {
    return { error: "ØµÙØ­Ù‡ Ù…Ø¹ØªØ¨Ø± Ù†ÛŒØ³Øª." };
  }

  const result = await restorePageFromTrash(user.id, parsedPageId.data);
  if (!result) {
    return { error: "Ø²ÛŒØ± Ù…Ø¬Ù…ÙˆØ¹Ù‡ Ø§ØµÙ„ÛŒ ØµÙØ­Ù‡ Ù¾ÛŒØ¯Ø§ Ù†Ø´Ø¯." };
  }

  revalidatePath(`/notebooks/${result.notebookId}`);
  revalidatePath(`/pages/${parsedPageId.data}`);
  revalidatePath("/");
  return { success: true, notebookId: result.notebookId };
}

export async function deletePagePermanentlyInlineAction(pageId: string) {
  const user = await requireUser();
  const parsedPageId = z.string().cuid().safeParse(pageId);

  if (!parsedPageId.success) {
    return { error: "ØµÙØ­Ù‡ Ù…Ø¹ØªØ¨Ø± Ù†ÛŒØ³Øª." };
  }

  const deleted = await deleteTrashPage(user.id, parsedPageId.data);
  if (!deleted) {
    return { error: "ØµÙØ­Ù‡ Ø­Ø°Ùâ€ŒØ´Ø¯Ù‡ Ù¾ÛŒØ¯Ø§ Ù†Ø´Ø¯." };
  }

  revalidatePath("/");
  return { success: true };
}

export async function updateTagsAction(formData: FormData) {
  const user = await requireUser();
  const pageId = z.string().cuid().safeParse(formData.get("pageId"));
  const tagsInput = z.string().safeParse(formData.get("tags"));

  if (!pageId.success || !tagsInput.success) {
    return;
  }

  const page = await getOwnedPage(user.id, pageId.data);

  if (!page) {
    return;
  }

  const tags = parseTags(tagsInput.data);

  await prisma.page.update({
    where: { id: page.id },
    data: {
      tags: {
        deleteMany: {},
        createMany: {
          data: tags.map((value) => ({ value })),
        },
      },
    },
  });

  revalidatePath(`/pages/${pageId.data}`);
}

export async function emptyTrashInlineAction() {
  const user = await requireUser();
  const deletedCount = await emptyTrash(user.id);
  revalidatePath("/");
  return { success: true, deletedCount };
}
