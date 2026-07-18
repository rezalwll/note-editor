"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  deleteTrashNotebooks,
  ensureTrashGroup,
  restoreNotebooksToGroup,
  TRASH_GROUP_SYSTEM_KEY,
} from "@/lib/trash";
import { isThemeKey } from "@/lib/theme-presets";

import {
  defaultInlinePageTitle,
  emptyFreeformDocument,
  getNextNotebookGroupSortOrder,
  getOwnedGroup,
  notebookGroupSchema,
  parseThemeKey,
  restoreNotebookGroupSchema,
} from "./workspace-action-shared";

export async function createNotebookGroupInlineAction(
  name: string,
  themeKey?: string,
  notebookThemeKey?: string,
) {
  const user = await requireUser();

  const parsed = notebookGroupSchema.safeParse({ name });

  if (!parsed.success) {
    return { error: "نام مجموعه الزامی است." };
  }

  const groupSortOrder = await getNextNotebookGroupSortOrder(user.id);
  const nextGroupThemeKey = parseThemeKey(
    themeKey,
    `${user.id}:${parsed.data.name}:group:${groupSortOrder}`,
  );
  const nextNotebookThemeKey = parseThemeKey(
    notebookThemeKey,
    `${user.id}:${parsed.data.name}:notebook:0`,
  );

  const { group, notebook, page } = await prisma.$transaction(async (tx) => {
    const group = await tx.notebookGroup.create({
      data: {
        userId: user.id,
        name: parsed.data.name,
        sortOrder: groupSortOrder,
        themeKey: nextGroupThemeKey,
      },
    });

    const notebook = await tx.notebook.create({
      data: {
        userId: user.id,
        name: "زیر مجموعه بدون عنوان",
        description: undefined,
        groupId: group.id,
        sortOrder: 0,
        themeKey: nextNotebookThemeKey,
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

    return { group, notebook, page };
  });

  revalidatePath("/");
  revalidatePath(`/notebooks/${notebook.id}`);
  revalidatePath(`/pages/${page.id}`);
  return {
    id: group.id,
    notebookId: notebook.id,
    pageId: page.id,
    themeKey: nextGroupThemeKey,
    notebookThemeKey: nextNotebookThemeKey,
  };
}

export async function renameNotebookGroupInlineAction(id: string, name: string) {
  const user = await requireUser();

  const groupId = z.string().cuid().safeParse(id);
  const groupName = z.string().trim().max(80).safeParse(name);

  if (!groupId.success || !groupName.success) {
    return { error: "نام مجموعه معتبر نیست." };
  }

  const group = await getOwnedGroup(user.id, groupId.data);

  if (!group || group.systemKey === TRASH_GROUP_SYSTEM_KEY) {
    return { error: "مجموعه پیدا نشد." };
  }

  await prisma.notebookGroup.update({
    where: { id: group.id },
    data: { name: groupName.data || "مجموعه بدون عنوان" },
  });

  revalidatePath("/");
  return { success: true };
}

export async function updateNotebookGroupThemeInlineAction(
  id: string,
  themeKey: string,
) {
  const user = await requireUser();
  const groupId = z.string().cuid().safeParse(id);

  if (!groupId.success || !isThemeKey(themeKey)) {
    return { error: "رنگ مجموعه معتبر نیست." };
  }

  const group = await getOwnedGroup(user.id, groupId.data);

  if (!group || group.systemKey === TRASH_GROUP_SYSTEM_KEY) {
    return { error: "مجموعه پیدا نشد." };
  }

  await prisma.notebookGroup.update({
    where: { id: group.id },
    data: { themeKey },
  });

  revalidatePath("/");
  return { success: true };
}

export async function deleteNotebookGroupInlineAction(id: string) {
  const user = await requireUser();

  const groupId = z.string().cuid().safeParse(id);

  if (!groupId.success) {
    return { error: "مجموعه معتبر نیست." };
  }

  const group = await getOwnedGroup(user.id, groupId.data);

  if (!group || group.systemKey === TRASH_GROUP_SYSTEM_KEY) {
    return { error: "مجموعه پیدا نشد." };
  }

  const trashGroup = await ensureTrashGroup(user.id);
  const deletedAt = new Date();
  const notebooksInGroup = await prisma.notebook.findMany({
    where: { groupId: group.id, userId: user.id },
    select: { id: true },
  });

  const notebookIds = notebooksInGroup.map((notebook) => notebook.id);

  const archivedNotebookIds = await prisma.$transaction(async (tx) => {
    let ids = notebookIds;

    if (ids.length === 0) {
      const placeholder = await tx.notebook.create({
        data: {
          userId: user.id,
          groupId: trashGroup.id,
          name: group.name || "مجموعه بدون عنوان",
          deletedAt,
        },
      });
      ids = [placeholder.id];
    }

    await tx.notebook.updateMany({
      where: { id: { in: notebookIds }, userId: user.id },
      data: {
        groupId: trashGroup.id,
        deletedAt,
      },
    });
    await tx.page.updateMany({
      where: {
        notebookId: { in: notebookIds },
        userId: user.id,
      },
      data: {
        deletedAt,
      },
    });
    await tx.notebookGroup.delete({
      where: { id: group.id },
    });

    return ids;
  });

  revalidatePath("/");
  return {
    success: true,
    trashGroupId: trashGroup.id,
    notebookIds: archivedNotebookIds,
    wasEmpty: notebookIds.length === 0,
  };
}

export async function restoreNotebookGroupInlineAction(input: {
  id: string;
  name: string;
  themeKey?: string | null;
  sortOrder: number;
  notebookIds: string[];
  discardPlaceholder?: boolean;
}) {
  const user = await requireUser();
  const parsed = restoreNotebookGroupSchema.safeParse(input);
  if (!parsed.success) {
    return { error: "اطلاعات مجموعه برای بازیابی معتبر نیست." };
  }

  const existingGroup = await prisma.notebookGroup.findUnique({
    where: { id: parsed.data.id },
    select: { userId: true },
  });
  if (existingGroup && existingGroup.userId !== user.id) {
    return { error: "مجموعه پیدا نشد." };
  }

  const notebooks = await prisma.notebook.findMany({
    where: { userId: user.id, id: { in: parsed.data.notebookIds } },
    select: { id: true, systemKey: true },
  });
  if (
    notebooks.length !== parsed.data.notebookIds.length ||
    notebooks.some((notebook) => notebook.systemKey)
  ) {
    return { error: "زیرمجموعه‌های مجموعه برای بازیابی معتبر نیستند." };
  }

  if (!existingGroup) {
    await prisma.notebookGroup.create({
      data: {
        id: parsed.data.id,
        userId: user.id,
        name: parsed.data.name,
        themeKey: isThemeKey(parsed.data.themeKey) ? parsed.data.themeKey : null,
        sortOrder: parsed.data.sortOrder,
      },
    });
  }

  if (parsed.data.discardPlaceholder) {
    await deleteTrashNotebooks(user.id, parsed.data.notebookIds);
  } else {
    await restoreNotebooksToGroup(user.id, parsed.data.notebookIds, parsed.data.id);
  }
  revalidatePath("/");
  return { success: true };
}

export async function reorderNotebookGroupsInlineAction(groupIds: string[]) {
  const user = await requireUser();
  const parsedGroupIds = z.array(z.string().cuid()).min(1).safeParse(groupIds);

  if (!parsedGroupIds.success) {
    return { error: "ترتیب مجموعه‌ها معتبر نیست." };
  }

  const groups = await prisma.notebookGroup.findMany({
    where: {
      userId: user.id,
      id: { in: parsedGroupIds.data },
      systemKey: null,
    },
    select: { id: true },
  });

  if (groups.length !== parsedGroupIds.data.length) {
    return { error: "مجموعه پیدا نشد." };
  }

  await prisma.$transaction(
    parsedGroupIds.data.map((id, index) =>
      prisma.notebookGroup.update({
        where: { id },
        data: { sortOrder: index },
      }),
    ),
  );

  revalidatePath("/");
  return { success: true };
}
