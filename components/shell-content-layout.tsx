"use client";

import { usePathname } from "next/navigation";

type ShellContentLayoutProps = {
  children: React.ReactNode;
  sidebar: React.ReactNode;
};

export function ShellContentLayout({
  children,
  sidebar,
}: ShellContentLayoutProps) {
  const pathname = usePathname();
  const showsPagesSidebar =
    pathname.startsWith("/pages/") || pathname.startsWith("/notebooks/");

  return (
    <div className="h-[calc(100dvh-9rem)] overflow-hidden bg-white xl:min-h-[calc(100vh-83px)] xl:h-auto xl:overflow-visible">
      <main
        className={`h-full min-w-0 overflow-y-auto overscroll-contain bg-white pb-20 xl:h-auto xl:overflow-visible xl:pb-0 ${
          showsPagesSidebar ? "xl:pr-[300px]" : ""
        }`}
      >
        {children}
      </main>
      {showsPagesSidebar ? sidebar : null}
    </div>
  );
}
