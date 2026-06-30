import { BrandLogo } from "@/components/brand-logo";
import { ContextMenuProvider } from "@/components/context-menu";
import { DesktopProfileMenu } from "@/components/desktop-profile-menu";
import { EditorToolbar } from "@/components/editor-toolbar";
import { MobileShell } from "@/components/mobile-shell";
import { PagesSidebar } from "@/components/pages-sidebar";
import { SectionTabs } from "@/components/section-tabs";
import { ShellContentLayout } from "@/components/shell-content-layout";
import { getSidebarData } from "@/lib/queries";
import {
  TRASH_GROUP_SYSTEM_KEY,
  TRASH_PAGES_NOTEBOOK_SYSTEM_KEY,
} from "@/lib/trash";
import { getUserAccent, getUserInitials } from "@/lib/users";

type AppShellProps = {
  children: React.ReactNode;
  currentUser: {
    id: string;
    username: string;
    displayName: string;
  };
};

export async function AppShell({ children, currentUser }: AppShellProps) {
  const { groups, notebooks } = await getSidebarData(currentUser.id);
  const userAccent = getUserAccent(currentUser.username);
  const userInitials = getUserInitials(currentUser.displayName);
  const shellNotebooks = notebooks.map((notebook) => ({
    id: notebook.id,
    name: notebook.name,
    groupId: notebook.group?.id ?? null,
    sortOrder: notebook.sortOrder,
    themeKey: notebook.themeKey,
    groupName: notebook.group?.name ?? null,
    systemKey: notebook.systemKey,
    pages: notebook.pages.map((page) => ({
      id: page.id,
      title: page.title,
      updatedAt: page.updatedAt,
      deletedAt: page.deletedAt,
      originalNotebookId: page.originalNotebookId,
      sortOrder: page.sortOrder,
    })),
    deletedAt: notebook.deletedAt,
  }));
  const shellGroups = groups.map((group) => ({
    id: group.id,
    name: group.name,
    notebookCount:
      group.systemKey === TRASH_GROUP_SYSTEM_KEY
        ? shellNotebooks
            .filter((notebook) => notebook.groupId === group.id)
            .reduce(
              (count, notebook) =>
                count +
                (notebook.systemKey === TRASH_PAGES_NOTEBOOK_SYSTEM_KEY
                  ? notebook.pages.length
                  : 1),
              0,
            )
        : group._count.notebooks,
    sortOrder: group.sortOrder,
    themeKey: group.themeKey,
    systemKey: group.systemKey,
  }));

  return (
    <ContextMenuProvider>
      <div className="min-h-screen h-[100dvh] overflow-hidden bg-[#f6f6f6] text-[#2b2b2b] xl:h-auto xl:overflow-visible">
        <MobileShell
          notebooks={shellNotebooks}
          groups={shellGroups}
          currentUser={currentUser}
        />

        <div className="sticky top-0 z-40 hidden overflow-visible xl:block">
          <header className="border-b border-[#b5baff] bg-[linear-gradient(90deg,rgba(159,161,255,0.94)_0%,rgba(181,186,255,0.94)_32%,rgba(174,226,255,0.92)_68%,rgba(217,249,223,0.9)_100%)] backdrop-blur">
            <div className="flex items-center justify-between gap-4 px-4 py-2.5">
              <div className="flex items-center gap-3">
                <BrandLogo
                  frameClassName="h-7 w-[110px] min-w-[110px]"
                  priority
                  showWordmark={false}
                />
                <EditorToolbar />
              </div>

              <DesktopProfileMenu
                currentUser={currentUser}
                userAccent={userAccent}
                userInitials={userInitials}
              />
            </div>
          </header>

          <div className="bg-white/95 backdrop-blur">
            <SectionTabs
              groups={shellGroups}
              notebooks={shellNotebooks.map((notebook) => ({
                id: notebook.id,
                name: notebook.name,
                groupId: notebook.groupId,
                sortOrder: notebook.sortOrder,
                themeKey: notebook.themeKey,
                groupName: notebook.groupName,
                systemKey: notebook.systemKey,
                deletedAt: notebook.deletedAt,
                pageIds: notebook.pages.map((page) => page.id),
              }))}
            />
            <div className="h-[4px] bg-[linear-gradient(90deg,var(--color-lavender),var(--color-periwinkle),var(--color-sky),var(--color-mint))]" />
          </div>
        </div>

        <ShellContentLayout sidebar={<PagesSidebar notebooks={shellNotebooks} />}>
          {children}
        </ShellContentLayout>
      </div>
    </ContextMenuProvider>
  );
}
