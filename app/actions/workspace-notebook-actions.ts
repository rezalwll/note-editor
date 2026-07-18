"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  deleteTrashNotebooks,
  moveNotebookToTrash,
  restoreNotebooksToGroup,
  TRASH_GROUP_SYSTEM_KEY,
} from "@/lib/trash";
import { isThemeKey } from "@/lib/theme-presets";

import {
  defaultInlinePageTitle,
  emptyFreeformDocument,
  getNextNotebookSortOrder,
  getOwnedGroup,
  getOwnedNotebook,
  notebookNameSchema,
  notebookSchema,
  parseThemeKey,
} from "./workspace-action-shared";

export async function createNotebookAction(formData: FormData) {
  const user = await requireUser();
  const groupId = z.string().cuid().safeParse(formData.get("groupId"));

  const parsed = notebookSchema.safeParse({
    name: formData.get("name"),
    description: formData.get("description") || undefined,
    themeKey: formData.get("themeKey") || undefined,
  });

  if (!parsed.success || !groupId.success) {
    return;
  }

  const group = await getOwnedGroup(user.id, groupId.data);

  if (!group || group.systemKey === TRASH_GROUP_SYSTEM_KEY) {
    return;
  }

  const sortOrder = await getNextNotebookSortOrder(user.id, groupId.data);
  const themeKey = parseThemeKey(parsed.data.themeKey, `${user.id}:${parsed.data.name}:${sortOrder}`);

  await prisma.notebook.create({
    data: {
      ...parsed.data,
      userId: user.id,
      groupId: groupId.data,
      sortOrder,
      themeKey,
    },
  });

  revalidatePath("/");
}

export async function createNotebookInlineAction(
  name: string,
  groupId: string,
  themeKey?: string,
) {
  const user = await requireUser();
  const parsedName = notebookNameSchema.safeParse(name);
  const parsedGroupId = z.string().cuid().safeParse(groupId);

  if (!parsedName.success || !parsedGroupId.success) {
    return { error: "نام زیر مجموعه معتبر نیست." };
  }

  {
    const group = await getOwnedGroup(user.id, parsedGroupId.data);

    if (!group || group.systemKey === TRASH_GROUP_SYSTEM_KEY) {
      return { error: "مجموعه معتبر نیست." };
    }
  }

  const sortOrder = await getNextNotebookSortOrder(user.id, parsedGroupId.data);
  const nextThemeKey = parseThemeKey(
    themeKey,
    `${user.id}:${parsedName.data}:${parsedGroupId.data}:${sortOrder}`,
  );

  const { notebook, page } = await prisma.$transaction(async (tx) => {
    const notebook = await tx.notebook.create({
      data: {
        userId: user.id,
        name: parsedName.data,
        description: undefined,
        groupId: parsedGroupId.data,
        sortOrder,
        themeKey: nextThemeKey,
      },
    });

    const page = await tx.page.create({
      data: {
        userId: user.id,
        notebookId: notebook.id,
        title: defaultInlinePageTitle,
        bodyHtml: emptyFreeformDocument,
        bodyText: "",
        sortOrder: 0,
      },
    });

    return { notebook, page };
  });

  revalidatePath("/");
  revalidatePath(`/notebooks/${notebook.id}`);
  revalidatePath(`/pages/${page.id}`);
  return { id: notebook.id, pageId: page.id, themeKey: nextThemeKey };
}

