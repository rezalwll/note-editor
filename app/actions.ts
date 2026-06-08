"use server";

import argon2 from "argon2";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";

import {
  clearSession,
  createSession,
  ensureBootstrapUser,
  requireUser,
} from "@/lib/auth";
import { parseTags } from "@/lib/notes";
import { prisma } from "@/lib/prisma";
import {
  clearAttempts,
  getRateLimitState,
  recordFailedAttempt,
} from "@/lib/rate-limit";
import { getFriendlyDatabaseError } from "@/lib/errors";

export type AuthActionState = {
  error?: string;
};

export type PasswordActionState = {
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

export async function loginAction(
  _prevState: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const password = z.string().min(1).safeParse(formData.get("password"));

  if (!password.success) {
    return { error: "Password is required." };
  }

  const headerList = await headers();
  const key =
    headerList.get("x-forwarded-for") ??
    headerList.get("x-real-ip") ??
    "local-user";

  const rateLimit = getRateLimitState(key);

  if (rateLimit.blocked) {
    const retryMinutes = Math.ceil(rateLimit.retryAfterMs / 60000);
    return {
      error: `Too many attempts. Try again in ${retryMinutes} minute(s).`,
    };
  }

  let user;

  try {
    user = await ensureBootstrapUser();
  } catch (error) {
    return {
      error:
        getFriendlyDatabaseError(error) ??
        "Login failed because the database is not ready.",
    };
  }

  const isValid = await argon2.verify(user.passwordHash, password.data);

  if (!isValid) {
    recordFailedAttempt(key);
    return { error: "Incorrect password." };
  }

  clearAttempts(key);
  await createSession(user.id);
  redirect("/");
}

export async function logoutAction() {
  await clearSession();
  redirect("/login");
}

export async function changePasswordAction(
  _prevState: PasswordActionState,
  formData: FormData,
): Promise<PasswordActionState> {
  const user = await requireUser();

  const parsed = z
    .object({
      currentPassword: z.string().min(1),
      newPassword: z.string().min(8).max(128),
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

  revalidatePath("/settings/security");
  return { success: "Password updated successfully." };
}

export async function createNotebookAction(formData: FormData) {
  await requireUser();

  const parsed = notebookSchema.safeParse({
    name: formData.get("name"),
    description: formData.get("description") || undefined,
  });

  if (!parsed.success) {
    return;
  }

  await prisma.notebook.create({
    data: parsed.data,
  });

  revalidatePath("/");
}

export async function createNotebookInlineAction(
  name: string,
  groupId?: string | null,
) {
  await requireUser();

  const notebook = await prisma.notebook.create({
    data: {
      name: name.trim(),
      description: undefined,
      groupId: groupId ?? null,
    },
  });

  revalidatePath("/");
  return { id: notebook.id };
}

export async function createNotebookGroupInlineAction(name: string) {
  await requireUser();

  const parsed = notebookGroupSchema.safeParse({ name });

  if (!parsed.success) {
    return { error: "Category name is required." };
  }

  const group = await prisma.notebookGroup.create({
    data: {
      name: parsed.data.name,
    },
  });

  revalidatePath("/");
  return { id: group.id };
}

export async function renameNotebookGroupInlineAction(id: string, name: string) {
  await requireUser();

  const groupId = z.string().cuid().safeParse(id);
  const groupName = z.string().trim().max(80).safeParse(name);

  if (!groupId.success || !groupName.success) {
    return { error: "Invalid category name." };
  }

  await prisma.notebookGroup.update({
    where: { id: groupId.data },
    data: { name: groupName.data || "Untitled Category" },
  });

  revalidatePath("/");
  return { success: true };
}

export async function deleteNotebookGroupInlineAction(id: string) {
  await requireUser();

  const groupId = z.string().cuid().safeParse(id);

  if (!groupId.success) {
    return { error: "Invalid category." };
  }

  await prisma.$transaction([
    prisma.notebook.updateMany({
      where: { groupId: groupId.data },
      data: { groupId: null },
    }),
    prisma.notebookGroup.delete({
      where: { id: groupId.data },
    }),
  ]);

  revalidatePath("/");
  return { success: true };
}

export async function assignNotebookGroupInlineAction(
  notebookIds: string[],
  groupId: string | null,
) {
  await requireUser();

  const parsedNotebookIds = z.array(z.string().cuid()).safeParse(notebookIds);
  const parsedGroupId = groupId === null ? { success: true, data: null } : z.string().cuid().safeParse(groupId);

  if (!parsedNotebookIds.success || !parsedGroupId.success) {
    return { error: "Invalid category assignment." };
  }

  await prisma.notebook.updateMany({
    where: {
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
  await requireUser();

  const notebookId = z.string().cuid().safeParse(id);
  const notebookName = z.string().trim().max(80).safeParse(name);

  if (!notebookId.success || !notebookName.success) {
    return { error: "Invalid section name." };
  }

  await prisma.notebook.update({
    where: { id: notebookId.data },
    data: { name: notebookName.data },
  });

  revalidatePath("/");
  revalidatePath(`/notebooks/${notebookId.data}`);
  return { success: true };
}

export async function updateNotebookAction(formData: FormData) {
  await requireUser();

  const id = z.string().cuid().safeParse(formData.get("id"));
  const parsed = notebookSchema.safeParse({
    name: formData.get("name"),
    description: formData.get("description") || undefined,
  });

  if (!id.success || !parsed.success) {
    return;
  }

  await prisma.notebook.update({
    where: { id: id.data },
    data: parsed.data,
  });

  revalidatePath("/");
  revalidatePath(`/notebooks/${id.data}`);
}

export async function archiveNotebookAction(formData: FormData) {
  await requireUser();
  const id = z.string().cuid().safeParse(formData.get("id"));

  if (!id.success) {
    return;
  }

  await prisma.notebook.update({
    where: { id: id.data },
    data: { archived: true },
  });

  revalidatePath("/");
  redirect("/");
}

export async function archiveNotebookInlineAction(id: string) {
  await requireUser();
  const notebookId = z.string().cuid().safeParse(id);

  if (!notebookId.success) {
    return { error: "Invalid section." };
  }

  await prisma.notebook.update({
    where: { id: notebookId.data },
    data: { archived: true },
  });

  revalidatePath("/");
  return { success: true };
}

export async function createPageAction(formData: FormData) {
  await requireUser();

  const parsed = pageSchema.safeParse({
    notebookId: formData.get("notebookId"),
    title: formData.get("title"),
  });

  if (!parsed.success) {
    return;
  }

  const page = await prisma.page.create({
    data: {
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
  await requireUser();

  const parsed = pageSchema.safeParse({
    notebookId,
    title,
  });

  if (!parsed.success) {
    return { error: "Page title is required." };
  }

  const page = await prisma.page.create({
    data: {
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
  await requireUser();
  const pageId = z.string().cuid().safeParse(formData.get("pageId"));

  if (!pageId.success) {
    return;
  }

  const page = await prisma.page.update({
    where: { id: pageId.data },
    data: { archived: true },
    select: { notebookId: true },
  });

  revalidatePath(`/notebooks/${page.notebookId}`);
  redirect(`/notebooks/${page.notebookId}`);
}

export async function archivePageInlineAction(pageId: string) {
  await requireUser();
  const parsedPageId = z.string().cuid().safeParse(pageId);

  if (!parsedPageId.success) {
    return { error: "Invalid page." };
  }

  const page = await prisma.page.update({
    where: { id: parsedPageId.data },
    data: { archived: true },
    select: { notebookId: true },
  });

  revalidatePath(`/notebooks/${page.notebookId}`);
  revalidatePath(`/pages/${parsedPageId.data}`);
  revalidatePath("/");
  return { success: true, notebookId: page.notebookId };
}

export async function updateTagsAction(formData: FormData) {
  await requireUser();
  const pageId = z.string().cuid().safeParse(formData.get("pageId"));
  const tagsInput = z.string().safeParse(formData.get("tags"));

  if (!pageId.success || !tagsInput.success) {
    return;
  }

  const tags = parseTags(tagsInput.data);

  await prisma.page.update({
    where: { id: pageId.data },
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
