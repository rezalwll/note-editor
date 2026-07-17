"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { requireUser } from "@/lib/auth";
import { parseTags, serializeFreeformDocument } from "@/lib/notes";
import { prisma } from "@/lib/prisma";
import { acquireSyncEntityLocks } from "@/lib/sync/entity-lock";
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
import { getRandomThemeKey, isThemeKey, type ThemeKey } from "@/lib/theme-presets";

const emptyFreeformDocument = serializeFreeformDocument({
  type: "freeform-v1",
  blocks: [],
});

const notebookSchema = z.object({
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().max(180).optional(),
  themeKey: z.string().trim().optional(),
});

const notebookGroupSchema = z.object({
  name: z.string().trim().min(1).max(80),
  themeKey: z.string().trim().optional(),
});

const restoreNotebookGroupSchema = z.object({
  id: z.string().cuid(),
  name: z.string().trim().min(1).max(80),
  themeKey: z.string().nullable().optional(),
  sortOrder: z.number().int().nonnegative(),
  notebookIds: z.array(z.string().cuid()),
  discardPlaceholder: z.boolean().optional(),
});

const notebookNameSchema = z.string().trim().min(1).max(80);
const defaultInlinePageTitle = "صفحه بدون عنوان";

const pageSchema = z.object({
  notebookId: z.string().cuid(),
  title: z.string().trim().min(1).max(160),
});

function parseThemeKey(value: string | null | undefined, fallbackSeed: string): ThemeKey {
  if (isThemeKey(value)) {
    return value;
  }

  return getRandomThemeKey(fallbackSeed);
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
      themeKey: true,
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
    select: { id: true, name: true, systemKey: true, sortOrder: true, themeKey: true },
  });
}

async function getNextNotebookGroupSortOrder(userId: string) {
  const lastGroup = await prisma.notebookGroup.findFirst({
    where: { userId, systemKey: null },
    orderBy: [{ sortOrder: "desc" }, { createdAt: "desc" }],
    select: { sortOrder: true },
  });

  return (lastGroup?.sortOrder ?? -1) + 1;
}

async function getNextNotebookSortOrder(userId: string, groupId: string) {
  const lastNotebook = await prisma.notebook.findFirst({
    where: { userId, groupId },
    orderBy: [{ sortOrder: "desc" }, { createdAt: "desc" }],
    select: { sortOrder: true },
  });

  return (lastNotebook?.sortOrder ?? -1) + 1;
}

async function createPageInActiveNotebook(
  userId: string,
  notebookId: string,
  title: string,
) {
  return prisma.$transaction(async (transaction) => {
    await acquireSyncEntityLocks(transaction, userId, [
      { entityType: "notebook", entityId: notebookId },
    ]);

    const notebook = await transaction.notebook.findFirst({
      where: {
        id: notebookId,
        userId,
        archived: false,
        deletedAt: null,
      },
      select: { id: true },
    });
    if (!notebook) {
      return null;
    }

    const lastPage = await transaction.page.findFirst({
      where: { userId, notebookId },
      orderBy: [{ sortOrder: "desc" }, { updatedAt: "desc" }, { createdAt: "desc" }],
      select: { sortOrder: true },
    });
    return transaction.page.create({
      data: {
        userId,
        notebookId,
        title,
        bodyHtml: emptyFreeformDocument,
        bodyText: "",
        sortOrder: (lastPage?.sortOrder ?? -1) + 1,
      },
    });
  });
}

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

export async function reorderPagesInlineAction(
  notebookId: string,
  pageIds: string[],
) {
  const user = await requireUser();
  const parsedNotebookId = z.string().cuid().safeParse(notebookId);
  const parsedPageIds = z.array(z.string().cuid()).min(1).safeParse(pageIds);

  if (!parsedNotebookId.success || !parsedPageIds.success) {
    return { error: "ترتیب صفحه‌ها معتبر نیست." };
  }

  const notebook = await getOwnedNotebook(user.id, parsedNotebookId.data);

  if (!notebook || notebook.archived || notebook.deletedAt) {
    return { error: "زیر مجموعه پیدا نشد." };
  }

  const pages = await prisma.page.findMany({
    where: {
      userId: user.id,
      id: { in: parsedPageIds.data },
      notebookId: parsedNotebookId.data,
      archived: false,
    },
    select: { id: true },
  });

  if (pages.length !== parsedPageIds.data.length) {
    return { error: "صفحه پیدا نشد." };
  }

  await prisma.$transaction(
    parsedPageIds.data.map((id, index) =>
      prisma.page.update({
        where: { id },
        data: { sortOrder: index },
      }),
    ),
  );

  revalidatePath("/");
  revalidatePath(`/notebooks/${parsedNotebookId.data}`);
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

export async function createPageAction(formData: FormData) {
  const user = await requireUser();

  const parsed = pageSchema.safeParse({
    notebookId: formData.get("notebookId"),
    title: formData.get("title"),
  });

  if (!parsed.success) {
    return;
  }

  const page = await createPageInActiveNotebook(
    user.id,
    parsed.data.notebookId,
    parsed.data.title,
  );
  if (!page) {
    return;
  }

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
    return { error: "عنوان صفحه الزامی است." };
  }

  const page = await createPageInActiveNotebook(
    user.id,
    parsed.data.notebookId,
    parsed.data.title,
  );
  if (!page) {
    return { error: "زیر مجموعه پیدا نشد." };
  }

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
    return { error: "زیر مجموعه اصلی صفحه پیدا نشد." };
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
