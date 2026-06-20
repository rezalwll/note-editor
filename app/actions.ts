"use server";

import argon2 from "argon2";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";

import {
  clearSession,
  createSession,
  getUserByUsername,
  requireUser,
} from "@/lib/auth";
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
  purgeExpiredTrash,
  restoreNotebooksToGroup,
  restorePageFromTrash,
  TRASH_GROUP_SYSTEM_KEY,
} from "@/lib/trash";
import { normalizeUsername } from "@/lib/users";

export type AuthActionState = {
  error?: string;
};

export type PasswordActionState = {
  error?: string;
  success?: string;
};

export type ProfileActionState = {
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

const displayNameSchema = z.string().trim().min(1).max(80);

const passwordSchema = z.string().min(1).max(1024);

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
    select: { id: true, systemKey: true },
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
      displayName: displayNameSchema,
      password: passwordSchema,
      confirmPassword: z.string().min(1),
    })
    .safeParse({
      username: formData.get("username"),
      displayName: formData.get("displayName"),
      password: formData.get("password"),
      confirmPassword: formData.get("confirmPassword"),
    });

  if (!parsed.success) {
    return { error: "یک نام، نام کاربری و رمز عبور معتبر وارد کنید." };
  }

  if (parsed.data.password !== parsed.data.confirmPassword) {
    return { error: "تکرار رمز عبور با رمز اصلی یکسان نیست." };
  }

  try {
    const user = await prisma.user.create({
      data: {
        username: parsed.data.username,
        displayName: parsed.data.displayName,
        passwordHash: await argon2.hash(parsed.data.password),
        mustChangePassword: false,
      },
    });

    await createSession(user.id);
  } catch (error) {
    if (isDuplicateUsernameError(error)) {
      return { error: "این نام کاربری قبلاً استفاده شده است." };
    }

    return {
      error:
        getFriendlyDatabaseError(error) ??
        "در حال حاضر ساخت حساب ممکن نیست.",
    };
  }

  redirect("/");
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
      displayName: displayNameSchema,
    })
    .safeParse({
      username: formData.get("username"),
      displayName: formData.get("displayName"),
    });

  if (!parsed.success) {
    return { error: "نام نمایشی و نام کاربری معتبر وارد کنید." };
  }

  try {
    await prisma.user.update({
      where: { id: user.id },
      data: {
        username: parsed.data.username,
        displayName: parsed.data.displayName,
      },
    });
  } catch (error) {
    if (isDuplicateUsernameError(error)) {
      return { error: "این نام کاربری قبلاً استفاده شده است." };
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

export async function createNotebookAction(formData: FormData) {
  const user = await requireUser();

  const parsed = notebookSchema.safeParse({
    name: formData.get("name"),
    description: formData.get("description") || undefined,
  });

  if (!parsed.success) {
    return;
  }

  await prisma.notebook.create({
    data: {
      ...parsed.data,
      userId: user.id,
    },
  });

  revalidatePath("/");
}

export async function createNotebookInlineAction(
  name: string,
  groupId?: string | null,
) {
  const user = await requireUser();
  await purgeExpiredTrash(user.id);
  const parsedName = notebookNameSchema.safeParse(name);

  if (!parsedName.success) {
    return { error: "نام دفتر معتبر نیست." };
  }

  if (groupId) {
    const group = await getOwnedGroup(user.id, groupId);

    if (!group || group.systemKey === TRASH_GROUP_SYSTEM_KEY) {
      return { error: "دسته معتبر نیست." };
    }
  }

  const notebook = await prisma.notebook.create({
    data: {
      userId: user.id,
      name: parsedName.data,
      description: undefined,
      groupId: groupId ?? null,
    },
  });

  revalidatePath("/");
  return { id: notebook.id };
}

export async function createNotebookGroupInlineAction(name: string) {
  const user = await requireUser();
  await purgeExpiredTrash(user.id);

  const parsed = notebookGroupSchema.safeParse({ name });

  if (!parsed.success) {
    return { error: "نام دسته الزامی است." };
  }

  const group = await prisma.notebookGroup.create({
    data: {
      userId: user.id,
      name: parsed.data.name,
    },
  });

  revalidatePath("/");
  return { id: group.id };
}

export async function renameNotebookGroupInlineAction(id: string, name: string) {
  const user = await requireUser();
  await purgeExpiredTrash(user.id);

  const groupId = z.string().cuid().safeParse(id);
  const groupName = z.string().trim().max(80).safeParse(name);

  if (!groupId.success || !groupName.success) {
    return { error: "نام دسته معتبر نیست." };
  }

  const group = await getOwnedGroup(user.id, groupId.data);

  if (!group || group.systemKey === TRASH_GROUP_SYSTEM_KEY) {
    return { error: "دسته پیدا نشد." };
  }

  await prisma.notebookGroup.update({
    where: { id: group.id },
    data: { name: groupName.data || "دسته بدون عنوان" },
  });

  revalidatePath("/");
  return { success: true };
}

export async function deleteNotebookGroupInlineAction(id: string) {
  const user = await requireUser();
  await purgeExpiredTrash(user.id);

  const groupId = z.string().cuid().safeParse(id);

  if (!groupId.success) {
    return { error: "دسته معتبر نیست." };
  }

  const group = await getOwnedGroup(user.id, groupId.data);

  if (!group || group.systemKey === TRASH_GROUP_SYSTEM_KEY) {
    return { error: "دسته پیدا نشد." };
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
  ]);

  revalidatePath("/");
  return { success: true, trashGroupId: trashGroup.id };
}

export async function assignNotebookGroupInlineAction(
  notebookIds: string[],
  groupId: string | null,
) {
  const user = await requireUser();
  await purgeExpiredTrash(user.id);

  const parsedNotebookIds = z.array(z.string().cuid()).safeParse(notebookIds);
  const parsedGroupId =
    groupId === null
      ? { success: true, data: null }
      : z.string().cuid().safeParse(groupId);

  if (!parsedNotebookIds.success || !parsedGroupId.success) {
    return { error: "انتخاب دسته معتبر نیست." };
  }

  const notebooks = await prisma.notebook.findMany({
    where: { userId: user.id, id: { in: parsedNotebookIds.data } },
    select: { id: true, systemKey: true },
  });

  if (
    notebooks.length !== parsedNotebookIds.data.length ||
    notebooks.some((notebook) => notebook.systemKey)
  ) {
    return { error: "دفتر معتبر نیست." };
  }

  if (parsedGroupId.data) {
    const group = await getOwnedGroup(user.id, parsedGroupId.data);

    if (!group || group.systemKey === TRASH_GROUP_SYSTEM_KEY) {
      return { error: "دسته پیدا نشد." };
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
  await purgeExpiredTrash(user.id);

  const notebookId = z.string().cuid().safeParse(id);
  const notebookName = notebookNameSchema.safeParse(name);

  if (!notebookId.success || !notebookName.success) {
    return { error: "نام دفتر معتبر نیست." };
  }

  const notebook = await getOwnedNotebook(user.id, notebookId.data);

  if (!notebook || notebook.systemKey) {
    return { error: "دفتر پیدا نشد." };
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
  await purgeExpiredTrash(user.id);

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
  await purgeExpiredTrash(user.id);
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
  await purgeExpiredTrash(user.id);
  const notebookId = z.string().cuid().safeParse(id);

  if (!notebookId.success) {
    return { error: "دفتر معتبر نیست." };
  }

  const notebook = await getOwnedNotebook(user.id, notebookId.data);

  if (!notebook || notebook.systemKey || notebook.deletedAt) {
    return { error: "دفتر پیدا نشد." };
  }

  const trashGroupId = await moveNotebookToTrash(user.id, notebook.id);

  revalidatePath("/");
  return { success: true, trashGroupId };
}

export async function deleteNotebookPermanentlyInlineAction(id: string) {
  const user = await requireUser();
  const notebookId = z.string().cuid().safeParse(id);

  if (!notebookId.success) {
    return { error: "دفتر معتبر نیست." };
  }

  const deletedCount = await deleteTrashNotebooks(user.id, [notebookId.data]);
  if (deletedCount === 0) {
    return { error: "دفتر حذف‌شده پیدا نشد." };
  }

  revalidatePath("/");
  return { success: true };
}

export async function createPageAction(formData: FormData) {
  const user = await requireUser();
  await purgeExpiredTrash(user.id);

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
  await purgeExpiredTrash(user.id);

  const parsed = pageSchema.safeParse({
    notebookId,
    title,
  });

  if (!parsed.success) {
    return { error: "عنوان صفحه الزامی است." };
  }

  const notebook = await getOwnedNotebook(user.id, parsed.data.notebookId);

  if (!notebook || notebook.archived || notebook.deletedAt) {
    return { error: "دفتر پیدا نشد." };
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
  await purgeExpiredTrash(user.id);
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
  await purgeExpiredTrash(user.id);
  const parsedPageId = z.string().cuid().safeParse(pageId);

  if (!parsedPageId.success) {
    return { error: "صفحه معتبر نیست." };
  }

  const result = await movePageToTrash(user.id, parsedPageId.data);
  if (!result) {
    return { error: "صفحه پیدا نشد." };
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
    return { error: "صفحه معتبر نیست." };
  }

  const result = await restorePageFromTrash(user.id, parsedPageId.data);
  if (!result) {
    return { error: "دفتر اصلی صفحه پیدا نشد." };
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
    return { error: "صفحه معتبر نیست." };
  }

  const deleted = await deleteTrashPage(user.id, parsedPageId.data);
  if (!deleted) {
    return { error: "صفحه حذف‌شده پیدا نشد." };
  }

  revalidatePath("/");
  return { success: true };
}

export async function updateTagsAction(formData: FormData) {
  const user = await requireUser();
  await purgeExpiredTrash(user.id);
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
  await purgeExpiredTrash(user.id);
  const deletedCount = await emptyTrash(user.id);
  revalidatePath("/");
  return { success: true, deletedCount };
}
