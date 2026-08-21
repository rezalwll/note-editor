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
  const showsEditor = pathname.startsWith("/pages/");

  return (
    <div
      className={`relative h-[calc(100dvh-9rem)] overflow-hidden bg-white xl:h-auto xl:min-h-0 xl:flex-1 ${
        showsPagesSidebar
          ? "xl:grid xl:grid-cols-[300px_minmax(0,1fr)]"
          : ""
      }`}
    >
      <main
        className={`h-full min-w-0 overflow-y-auto overscroll-contain bg-white pb-20 xl:h-full xl:pb-0 ${
          showsEditor ? "xl:overflow-hidden" : "xl:overflow-y-auto"
        } ${
          showsPagesSidebar ? "xl:col-start-2 xl:row-start-1" : ""
        }`}
      >
        {children}
      </main>
      {showsPagesSidebar ? sidebar : null}
    </div>
  );
}
