import { z } from "zod";

import { serializeFreeformDocument } from "@/lib/notes";
import { prisma } from "@/lib/prisma";
import { getRandomThemeKey, isThemeKey, type ThemeKey } from "@/lib/theme-presets";

export const emptyFreeformDocument = serializeFreeformDocument({
  type: "freeform-v1",
  blocks: [],
});

export const notebookSchema = z.object({
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().max(180).optional(),
  themeKey: z.string().trim().optional(),
});

export const notebookGroupSchema = z.object({
  name: z.string().trim().min(1).max(80),
  themeKey: z.string().trim().optional(),
});

export const restoreNotebookGroupSchema = z.object({
  id: z.string().cuid(),
  name: z.string().trim().min(1).max(80),
  themeKey: z.string().nullable().optional(),
  sortOrder: z.number().int().nonnegative(),
  notebookIds: z.array(z.string().cuid()),
  discardPlaceholder: z.boolean().optional(),
});

export const notebookNameSchema = z.string().trim().min(1).max(80);
export const defaultInlinePageTitle = "صفحه بدون عنوان";

export const pageSchema = z.object({
  notebookId: z.string().cuid(),
  title: z.string().trim().min(1).max(160),
});

export function parseThemeKey(value: string | null | undefined, fallbackSeed: string): ThemeKey {
  if (isThemeKey(value)) {
    return value;
  }

  return getRandomThemeKey(fallbackSeed);
}

export async function getOwnedNotebook(userId: string, id: string) {
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

export async function getOwnedPage(userId: string, id: string) {
  return prisma.page.findFirst({
    where: { id, userId },
    select: { id: true, notebookId: true, archived: true },
  });
}

export async function getOwnedGroup(userId: string, id: string) {
  return prisma.notebookGroup.findFirst({
    where: { id, userId },
    select: { id: true, name: true, systemKey: true, sortOrder: true, themeKey: true },
  });
}

export async function getNextNotebookGroupSortOrder(userId: string) {
  const lastGroup = await prisma.notebookGroup.findFirst({
    where: { userId, systemKey: null },
    orderBy: [{ sortOrder: "desc" }, { createdAt: "desc" }],
    select: { sortOrder: true },
  });

  return (lastGroup?.sortOrder ?? -1) + 1;
}

export async function getNextNotebookSortOrder(userId: string, groupId: string) {
  const lastNotebook = await prisma.notebook.findFirst({
    where: { userId, groupId },
    orderBy: [{ sortOrder: "desc" }, { createdAt: "desc" }],
    select: { sortOrder: true },
  });

  return (lastNotebook?.sortOrder ?? -1) + 1;
}
