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

const pageSchema = z.object({
  notebookId: z.string().cuid(),
  title: z.string().trim().min(1).max(160),
});

const usernameSchema = z
  .string()
  .trim()
  .min(3)
  .max(32)
  .regex(/^[a-z0-9_]+$/, "Username can only include lowercase letters, numbers, and underscores.")
  .transform(normalizeUsername);

const displayNameSchema = z.string().trim().min(2).max(80);

const passwordSchema = z.string().min(8).max(128);

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
    select: { id: true, userId: true, archived: true, groupId: true },
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
    select: { id: true },
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
    return { error: "Username and password are required." };
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
      error: `Too many attempts. Try again in ${retryMinutes} minute(s).`,
    };
  }

  let user;

  try {
    user = await getUserByUsername(parsed.data.username);
  } catch (error) {
    return {
      error:
        getFriendlyDatabaseError(error) ??
        "Login failed because the database is not ready.",
    };
  }

  if (!user) {
    recordFailedAttempt(key);
    return { error: "Incorrect username or password." };
  }

  const isValid = await argon2.verify(user.passwordHash, parsed.data.password);

  if (!isValid) {
    recordFailedAttempt(key);
    return { error: "Incorrect username or password." };
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
    return { error: "Use a valid name, username, and password." };
  }

  if (parsed.data.password !== parsed.data.confirmPassword) {
    return { error: "Password confirmation does not match." };
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
      return { error: "That username is already taken." };
    }

    return {
      error:
        getFriendlyDatabaseError(error) ??
        "Could not create the account right now.",
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
    return { error: "Use a valid display name and username." };
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
      return { error: "That username is already taken." };
    }

    return {
      error:
        getFriendlyDatabaseError(error) ??
        "Could not update the profile right now.",
    };
  }

  revalidatePath("/");
  revalidatePath("/settings");
  return { success: "Profile updated successfully." };
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
    return { error: "Use a new password with at least 8 characters." };
  }

  const matches = await argon2.verify(
    user.passwordHash,
    parsed.data.currentPassword,
  );

  if (!matches) {
    return { error: "Current password is incorrect." };
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
  return { success: "Password updated successfully." };
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

  if (groupId) {
    const group = await getOwnedGroup(user.id, groupId);

    if (!group) {
      return { error: "Invalid category." };
    }
  }

  const notebook = await prisma.notebook.create({
    data: {
      userId: user.id,
      name: name.trim(),
      description: undefined,
      groupId: groupId ?? null,
    },
  });

  revalidatePath("/");
  return { id: notebook.id };
}

export async function createNotebookGroupInlineAction(name: string) {
  const user = await requireUser();

  const parsed = notebookGroupSchema.safeParse({ name });

  if (!parsed.success) {
    return { error: "Category name is required." };
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

  const groupId = z.string().cuid().safeParse(id);
  const groupName = z.string().trim().max(80).safeParse(name);

  if (!groupId.success || !groupName.success) {
    return { error: "Invalid category name." };
  }

  const group = await getOwnedGroup(user.id, groupId.data);

  if (!group) {
    return { error: "Category not found." };
  }

  await prisma.notebookGroup.update({
    where: { id: group.id },
    data: { name: groupName.data || "Untitled Category" },
  });

  revalidatePath("/");
  return { success: true };
}

export async function deleteNotebookGroupInlineAction(id: string) {
  const user = await requireUser();

  const groupId = z.string().cuid().safeParse(id);

  if (!groupId.success) {
    return { error: "Invalid category." };
  }

  const group = await getOwnedGroup(user.id, groupId.data);

  if (!group) {
    return { error: "Category not found." };
  }

  await prisma.$transaction([
    prisma.notebook.updateMany({
      where: { groupId: group.id, userId: user.id },
      data: { groupId: null },
    }),
    prisma.notebookGroup.delete({
      where: { id: group.id },
    }),
  ]);

  revalidatePath("/");
  return { success: true };
}

export async function assignNotebookGroupInlineAction(
  notebookIds: string[],
  groupId: string | null,
) {
  const user = await requireUser();

  const parsedNotebookIds = z.array(z.string().cuid()).safeParse(notebookIds);
  const parsedGroupId =
    groupId === null
      ? { success: true, data: null }
      : z.string().cuid().safeParse(groupId);

  if (!parsedNotebookIds.success || !parsedGroupId.success) {
    return { error: "Invalid category assignment." };
  }

  if (parsedGroupId.data) {
    const group = await getOwnedGroup(user.id, parsedGroupId.data);

    if (!group) {
      return { error: "Category not found." };
    }
  }

  await prisma.notebook.updateMany({
    where: {
      userId: user.id,
      id: {
        in: parsedNotebookIds.data,
      },
    },
    data: {
      groupId: parsedGroupId.data,
    },
  });

  revalidatePath("/");
  return { success: true };
}

export async function renameNotebookInlineAction(id: string, name: string) {
  const user = await requireUser();

  const notebookId = z.string().cuid().safeParse(id);
  const notebookName = z.string().trim().max(80).safeParse(name);

  if (!notebookId.success || !notebookName.success) {
    return { error: "Invalid section name." };
  }

  const notebook = await getOwnedNotebook(user.id, notebookId.data);

  if (!notebook) {
    return { error: "Section not found." };
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

  if (!notebook) {
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

  if (!notebook) {
    return;
  }

  await prisma.notebook.update({
    where: { id: notebook.id },
    data: { archived: true },
  });

  revalidatePath("/");
  redirect("/");
}

export async function archiveNotebookInlineAction(id: string) {
  const user = await requireUser();
  const notebookId = z.string().cuid().safeParse(id);

  if (!notebookId.success) {
    return { error: "Invalid section." };
  }

  const notebook = await getOwnedNotebook(user.id, notebookId.data);

  if (!notebook) {
    return { error: "Section not found." };
  }

  await prisma.notebook.update({
    where: { id: notebook.id },
    data: { archived: true },
  });

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

  if (!notebook || notebook.archived) {
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
    return { error: "Page title is required." };
  }

  const notebook = await getOwnedNotebook(user.id, parsed.data.notebookId);

  if (!notebook || notebook.archived) {
    return { error: "Section not found." };
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

  const page = await prisma.page.findFirst({
    where: { id: pageId.data, userId: user.id },
    select: { id: true, notebookId: true },
  });

  if (!page) {
    return;
  }

  await prisma.page.update({
    where: { id: page.id },
    data: { archived: true },
  });

  revalidatePath(`/notebooks/${page.notebookId}`);
  redirect(`/notebooks/${page.notebookId}`);
}

export async function archivePageInlineAction(pageId: string) {
  const user = await requireUser();
  const parsedPageId = z.string().cuid().safeParse(pageId);

  if (!parsedPageId.success) {
    return { error: "Invalid page." };
  }

  const page = await prisma.page.findFirst({
    where: { id: parsedPageId.data, userId: user.id },
    select: { id: true, notebookId: true },
  });

  if (!page) {
    return { error: "Page not found." };
  }

  await prisma.page.update({
    where: { id: page.id },
    data: { archived: true },
  });

  revalidatePath(`/notebooks/${page.notebookId}`);
  revalidatePath(`/pages/${parsedPageId.data}`);
  revalidatePath("/");
  return { success: true, notebookId: page.notebookId };
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
