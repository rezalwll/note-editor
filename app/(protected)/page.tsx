import { MobileHomeDashboard } from "@/components/mobile-home-dashboard";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export default async function DashboardPage() {
  const user = await requireUser();
  const [groups, notebooks] = await Promise.all([
    prisma.notebookGroup.findMany({
      where: { userId: user.id, systemKey: null },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    }),
    prisma.notebook.findMany({
      where: { archived: false, deletedAt: null, userId: user.id },
      include: {
        group: { select: { id: true, name: true } },
        pages: {
          where: { archived: false, deletedAt: null, userId: user.id },
          orderBy: { updatedAt: "desc" },
          select: {
            id: true,
            title: true,
            updatedAt: true,
            deletedAt: true,
          },
        },
      },
      orderBy: [
        { group: { sortOrder: "asc" } },
        { sortOrder: "asc" },
        { createdAt: "asc" },
      ],
    }),
  ]);
  const recentPages = notebooks
    .filter((notebook) => !notebook.deletedAt && !notebook.systemKey)
    .flatMap((notebook) =>
      notebook.pages.map((page) => ({
        id: page.id,
        title: page.title,
        updatedAt: page.updatedAt,
        notebookName: notebook.name,
        groupName: notebook.group?.name ?? null,
      })),
    )
    .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
  const collections = groups
    .filter((group) => group.systemKey === null)
    .map((group) => {
      const groupNotebooks = notebooks.filter(
        (notebook) => notebook.groupId === group.id && !notebook.deletedAt,
      );
      const firstNotebook = groupNotebooks[0];
      const firstPage = firstNotebook?.pages[0];
      return {
        id: group.id,
        name: group.name,
        pageCount: groupNotebooks.reduce(
          (count, notebook) => count + notebook.pages.length,
          0,
        ),
        href: firstPage
          ? `/pages/${firstPage.id}`
          : firstNotebook
            ? `/notebooks/${firstNotebook.id}`
            : "/",
      };
    });

  return (
    <MobileHomeDashboard
      displayName={user.displayName}
      continuePage={recentPages[0] ?? null}
      recentPages={recentPages.slice(0, 3)}
      collections={collections}
    />
  );
}
