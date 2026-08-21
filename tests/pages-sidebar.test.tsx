import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ComponentProps } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { PagesSidebar } from "@/components/pages-sidebar";
import { dispatchNotebookRenamed, dispatchPageTitleUpdated } from "@/lib/page-events";

const mocks = vi.hoisted(() => ({
  pathname: "/pages/page-1",
  push: vi.fn(),
  refresh: vi.fn(),
  openMenu: vi.fn(),
  archivePage: vi.fn(),
  createPage: vi.fn(),
  restorePage: vi.fn(),
  deletePage: vi.fn(),
  movePages: vi.fn(),
  reorderPages: vi.fn(),
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
  createPageInlineAction: mocks.createPage,
  deletePagePermanentlyInlineAction: mocks.deletePage,
  movePagesToNotebookInlineAction: mocks.movePages,
  reorderPagesInlineAction: mocks.reorderPages,
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
    mocks.createPage.mockResolvedValue({ id: "page-2" });
    mocks.restorePage.mockResolvedValue({
      success: true,
      notebookId: "notebook-1",
    });
    mocks.deletePage.mockResolvedValue({ success: true });
    mocks.movePages.mockResolvedValue({
      success: true,
      notebookId: "notebook-2",
    });
  });

  it("navigates to a newly created page without racing a refresh", async () => {
    render(
      <PagesSidebar
        notebooks={[
          {
            id: "notebook-1",
            name: "Notebook",
            deletedAt: null,
            pages: [
              {
                id: "page-1",
                title: "Existing page",
                updatedAt: new Date(),
                deletedAt: null,
              },
            ],
          },
        ]}
      />,
    );

    fireEvent.click(screen.getByTestId("create-page"));
    fireEvent.change(screen.getByTestId("new-page-title"), {
      target: { value: "New page" },
    });
    fireEvent.keyDown(screen.getByTestId("new-page-title"), { key: "Enter" });

    await waitFor(() => {
      expect(mocks.createPage).toHaveBeenCalledWith("notebook-1", "New page");
    });
    expect(mocks.push).toHaveBeenCalledWith("/pages/page-2");
    expect(mocks.refresh).not.toHaveBeenCalled();
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

  it("offers moving a page to another live notebook", async () => {
    render(
      <PagesSidebar
        notebooks={[
          {
            id: "notebook-1",
            name: "Current notebook",
            groupName: "Current group",
            deletedAt: null,
            pages: [
              {
                id: "page-1",
                title: "Page one",
                updatedAt: new Date(),
                deletedAt: null,
              },
            ],
          },
          {
            id: "notebook-2",
            name: "Target notebook",
            groupName: "Target group",
            deletedAt: null,
            pages: [],
          },
        ]}
      />,
    );

    fireEvent.contextMenu(screen.getByText("Page one"));
    const menu = mocks.openMenu.mock.calls[0][1];
    const moveMenu = menu.items.find(
      (item: { id: string }) => item.id === "move-pages",
    );
    const target = moveMenu.submenu.find(
      (item: { id: string }) => item.id === "move-page-notebook-2",
    );

    expect(target.label).toBe("Target notebook — Target group");
    target.onSelect();

    await waitFor(() => {
      expect(mocks.movePages).toHaveBeenCalledWith(
        ["page-1"],
        "notebook-2",
      );
    });
    expect(mocks.refresh).toHaveBeenCalled();
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

  it("updates the visible page title immediately after a title event", async () => {
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
                title: "عنوان قبلی",
                updatedAt: new Date("2026-06-22T10:00:00.000Z"),
                deletedAt: null,
              },
            ],
          },
        ]}
      />,
    );

    dispatchPageTitleUpdated({
      notebookId: "notebook-1",
      pageId: "page-1",
      title: "عنوان جدید",
      updatedAt: "2026-06-22T11:00:00.000Z",
    });

    await waitFor(() => {
      expect(screen.getByText("عنوان جدید")).toBeInTheDocument();
    });
  });

  it("updates the active notebook name immediately after a notebook rename event", async () => {
    render(
      <PagesSidebar
        notebooks={[
          {
            id: "notebook-1",
            name: "نام قبلی",
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

    dispatchNotebookRenamed({
      notebookId: "notebook-1",
      name: "نام جدید زیر مجموعه",
    });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "نام جدید زیر مجموعه" })).toBeInTheDocument();
    });
  });

  it("shows a pointer page row and a drag handle on live pages", () => {
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

    expect(screen.getByText("صفحه اول").closest("a")).toHaveClass("cursor-pointer");
    expect(screen.getByLabelText("جابجایی صفحه")).toBeInTheDocument();
  });

  it("keeps the pages container above the viewport bottom and scrolls its list", () => {
    render(
      <PagesSidebar
        notebooks={[
          {
            id: "notebook-1",
            name: "Notebook",
            deletedAt: null,
            pages: [
              {
                id: "page-1",
                title: "Page one",
                updatedAt: new Date(),
                deletedAt: null,
              },
            ],
          },
        ]}
      />,
    );

    expect(screen.getByTestId("pages-sidebar-container")).toHaveClass(
      "bottom-[10px]",
      "flex",
      "overflow-hidden",
    );
    expect(screen.getByTestId("pages-sidebar-list")).toHaveClass(
      "min-h-0",
      "flex-1",
      "overflow-y-auto",
      "overscroll-contain",
    );
  });

  it("virtualizes a sidebar containing five thousand pages", () => {
    const pages = Array.from({ length: 5_000 }, (_, index) => ({
      id: `page-${index + 1}`,
      title: `Large page ${index + 1}`,
      updatedAt: new Date("2026-06-22T10:00:00.000Z"),
      deletedAt: null,
      sortOrder: index,
    }));
    const { container } = render(
      <PagesSidebar
        notebooks={[
          {
            id: "notebook-1",
            name: "Large notebook",
            deletedAt: null,
            pages,
          },
        ]}
      />,
    );

    const list = container.querySelector(
      '[data-virtualized="true"]',
    ) as HTMLDivElement;
    expect(list).toBeInTheDocument();
    expect(container.querySelectorAll("[data-page-item]").length).toBeLessThan(30);

    fireEvent.scroll(list, { target: { scrollTop: 198_000 } });

    expect(screen.getByText("Large page 3001")).toBeInTheDocument();
    expect(container.querySelectorAll("[data-page-item]").length).toBeLessThan(30);
  });
});
