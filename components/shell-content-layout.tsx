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
    <div className="min-h-screen xl:min-h-[calc(100vh-83px)]">
      <main
        className={`min-w-0 bg-white pb-20 xl:pb-0 ${
          showsPagesSidebar ? "xl:pr-[300px]" : ""
        }`}
      >
        {children}
      </main>
      {showsPagesSidebar ? sidebar : null}
    </div>
  );
}
