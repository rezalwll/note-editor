import type { Prisma } from "@/generated/prisma/client";
import {
  DEFAULT_CANVAS_WIDTH,
  PAGE_SIDE_PADDING_DESKTOP,
} from "@/lib/editor-document";
import {
  extractFreeformPlainText,
  serializeFreeformDocument,
  type FreeformDocument,
} from "@/lib/notes";
import { prisma } from "@/lib/prisma";

const WELCOME_BLOCK_WIDTH = 720;
const WELCOME_BLOCK_X =
  DEFAULT_CANVAS_WIDTH - PAGE_SIDE_PADDING_DESKTOP - WELCOME_BLOCK_WIDTH;

const welcomeDocument: FreeformDocument = {
  type: "freeform-v1",
  blocks: [
    {
      id: "welcome-title",
      x: WELCOME_BLOCK_X,
      y: 48,
      width: WELCOME_BLOCK_WIDTH,
      text: "به نوتاوا خوش آمدید 👋",
      bold: true,
      fontSize: 28,
      direction: "rtl",
      align: "right",
    },
    {
      id: "welcome-intro",
      x: WELCOME_BLOCK_X,
      y: 120,
      width: WELCOME_BLOCK_WIDTH,
      text: "نوتاوا فضای شخصی شما برای نوشتن، دسته‌بندی و ساختن ایده‌هاست. این صفحه فقط یک راهنمای کوتاه است؛ می‌توانید همه‌ی بلوک‌های آن را ویرایش، جابه‌جا یا حذف کنید.",
      fontSize: 17,
      direction: "rtl",
      align: "right",
    },
    {
      id: "welcome-features",
      x: WELCOME_BLOCK_X,
      y: 225,
      width: WELCOME_BLOCK_WIDTH,
      text: "شروع سریع\n• برای ساختن یک بلوک متن، یک‌بار روی فضای خالی صفحه بزنید.\n• بلوک را از دستگیره‌ی کناری جابه‌جا کنید و با کشیدن مرز چپ، عرض آن را تغییر دهید.\n• بخشی از متن را انتخاب کنید و از نوار ابزار برای پررنگ‌کردن، رنگ، هایلایت و فهرست‌ها کمک بگیرید.\n• یادداشت‌ها را در مجموعه و زیرمجموعه‌های دلخواه مرتب کنید؛ تغییرات به‌طور خودکار ذخیره می‌شوند.",
      fontSize: 16,
      bold: false,
      direction: "rtl",
      align: "right",
    },
    {
      id: "welcome-todos",
      x: WELCOME_BLOCK_X,
      y: 410,
      width: WELCOME_BLOCK_WIDTH,
      text: "چند کار پیشنهادی برای شروع\n☐ اولین یادداشت واقعی‌ام را بنویسم\n☐ یک مجموعه و زیرمجموعه‌ی دلخواه بسازم\n☐ ظاهر متن را با رنگ و هایلایت شخصی‌سازی کنم\n☐ بعد از انجام هر مورد، روی مربع کنار آن بزنم",
      fontSize: 16,
      direction: "rtl",
      align: "right",
    },
  ],
};

export const welcomeWorkspaceContent = {
  groupName: "شروع کار",
  notebookName: "راهنمای نوتاوا",
  notebookDescription: "راهنمای شروع سریع و آشنایی با امکانات اصلی نوتاوا",
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
