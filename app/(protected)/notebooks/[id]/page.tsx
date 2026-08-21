import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { cache } from "react";

import { requireUser } from "@/lib/auth";
import { getNotebookDocumentTitle } from "@/lib/page-title";
import { getNotebookTheme } from "@/lib/notebook-theme";
import { prisma } from "@/lib/prisma";

type NotebookPageProps = {
  params: Promise<{ id: string }>;
};

const getNotebook = cache(async (id: string, userId: string) =>
  prisma.notebook.findFirst({
    where: { id, userId },
    include: {
      pages: {
        where: { archived: false, userId },
        orderBy: [{ sortOrder: "asc" }, { updatedAt: "asc" }],
        take: 1,
      },
    },
  }),
);

export async function generateMetadata({
  params,
}: NotebookPageProps): Promise<Metadata> {
  const { id } = await params;
  const user = await requireUser();
  const notebook = await getNotebook(id, user.id);

  return {
    title: getNotebookDocumentTitle(notebook?.name),
  };
}

export default async function NotebookPage({ params }: NotebookPageProps) {
  const { id } = await params;
  const user = await requireUser();

  const notebook = await getNotebook(id, user.id);

  if (!notebook || notebook.archived) {
    notFound();
  }

  if (notebook.pages[0]) {
    redirect(`/pages/${notebook.pages[0].id}`);
  }

  const theme = getNotebookTheme(notebook.id, notebook.themeKey);

  return (
    <div className="h-full min-h-0 bg-white xl:pt-[6px]">
      <div className="mx-auto h-full max-w-[1400px]">
        <div
          className="min-h-full border-x-0 border-y bg-white px-6 pb-24 pt-8 md:min-h-[calc(100vh-136px)] md:rounded-[10px] md:border md:px-12 md:pt-10 xl:h-full xl:min-h-0"
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
                {notebook.name || "زیر مجموعه بدون عنوان"}
              </h1>
              <p className="mt-3 text-sm text-[#5f6470]">
                این زیر مجموعه هنوز صفحه‌ای ندارد. از ستون سمت راست روی «صفحه جدید» بزنید
                تا نوشتن را شروع کنید.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
