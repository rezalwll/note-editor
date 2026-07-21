import type { Prisma } from "@/generated/prisma/client";
import {
  extractFreeformPlainText,
  serializeFreeformDocument,
  type FreeformDocument,
} from "@/lib/notes";
import { prisma } from "@/lib/prisma";

const welcomeDocument: FreeformDocument = {
  type: "freeform-v1",
  blocks: [
    {
      id: "welcome-title",
      x: 48,
      y: 48,
      width: 620,
      text: "به نوتاوا خوش آمدید 👋",
      bold: true,
      fontSize: 28,
      direction: "rtl",
      align: "right",
    },
    {
      id: "welcome-intro",
      x: 48,
      y: 120,
      width: 620,
      text: "این صفحه‌ی نمونه برای شروع ساخته شده است. می‌توانید متن‌ها را تغییر دهید، جابه‌جا کنید یا هر زمان خواستید این صفحه را حذف کنید.",
      fontSize: 17,
      direction: "rtl",
      align: "right",
    },
    {
      id: "welcome-features",
      x: 48,
      y: 220,
      width: 620,
      text: "● با دوبار کلیک در فضای خالی، یک بلوک جدید بسازید\n● بلوک‌ها را بکشید و در جای دلخواه قرار دهید\n● از نوار ابزار برای قالب‌بندی، رنگ و فهرست‌ها استفاده کنید",
      fontSize: 16,
      direction: "rtl",
      align: "right",
    },
    {
      id: "welcome-todos",
      x: 48,
      y: 350,
      width: 620,
      text: "☐ اولین یادداشت خودم را بنویسم\n☐ یک مجموعه و زیرمجموعه‌ی دلخواه بسازم\n☐ این صفحه‌ی نمونه را شخصی‌سازی کنم",
      fontSize: 16,
      direction: "rtl",
      align: "right",
    },
  ],
};

export const welcomeWorkspaceContent = {
  groupName: "شروع کار",
  notebookName: "راهنمای نوتاوا",
  notebookDescription: "یک راهنمای کوتاه برای شروع کار با نوتاوا",
  pageTitle: "به نوتاوا خوش آمدید",
  bodyHtml: serializeFreeformDocument(welcomeDocument),
  bodyText: extractFreeformPlainText(welcomeDocument),
} as const;

export async function createWelcomeWorkspace(
  transaction: Prisma.TransactionClient,
  userId: string,
) {
  const group = await transaction.notebookGroup.create({
    data: {
      userId,
      name: welcomeWorkspaceContent.groupName,
      sortOrder: 0,
      themeKey: "sky",
    },
  });
  const notebook = await transaction.notebook.create({
    data: {
      userId,
      groupId: group.id,
      name: welcomeWorkspaceContent.notebookName,
      description: welcomeWorkspaceContent.notebookDescription,
      sortOrder: 0,
      themeKey: "sky",
    },
  });
  const page = await transaction.page.create({
    data: {
      userId,
      notebookId: notebook.id,
      title: welcomeWorkspaceContent.pageTitle,
      bodyHtml: welcomeWorkspaceContent.bodyHtml,
      bodyText: welcomeWorkspaceContent.bodyText,
      sortOrder: 0,
    },
  });

  return { groupId: group.id, notebookId: notebook.id, pageId: page.id };
}

export async function ensureWelcomeWorkspace(userId: string) {
  return prisma.$transaction(async (transaction) => {
    const claimed = await transaction.user.updateMany({
      where: { id: userId, onboardingSeededAt: null },
      data: { onboardingSeededAt: new Date() },
    });

    if (claimed.count === 0) {
      return null;
    }

    const existingPage = await transaction.page.findFirst({
      where: { userId },
      select: { id: true },
    });

    if (existingPage) {
      return null;
    }

    return createWelcomeWorkspace(transaction, userId);
  });
}
