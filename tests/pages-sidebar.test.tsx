import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ComponentProps } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { PagesSidebar } from "@/components/pages-sidebar";

const mocks = vi.hoisted(() => ({
  pathname: "/pages/page-1",
  push: vi.fn(),
  refresh: vi.fn(),
  openMenu: vi.fn(),
  archivePage: vi.fn(),
  restorePage: vi.fn(),
  deletePage: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => mocks.pathname,
  useRouter: () => ({ push: mocks.push, refresh: mocks.refresh }),
}));

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: ComponentProps<"a">) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("@/components/context-menu", () => ({
  useContextMenu: () => ({ openMenu: mocks.openMenu }),
}));

vi.mock("@/app/actions", () => ({
  archivePageInlineAction: mocks.archivePage,
  createPageInlineAction: vi.fn(),
  deletePagePermanentlyInlineAction: mocks.deletePage,
  restorePageInlineAction: mocks.restorePage,
}));

describe("PagesSidebar", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.pathname = "/pages/page-1";
    mocks.archivePage.mockResolvedValue({
      success: true,
      notebookId: "notebook-1",
    });
    mocks.restorePage.mockResolvedValue({
      success: true,
      notebookId: "notebook-1",
    });
    mocks.deletePage.mockResolvedValue({ success: true });
  });

  it("moves a live page to trash from its context menu", async () => {
    render(
      <PagesSidebar
        notebooks={[
          {
            id: "notebook-1",
            name: "زیر مجموعه اول",
            deletedAt: null,
            pages: [
              {
                id: "page-1",
                title: "صفحه اول",
                updatedAt: new Date(),
                deletedAt: null,
              },
            ],
          },
        ]}
      />,
    );

    fireEvent.contextMenu(screen.getByText("صفحه اول"));
    const menu = mocks.openMenu.mock.calls[0][1];
    menu.items.find((item: { id: string }) => item.id === "delete-page").onSelect();

    await waitFor(() => {
      expect(mocks.archivePage).toHaveBeenCalledWith("page-1");
    });
  });

  it("offers restore and permanent delete for a trashed page", async () => {
    render(
      <PagesSidebar
        notebooks={[
          {
            id: "trash-pages",
            name: "صفحه‌های حذف‌شده",
            deletedAt: new Date(),
            pages: [
              {
                id: "page-1",
                title: "صفحه اول",
                updatedAt: new Date(),
                deletedAt: new Date(),
                originalNotebookId: "notebook-1",
              },
            ],
          },
        ]}
      />,
    );

    fireEvent.contextMenu(screen.getByText("صفحه اول"));
    const menu = mocks.openMenu.mock.calls[0][1];
    const ids = menu.items.map((item: { id: string }) => item.id);

    expect(ids).toContain("restore-pages");
    expect(ids).toContain("delete-pages-permanently");

    menu.items
      .find((item: { id: string }) => item.id === "restore-pages")
      .onSelect();

    await waitFor(() => {
      expect(mocks.restorePage).toHaveBeenCalledWith("page-1");
    });
  });
});
