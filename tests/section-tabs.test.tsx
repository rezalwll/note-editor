import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentProps } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { SectionTabs } from "@/components/section-tabs";

const mocks = vi.hoisted(() => ({
  createNotebook: vi.fn(),
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
  archiveNotebookInlineAction: vi.fn(),
  assignNotebookGroupInlineAction: vi.fn(),
  createNotebookGroupInlineAction: vi.fn(),
  createNotebookInlineAction: mocks.createNotebook,
  deleteNotebookPermanentlyInlineAction: vi.fn(),
  deleteNotebookGroupInlineAction: vi.fn(),
  emptyTrashInlineAction: vi.fn(),
  renameNotebookGroupInlineAction: vi.fn(),
  renameNotebookInlineAction: vi.fn(),
}));

describe("SectionTabs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.pathname = "/notebooks/notebook-1";
    mocks.createNotebook.mockResolvedValue({ id: "notebook-2" });
  });

  it("keeps the new notebook draft visible and creates it on Enter", async () => {
    const user = userEvent.setup();

    render(
      <SectionTabs
        groups={[
          { id: "group-1", name: "Ú©Ø§Ø±", notebookCount: 1, systemKey: null },
        ]}
        notebooks={[
          {
            id: "notebook-1",
            name: "Ø¯ÙØªØ± Ø§ÙˆÙ„",
            groupId: "group-1",
            pageIds: [],
          },
        ]}
      />,
    );

    await user.click(screen.getByTitle("دفتر جدید"));

    const input = screen.getByRole("textbox");
    expect(input).toBeVisible();

    await user.type(input, "Ø¯ÙØªØ± ØªØ³Øª{Enter}");

    await waitFor(() => {
      expect(mocks.createNotebook).toHaveBeenCalledWith("Ø¯ÙØªØ± ØªØ³Øª", "group-1");
    });
    expect(mocks.createNotebook).toHaveBeenCalledTimes(1);
    expect(mocks.push).toHaveBeenCalledWith("/notebooks/notebook-2");
    expect(mocks.refresh).toHaveBeenCalled();
  });

  it("cancels an unsaved draft without calling the server", async () => {
    const user = userEvent.setup();

    render(
      <SectionTabs
        groups={[]}
        notebooks={[
          {
            id: "notebook-1",
            name: "Ø¯ÙØªØ± Ø§ÙˆÙ„",
            groupId: null,
            pageIds: [],
          },
        ]}
      />,
    );

    await user.click(screen.getByTitle("دفتر جدید"));
    const input = screen.getByRole("textbox");
    fireEvent.keyDown(input, { key: "Escape" });

    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(mocks.createNotebook).not.toHaveBeenCalled();
  });

  it("hides the new notebook button when the active page belongs to trash", () => {
    mocks.pathname = "/pages/page-trash";

    render(
      <SectionTabs
        groups={[
          { id: "group-1", name: "Ú©Ø§Ø±", notebookCount: 1, systemKey: null },
          {
            id: "trash-group",
            name: "Ø­Ø°Ùâ€ŒØ´Ø¯Ù‡â€ŒÙ‡Ø§",
            notebookCount: 1,
            systemKey: "deleted-items",
          },
        ]}
        notebooks={[
          {
            id: "notebook-1",
            name: "Ø¯ÙØªØ± Ø§ÙˆÙ„",
            groupId: "group-1",
            pageIds: ["page-1"],
          },
          {
            id: "trash-pages",
            name: "ØµÙØ­Ù‡â€ŒÙ‡Ø§ÛŒ Ø­Ø°Ùâ€ŒØ´Ø¯Ù‡",
            groupId: "trash-group",
            deletedAt: new Date(),
            systemKey: "deleted-pages",
            pageIds: ["page-trash"],
          },
        ]}
      />,
    );

    expect(screen.queryByTitle("دفتر جدید")).not.toBeInTheDocument();
  });

  it("removes the new notebook action from the empty-area menu inside trash", () => {
    mocks.pathname = "/pages/page-trash";

    const { container } = render(
      <SectionTabs
        groups={[
          {
            id: "trash-group",
            name: "Ø­Ø°Ùâ€ŒØ´Ø¯Ù‡â€ŒÙ‡Ø§",
            notebookCount: 1,
            systemKey: "deleted-items",
          },
        ]}
        notebooks={[
          {
            id: "trash-pages",
            name: "ØµÙØ­Ù‡â€ŒÙ‡Ø§ÛŒ Ø­Ø°Ùâ€ŒØ´Ø¯Ù‡",
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
});
