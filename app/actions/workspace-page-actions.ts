"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { requireUser } from "@/lib/auth";
import { parseTags } from "@/lib/notes";
import { prisma } from "@/lib/prisma";
import { acquireSyncEntityLocks } from "@/lib/sync/entity-lock";
import {
  deleteTrashPage,
  emptyTrash,
  movePageToTrash,
  restorePageFromTrash,
} from "@/lib/trash";

import {
  emptyFreeformDocument,
  getOwnedNotebook,
  getOwnedPage,
  pageSchema,
} from "./workspace-action-shared";

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

  revalidatePath("/workspace");
  revalidatePath(`/notebooks/${parsedNotebookId.data}`);
  return { success: true };
}

export async function movePagesToNotebookInlineAction(
  pageIds: string[],
  notebookId: string,
) {
  const user = await requireUser();
  const parsedPageIds = z.array(z.string().cuid()).min(1).safeParse(pageIds);
  const parsedNotebookId = z.string().cuid().safeParse(notebookId);

  if (!parsedPageIds.success || !parsedNotebookId.success) {
    return { error: "انتخاب صفحه یا زیرمجموعه معتبر نیست." };
  }

  const result = await prisma.$transaction(async (transaction) => {
    const candidatePages = await transaction.page.findMany({
      where: {
        userId: user.id,
        id: { in: parsedPageIds.data },
        archived: false,
        deletedAt: null,
      },
      select: { id: true, notebookId: true },
    });
    if (candidatePages.length !== parsedPageIds.data.length) {
      return null;
    }

    const sourceNotebookIds = [
      ...new Set(candidatePages.map((page) => page.notebookId)),
    ];
    await acquireSyncEntityLocks(transaction, user.id, [
      ...sourceNotebookIds.map((entityId) => ({
        entityType: "notebook" as const,
        entityId,
      })),
      { entityType: "notebook", entityId: parsedNotebookId.data },
      ...parsedPageIds.data.map((entityId) => ({
        entityType: "page" as const,
        entityId,
      })),
    ]);

    const [targetNotebook, lockedPages] = await Promise.all([
      transaction.notebook.findFirst({
        where: {
          id: parsedNotebookId.data,
          userId: user.id,
          systemKey: null,
          archived: false,
          deletedAt: null,
        },
        select: { id: true },
      }),
      transaction.page.findMany({
        where: {
          userId: user.id,
          id: { in: parsedPageIds.data },
          archived: false,
          deletedAt: null,
        },
        select: { id: true, notebookId: true },
      }),
    ]);
    const candidateNotebookByPage = new Map(
      candidatePages.map((page) => [page.id, page.notebookId]),
    );
    if (
      !targetNotebook ||
      lockedPages.length !== parsedPageIds.data.length ||
      lockedPages.some(
        (page) => candidateNotebookByPage.get(page.id) !== page.notebookId,
      )
    ) {
      return null;
    }

    const lastTargetPage = await transaction.page.findFirst({
      where: {
        userId: user.id,
        notebookId: targetNotebook.id,
        id: { notIn: parsedPageIds.data },
        archived: false,
        deletedAt: null,
      },
      orderBy: [
        { sortOrder: "desc" },
        { updatedAt: "desc" },
        { createdAt: "desc" },
      ],
      select: { sortOrder: true },
    });
    const firstSortOrder = (lastTargetPage?.sortOrder ?? -1) + 1;

    await Promise.all(
      parsedPageIds.data.map((id, index) =>
        transaction.page.update({
          where: { id },
          data: {
            notebookId: targetNotebook.id,
            originalNotebookId: null,
            archived: false,
            deletedAt: null,
            sortOrder: firstSortOrder + index,
          },
        }),
      ),
    );

    return { sourceNotebookIds, notebookId: targetNotebook.id };
  });

  if (!result) {
    return { error: "صفحه یا زیرمجموعهٔ مقصد پیدا نشد." };
  }

  for (const sourceNotebookId of result.sourceNotebookIds) {
    revalidatePath(`/notebooks/${sourceNotebookId}`);
  }
  revalidatePath(`/notebooks/${result.notebookId}`);
  for (const pageId of parsedPageIds.data) {
    revalidatePath(`/pages/${pageId}`);
  }
  revalidatePath("/workspace");
  return { success: true, notebookId: result.notebookId };
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
  revalidatePath("/workspace");
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
  revalidatePath("/workspace");
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
  revalidatePath("/workspace");
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
  revalidatePath("/workspace");
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

  revalidatePath("/workspace");
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
  revalidatePath("/workspace");
  return { success: true, deletedCount };
}