export async function assignNotebookGroupInlineAction(
  notebookIds: string[],
  groupId: string,
) {
  const user = await requireUser();

  const parsedNotebookIds = z.array(z.string().cuid()).safeParse(notebookIds);
  const parsedGroupId = z.string().cuid().safeParse(groupId);

  if (!parsedNotebookIds.success || !parsedGroupId.success) {
    return { error: "انتخاب مجموعه معتبر نیست." };
  }

  const notebooks = await prisma.notebook.findMany({
    where: { userId: user.id, id: { in: parsedNotebookIds.data } },
    select: { id: true, systemKey: true },
  });

  if (
    notebooks.length !== parsedNotebookIds.data.length ||
    notebooks.some((notebook) => notebook.systemKey)
  ) {
    return { error: "زیر مجموعه معتبر نیست." };
  }

  {
    const group = await getOwnedGroup(user.id, parsedGroupId.data);

    if (!group || group.systemKey === TRASH_GROUP_SYSTEM_KEY) {
      return { error: "مجموعه پیدا نشد." };
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
    return { error: "نام زیر مجموعه معتبر نیست." };
  }

  const notebook = await getOwnedNotebook(user.id, notebookId.data);

  if (!notebook || notebook.systemKey) {
    return { error: "زیر مجموعه پیدا نشد." };
  }

  await prisma.notebook.update({
    where: { id: notebook.id },
    data: { name: notebookName.data },
  });

  revalidatePath("/");
  revalidatePath(`/notebooks/${notebookId.data}`);
  return { success: true };
}

export async function updateNotebookThemeInlineAction(
  id: string,
  themeKey: string,
) {
  const user = await requireUser();
  const notebookId = z.string().cuid().safeParse(id);

  if (!notebookId.success || !isThemeKey(themeKey)) {
    return { error: "رنگ زیر مجموعه معتبر نیست." };
  }

  const notebook = await getOwnedNotebook(user.id, notebookId.data);

  if (!notebook || notebook.systemKey) {
    return { error: "زیر مجموعه پیدا نشد." };
  }

  await prisma.notebook.update({
    where: { id: notebook.id },
    data: { themeKey },
  });

  revalidatePath("/");
  revalidatePath(`/notebooks/${notebook.id}`);
  return { success: true };
}

export async function reorderNotebooksInlineAction(
  groupId: string,
  notebookIds: string[],
) {
  const user = await requireUser();
  const parsedGroupId = z.string().cuid().safeParse(groupId);
  const parsedNotebookIds = z.array(z.string().cuid()).min(1).safeParse(notebookIds);

  if (!parsedGroupId.success || !parsedNotebookIds.success) {
    return { error: "ترتیب زیر مجموعه‌ها معتبر نیست." };
  }

  const group = await getOwnedGroup(user.id, parsedGroupId.data);

  if (!group || group.systemKey === TRASH_GROUP_SYSTEM_KEY) {
    return { error: "مجموعه پیدا نشد." };
  }

  const notebooks = await prisma.notebook.findMany({
    where: {
      userId: user.id,
      id: { in: parsedNotebookIds.data },
      groupId: parsedGroupId.data,
      systemKey: null,
    },
    select: { id: true },
  });

  if (notebooks.length !== parsedNotebookIds.data.length) {
    return { error: "زیر مجموعه پیدا نشد." };
  }

  await prisma.$transaction(
    parsedNotebookIds.data.map((id, index) =>
      prisma.notebook.update({
        where: { id },
        data: { sortOrder: index },
      }),
    ),
  );

  revalidatePath("/");
  revalidatePath(`/notebooks/${parsedNotebookIds.data[0]}`);
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
    return { error: "زیر مجموعه معتبر نیست." };
  }

  const notebook = await getOwnedNotebook(user.id, notebookId.data);

  if (!notebook || notebook.systemKey || notebook.deletedAt) {
    return { error: "زیر مجموعه پیدا نشد." };
  }

  const trashGroupId = await moveNotebookToTrash(user.id, notebook.id);

  revalidatePath("/");
  return { success: true, trashGroupId };
}

export async function deleteNotebookPermanentlyInlineAction(id: string) {
  const user = await requireUser();
  const notebookId = z.string().cuid().safeParse(id);

  if (!notebookId.success) {
    return { error: "زیر مجموعه معتبر نیست." };
  }

  const deletedCount = await deleteTrashNotebooks(user.id, [notebookId.data]);
  if (deletedCount === 0) {
    return { error: "زیر مجموعه حذف‌شده پیدا نشد." };
  }

  revalidatePath("/");
  return { success: true };
}
