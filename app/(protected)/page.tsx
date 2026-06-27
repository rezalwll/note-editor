import { redirect } from "next/navigation";

import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export default async function DashboardPage() {
  const user = await requireUser();
  const groups = await prisma.notebookGroup.findMany({
    where: { userId: user.id, systemKey: null },
    select: { id: true, name: true },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    take: 1,
  });
  const notebooks = await prisma.notebook.findMany({
    where: { archived: false, deletedAt: null, userId: user.id },
    include: {
      pages: {
        where: { archived: false, deletedAt: null, userId: user.id },
        orderBy: [{ sortOrder: "asc" }, { updatedAt: "asc" }],
        take: 1,
      },
    },
    orderBy: [
      { group: { sortOrder: "asc" } },
      { sortOrder: "asc" },
      { createdAt: "asc" },
    ],
    take: 1,
  });

  const activeNotebook = notebooks[0];

  if (activeNotebook?.pages[0]) {
    redirect(`/pages/${activeNotebook.pages[0].id}`);
  }

  if (activeNotebook) {
    redirect(`/notebooks/${activeNotebook.id}`);
  }

  const hasGroup = groups.length > 0;

  return (
    <div className="flex h-full bg-white">
      <div className="mx-auto flex w-full max-w-[1100px] items-center justify-center px-6 py-12">
        <div
          className="w-full max-w-2xl rounded-[18px] border border-[#d9e2f1] bg-white px-8 py-16 text-center shadow-[0_18px_40px_rgba(15,23,42,0.08)]"
          dir="rtl"
        >
          <h1 className="text-2xl font-medium text-[#1f2937]">
            {hasGroup ? "هنوز زیرمجموعه‌ای ندارید" : "هنوز هیچ مجموعه‌ای ندارید"}
          </h1>
          <p className="mt-3 text-sm leading-7 text-[#6b7280]">
            {hasGroup
              ? "از دکمه «زیر مجموعه جدید» در نوار بالا استفاده کنید تا اولین زیرمجموعه را بسازید."
              : "برای شروع، از دکمه «مجموعه جدید» در نوار بالا یک مجموعه بسازید."}
          </p>
        </div>
      </div>
    </div>
  );
}
