import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentProps } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { SectionTabs } from "@/components/section-tabs";

const mocks = vi.hoisted(() => ({
  createNotebook: vi.fn(),
  createGroup: vi.fn(),
  emptyTrash: vi.fn(),
  archiveNotebook: vi.fn(),
  deleteGroup: vi.fn(),
  push: vi.fn(),
  refresh: vi.fn(),
  openMenu: vi.fn(),
  pathname: "/notebooks/notebook-1",
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
  archiveNotebookInlineAction: mocks.archiveNotebook,
  assignNotebookGroupInlineAction: vi.fn(),
  createNotebookGroupInlineAction: mocks.createGroup,
  createNotebookInlineAction: mocks.createNotebook,
  deleteNotebookPermanentlyInlineAction: vi.fn(),
  deleteNotebookGroupInlineAction: mocks.deleteGroup,
  emptyTrashInlineAction: mocks.emptyTrash,
  renameNotebookGroupInlineAction: vi.fn(),
  renameNotebookInlineAction: vi.fn(),
}));

describe("SectionTabs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.pathname = "/notebooks/notebook-1";
    mocks.createNotebook.mockResolvedValue({
      id: "notebook-2",
      pageId: "page-2",
    });
    mocks.archiveNotebook.mockResolvedValue({
      success: true,
      trashGroupId: "trash-group",
    });
    mocks.deleteGroup.mockResolvedValue({
      success: true,
      trashGroupId: "trash-group",
    });
    mocks.emptyTrash.mockResolvedValue({ success: true, deletedCount: 1 });
    mocks.createGroup.mockResolvedValue({
      id: "group-2",
      notebookId: "notebook-3",
      pageId: "page-3",
    });
  });

  it("creates a new notebook and opens its untitled page on Enter", async () => {
    const user = userEvent.setup();

    const { container } = render(
      <SectionTabs
        groups={[
          { id: "group-1", name: "Work", notebookCount: 1, systemKey: null },
        ]}
        notebooks={[
          {
            id: "notebook-1",
            name: "Inbox",
            groupId: "group-1",
            pageIds: [],
          },
        ]}
      />,
    );

    await user.click(container.querySelector('button[title="زیر مجموعه جدید"]')!);

    const input = screen.getByRole("textbox");
    expect(input).toBeVisible();

    await user.type(input, "Sprint Notes{Enter}");

    await waitFor(() => {
      expect(mocks.createNotebook).toHaveBeenCalledWith("Sprint Notes", "group-1");
    });
    expect(mocks.createNotebook).toHaveBeenCalledTimes(1);
    expect(mocks.push).toHaveBeenCalledWith("/pages/page-2");
    expect(mocks.refresh).toHaveBeenCalled();
  });

  it("hides new notebook creation when no writable group exists", () => {
    render(<SectionTabs groups={[]} notebooks={[]} />);

    expect(screen.queryByTitle("زیر مجموعه جدید")).not.toBeInTheDocument();
    expect(screen.getByRole("button")).toBeInTheDocument();
    expect(mocks.createNotebook).not.toHaveBeenCalled();
  });

  it("creates a new group with an untitled notebook and opens its page", async () => {
    const user = userEvent.setup();

    render(<SectionTabs groups={[]} notebooks={[]} />);

    await user.click(screen.getByRole("button"));

    const input = screen.getByRole("textbox");
    await user.type(input, "Projects{Enter}");

    await waitFor(() => {
      expect(mocks.createGroup).toHaveBeenCalledWith("Projects");
    });
    expect(mocks.push).toHaveBeenCalledWith("/pages/page-3");
    expect(mocks.refresh).toHaveBeenCalled();
  });

  it("hides the new notebook button when the active page belongs to trash", () => {
    mocks.pathname = "/pages/page-trash";

    render(
      <SectionTabs
        groups={[
          { id: "group-1", name: "Work", notebookCount: 1, systemKey: null },
          {
            id: "trash-group",
            name: "Trash",
            notebookCount: 1,
            systemKey: "deleted-items",
          },
        ]}
        notebooks={[
          {
            id: "notebook-1",
            name: "Inbox",
            groupId: "group-1",
            pageIds: ["page-1"],
          },
          {
            id: "trash-pages",
            name: "Deleted Pages",
            groupId: "trash-group",
            deletedAt: new Date(),
            systemKey: "deleted-pages",
            pageIds: ["page-trash"],
          },
        ]}
      />,
    );

    expect(screen.queryByTitle("زیر مجموعه جدید")).not.toBeInTheDocument();
  });

  it("removes the new notebook action from the empty-area menu inside trash", () => {
    mocks.pathname = "/pages/page-trash";

    const { container } = render(
      <SectionTabs
        groups={[
          {
            id: "trash-group",
            name: "Trash",
            notebookCount: 1,
            systemKey: "deleted-items",
          },
        ]}
        notebooks={[
          {
            id: "trash-pages",
            name: "Deleted Pages",
            groupId: "trash-group",
            deletedAt: new Date(),
            systemKey: "deleted-pages",
            pageIds: ["page-trash"],
          },
        ]}
      />,
    );

    fireEvent.contextMenu(container.querySelector(".mt-2")!);
    const menu = mocks.openMenu.mock.calls[0][1];
    const itemIds = menu.items.map((item: { id: string }) => item.id);

    expect(itemIds).not.toContain("new-section");
    expect(itemIds).toContain("new-category");
  });

  it("navigates to the trash empty state after clearing trash", async () => {
    render(
      <SectionTabs
        groups={[
          {
            id: "trash-group",
            name: "Trash",
            notebookCount: 1,
            systemKey: "deleted-items",
          },
        ]}
        notebooks={[
          {
            id: "trash-pages",
            name: "Deleted Pages",
            groupId: "trash-group",
            deletedAt: new Date(),
            systemKey: "deleted-pages",
            pageIds: ["page-trash"],
          },
        ]}
      />,
    );

    const trashTab = screen.getByText("Trash");
    fireEvent.contextMenu(trashTab);
    const menu = mocks.openMenu.mock.calls.at(-1)?.[1];
    const emptyTrashAction = menu.items.find(
      (item: { id: string; onSelect?: () => void }) => item.id === "empty-trash",
    );

    emptyTrashAction.onSelect();

    await waitFor(() => {
      expect(mocks.emptyTrash).toHaveBeenCalledTimes(1);
    });
    expect(mocks.push).toHaveBeenCalledWith("/trash");
    expect(mocks.refresh).toHaveBeenCalled();
  });

  it("keeps the trash tab active on the trash route after reload", () => {
    mocks.pathname = "/trash";

    render(
      <SectionTabs
        groups={[
          { id: "group-1", name: "Work", notebookCount: 1, systemKey: null },
          {
            id: "trash-group",
            name: "Trash",
            notebookCount: 0,
            systemKey: "deleted-items",
          },
        ]}
        notebooks={[
          {
            id: "notebook-1",
            name: "Inbox",
            groupId: "group-1",
            pageIds: ["page-1"],
          },
        ]}
      />,
    );

    expect(screen.queryByTitle("زیر مجموعه جدید")).not.toBeInTheDocument();
  });

  it("does not switch to trash after deleting a notebook", async () => {
    render(
      <SectionTabs
        groups={[
          { id: "group-1", name: "Work", notebookCount: 2, systemKey: null },
          {
            id: "trash-group",
            name: "Trash",
            notebookCount: 1,
            systemKey: "deleted-items",
          },
        ]}
        notebooks={[
          {
            id: "notebook-1",
            name: "Inbox",
            groupId: "group-1",
            pageIds: ["page-1"],
          },
          {
            id: "notebook-2",
            name: "Docs",
            groupId: "group-1",
            pageIds: ["page-2"],
          },
          {
            id: "trash-pages",
            name: "Deleted Pages",
            groupId: "trash-group",
            deletedAt: new Date(),
            systemKey: "deleted-pages",
            pageIds: ["page-trash"],
          },
        ]}
      />,
    );

    fireEvent.contextMenu(screen.getByRole("link", { name: "Inbox" }));
    const menu = mocks.openMenu.mock.calls.at(-1)?.[1];
    const deleteAction = menu.items.find(
      (item: { id: string; onSelect?: () => void }) => item.id === "delete",
    );

    deleteAction.onSelect();

    await waitFor(() => {
      expect(mocks.archiveNotebook).toHaveBeenCalledWith("notebook-1");
    });
    expect(mocks.push).toHaveBeenCalledWith("/notebooks/notebook-2");
    expect(mocks.push).not.toHaveBeenCalledWith("/trash");
  });
});
