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
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/notebooks/notebook-1",
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
    mocks.createNotebook.mockResolvedValue({ id: "notebook-2" });
  });

  it("keeps the new notebook draft visible and creates it on Enter", async () => {
    const user = userEvent.setup();

    render(
      <SectionTabs
        groups={[
          { id: "group-1", name: "کار", notebookCount: 1, systemKey: null },
        ]}
        notebooks={[
          { id: "notebook-1", name: "دفتر اول", groupId: "group-1" },
        ]}
      />,
    );

    await user.click(screen.getByTitle("دفتر جدید"));

    const input = screen.getByRole("textbox");
    expect(input).toBeVisible();

    await user.type(input, "دفتر تست{Enter}");

    await waitFor(() => {
      expect(mocks.createNotebook).toHaveBeenCalledWith("دفتر تست", "group-1");
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
          { id: "notebook-1", name: "دفتر اول", groupId: null },
        ]}
      />,
    );

    await user.click(screen.getByTitle("دفتر جدید"));
    const input = screen.getByRole("textbox");
    fireEvent.keyDown(input, { key: "Escape" });

    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(mocks.createNotebook).not.toHaveBeenCalled();
  });
});
