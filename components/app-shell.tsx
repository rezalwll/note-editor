import { UserRound } from "lucide-react";

import { logoutAction } from "@/app/actions";
import { BrandLogo } from "@/components/brand-logo";
import { ContextMenuProvider } from "@/components/context-menu";
import { EditorToolbar } from "@/components/editor-toolbar";
import { MobileShell } from "@/components/mobile-shell";
import { PagesSidebar } from "@/components/pages-sidebar";
import { SectionTabs } from "@/components/section-tabs";
import { getSidebarData } from "@/lib/queries";

export async function AppShell({ children }: { children: React.ReactNode }) {
  const { groups, notebooks } = await getSidebarData();
  const shellNotebooks = notebooks.map((notebook) => ({
    id: notebook.id,
    name: notebook.name,
    groupId: notebook.group?.id ?? null,
    groupName: notebook.group?.name ?? null,
    pages: notebook.pages.map((page) => ({
      id: page.id,
      title: page.title,
      updatedAt: page.updatedAt,
    })),
  }));
  const shellGroups = groups.map((group) => ({
    id: group.id,
    name: group.name,
    notebookCount: group._count.notebooks,
  }));

  return (
    <ContextMenuProvider>
      <div className="min-h-screen bg-[var(--bg-app)] text-[var(--text-strong)]">
        <MobileShell notebooks={shellNotebooks} groups={shellGroups} />

        <div className="sticky top-0 z-40 hidden xl:block">
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

              <div className="flex items-center gap-2.5">
                <div className="flex items-center gap-2.5 rounded-2xl border border-white/60 bg-white/72 px-3 py-1.5 shadow-[0_12px_35px_rgba(116,125,255,0.24)]">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[linear-gradient(135deg,#9FA1FF_0%,#AEE2FF_100%)] text-white shadow-[0_8px_18px_rgba(116,125,255,0.28)]">
                    <UserRound className="h-4.5 w-4.5" />
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-semibold leading-5 text-[#2d3561]">
                      Mohammadreza Aziz
                    </div>
                    <div className="text-[11px] leading-4 text-[#5d6996]">
                      Personal notebook
                    </div>
                  </div>
                </div>

                <form action={logoutAction}>
                  <button
                    type="submit"
                    className="rounded-xl border border-white/60 bg-white/76 px-3 py-2 text-xs font-medium text-[#32406d] shadow-[0_12px_35px_rgba(116,125,255,0.2)] transition hover:bg-white"
                  >
                    Sign out
                  </button>
                </form>
              </div>
            </div>
          </header>

          <div className="bg-white/95 backdrop-blur">
            <SectionTabs
              groups={shellGroups}
              notebooks={shellNotebooks.map((notebook) => ({
                id: notebook.id,
                name: notebook.name,
                groupId: notebook.groupId,
                groupName: notebook.groupName,
              }))}
            />
            <div className="h-[4px] bg-[linear-gradient(90deg,var(--color-lavender),var(--color-periwinkle),var(--color-sky),var(--color-mint))]" />
          </div>
        </div>

        <div className="flex min-h-screen items-start xl:min-h-[calc(100vh-83px)]">
          <main className="min-w-0 flex-1 bg-white pb-20 xl:pb-0">{children}</main>
          <PagesSidebar notebooks={shellNotebooks} />
        </div>
      </div>
    </ContextMenuProvider>
  );
}
