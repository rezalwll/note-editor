import Link from "next/link";
import { StickyNote } from "lucide-react";

import {
  logoutAction,
} from "@/app/actions";
import { getSidebarData } from "@/lib/queries";
import { PagesSidebar } from "@/components/pages-sidebar";
import { SectionTabs } from "@/components/section-tabs";

const ribbonItems = ["File", "Home", "Insert", "Draw", "History", "Review", "View"];

export async function AppShell({ children }: { children: React.ReactNode }) {
  const { notebooks } = await getSidebarData();

  return (
    <div className="min-h-screen bg-[#f6f6f6] text-[#2b2b2b]">
      <header className="border-b border-[#6e2c68] bg-[#7e3c7a] text-white">
        <div className="flex h-11 items-center justify-between px-4 text-sm">
          <div className="flex items-center gap-3">
            <button
              type="button"
              className="rounded-full px-2 py-1 text-lg leading-none text-white/90 transition hover:bg-white/10"
            >
              ‹
            </button>
            <button
              type="button"
              className="rounded-full px-2 py-1 text-lg leading-none text-white/90 transition hover:bg-white/10"
            >
              ↶
            </button>
          </div>
          <div className="truncate text-center text-sm font-medium text-white/95">
            OneNote database
          </div>
          <div className="flex items-center gap-3 text-xs">
            <span className="hidden sm:inline">Mohammadreza Aziz</span>
            <form action={logoutAction}>
              <button
                type="submit"
                className="rounded border border-white/25 px-2 py-1 transition hover:bg-white/10"
              >
                Sign out
              </button>
            </form>
          </div>
        </div>

        <div className="flex items-center gap-6 bg-[#7e3c7a] px-4 pb-2 text-[13px] text-white/95">
          {ribbonItems.map((item) => (
            <button
              key={item}
              type="button"
              className="transition hover:text-white"
            >
              {item}
            </button>
          ))}
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

      <div className="flex min-h-[calc(100vh-99px)]">
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
