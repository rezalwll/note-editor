import { prisma } from "@/lib/prisma";

const notebookNameFixes = [
  ["Ø²ÛŒØ± Ù…Ø¬Ù…ÙˆØ¹Ù‡ Ø¨Ø¯ÙˆÙ† Ø¹Ù†ÙˆØ§Ù†", "زیر مجموعه بدون عنوان"],
] as const;

const groupNameFixes = [
  ["Ù…Ø¬Ù…ÙˆØ¹Ù‡ Ø¨Ø¯ÙˆÙ† Ø¹Ù†ÙˆØ§Ù†", "مجموعه بدون عنوان"],
] as const;

const pageTitleFixes = [
  ["ØµÙØ­Ù‡ Ø¨Ø¯ÙˆÙ† Ø¹Ù†ÙˆØ§Ù†", "صفحه بدون عنوان"],
] as const;

let repairInFlight: Promise<void> | null = null;

async function applyKnownMojibakeFixes() {
  await prisma.$transaction([
    ...notebookNameFixes.map(([from, to]) =>
      prisma.notebook.updateMany({
        where: { name: from },
        data: { name: to },
      }),
    ),
    ...groupNameFixes.map(([from, to]) =>
      prisma.notebookGroup.updateMany({
        where: { name: from },
        data: { name: to },
      }),
    ),
    ...pageTitleFixes.map(([from, to]) =>
      prisma.page.updateMany({
        where: { title: from },
        data: { title: to },
      }),
    ),
  ]);
}

export async function repairKnownMojibake() {
  if (!repairInFlight) {
    repairInFlight = applyKnownMojibakeFixes().finally(() => {
      repairInFlight = null;
    });
  }

  await repairInFlight;
}
