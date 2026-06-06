import { UserRound } from "lucide-react";

import { logoutAction } from "@/app/actions";
import { EditorToolbar } from "@/components/editor-toolbar";
import { PagesSidebar } from "@/components/pages-sidebar";
import { SectionTabs } from "@/components/section-tabs";
import { getSidebarData } from "@/lib/queries";

export async function AppShell({ children }: { children: React.ReactNode }) {
  const { notebooks } = await getSidebarData();

  return (
    <div className="min-h-screen bg-[#f6f6f6] text-[#2b2b2b]">
      <header className="border-b border-[#d6dee8] bg-[#e8edf5]">
        <div className="flex items-center justify-between gap-4 px-4 py-2.5">
          <div className="flex items-center gap-3">
            <EditorToolbar />
          </div>

          <div className="flex items-center gap-2.5">
            <div className="flex items-center gap-2.5 rounded-2xl border border-[#d6dee8] bg-white px-3 py-1.5 shadow-[0_3px_10px_rgba(15,23,42,0.08)]">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#1098c5] text-white">
                <UserRound className="h-4.5 w-4.5" />
              </div>
              <div className="text-right">
                <div className="text-sm font-semibold leading-5 text-[#1f2a37]">
                  Mohammadreza Aziz
                </div>
                <div className="text-[11px] leading-4 text-[#708090]">
                  Personal notebook
                </div>
              </div>
            </div>

            <form action={logoutAction}>
              <button
                type="submit"
                className="rounded-xl border border-[#d6dee8] bg-white px-3 py-2 text-xs font-medium text-[#4b5a6b] shadow-[0_3px_10px_rgba(15,23,42,0.08)] transition hover:bg-[#f7fbff]"
              >
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>

      <div className="border-b border-[#b7d589] bg-white">
        <SectionTabs
          notebooks={notebooks.map((notebook) => ({
            id: notebook.id,
            name: notebook.name,
          }))}
        />
        <div className="h-[4px] bg-[#9fca72]" />
      </div>

      <div className="flex min-h-[calc(100vh-83px)]">
        <main className="min-w-0 flex-1 bg-white">{children}</main>
        <PagesSidebar
          notebooks={notebooks.map((notebook) => ({
            id: notebook.id,
            name: notebook.name,
            pages: notebook.pages.map((page) => ({
              id: page.id,
              title: page.title,
              updatedAt: page.updatedAt,
            })),
          }))}
        />
      </div>
    </div>
  );
}
