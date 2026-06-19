import { notFound, redirect } from "next/navigation";

import { requireUser } from "@/lib/auth";
import { getNotebookTheme } from "@/lib/notebook-theme";
import { prisma } from "@/lib/prisma";

type NotebookPageProps = {
  params: Promise<{ id: string }>;
};

export default async function NotebookPage({ params }: NotebookPageProps) {
  const { id } = await params;
  const user = await requireUser();

  const notebook = await prisma.notebook.findFirst({
    where: { id, userId: user.id },
    include: {
      pages: {
        where: { archived: false, userId: user.id },
        orderBy: { updatedAt: "desc" },
        take: 1,
      },
    },
  });

  if (!notebook || notebook.archived) {
    notFound();
  }

  if (notebook.pages[0]) {
    redirect(`/pages/${notebook.pages[0].id}`);
  }

  const theme = getNotebookTheme(notebook.id);

  return (
    <div className="h-full bg-white">
      <div className="mx-auto max-w-[1400px]">
        <div
          className="min-h-full border-x-0 border-y bg-white px-6 pb-24 pt-8 md:min-h-[calc(100vh-136px)] md:rounded-[10px] md:border md:px-12 md:pt-10"
          style={{
            borderColor: theme.editorBorder,
            boxShadow: `0 1px 0 rgba(0,0,0,0.04), 0 14px 36px ${theme.editorGlow}`,
          }}
        >
          <div className="max-w-2xl text-right" dir="rtl">
            <div
              className="border-b pb-4"
              style={{ borderColor: theme.accent }}
            >
              <h1 className="text-[22px] font-normal text-[#111]">
                {notebook.name || "دفتر بدون عنوان"}
              </h1>
              <p className="mt-3 text-sm text-[#5f6470]">
                این دفتر هنوز صفحه‌ای ندارد. از ستون سمت راست روی «صفحه جدید» بزنید
                تا نوشتن را شروع کنید.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
