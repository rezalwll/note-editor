import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentProps } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { MobileShell } from "@/components/mobile-shell";
import {
  dispatchGroupRenamed,
  dispatchNotebookRenamed,
} from "@/lib/page-events";

const mocks = vi.hoisted(() => ({
  pathname: "/notebooks/notebook-1",
  push: vi.fn(),
  refresh: vi.fn(),
  safeLogout: vi.fn(),
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

vi.mock("@/components/brand-logo", () => ({
  BrandLogo: () => <div>Brand</div>,
}));

vi.mock("@/components/editor-toolbar", () => ({
  EditorToolbar: () => <div>Toolbar</div>,
}));

vi.mock("@/app/actions", () => ({
  archiveNotebookInlineAction: vi.fn(),
  archivePageInlineAction: vi.fn(),
  assignNotebookGroupInlineAction: vi.fn(),
  createNotebookGroupInlineAction: vi.fn(),
  createNotebookInlineAction: vi.fn(),
  createPageInlineAction: vi.fn(),
  deleteNotebookGroupInlineAction: vi.fn(),
  deleteNotebookPermanentlyInlineAction: vi.fn(),
  deletePagePermanentlyInlineAction: vi.fn(),
  renameNotebookGroupInlineAction: vi.fn(),
  renameNotebookInlineAction: vi.fn(),
  restoreNotebookGroupInlineAction: vi.fn(),
  restorePageInlineAction: vi.fn(),
}));

vi.mock("@/lib/safe-logout", () => ({
  performSafeLogout: mocks.safeLogout,
}));

describe("MobileShell", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.pathname = "/notebooks/notebook-1";
    mocks.safeLogout.mockResolvedValue("completed");
  });

  it("updates group and notebook labels immediately after rename events", async () => {
    const user = userEvent.setup();

    render(
      <MobileShell
        groups={[
          {
            id: "group-1",
            name: "مجموعه اول",
            notebookCount: 1,
            systemKey: null,
          },
        ]}
        notebooks={[
          {
            id: "notebook-1",
            name: "زیر مجموعه اول",
            groupId: "group-1",
            groupName: "مجموعه اول",
            pages: [
              {
                id: "page-1",
                title: "صفحه اول",
                updatedAt: new Date("2026-06-22T10:00:00.000Z"),
                deletedAt: null,
              },
            ],
            deletedAt: null,
          },
        ]}
        currentUser={{
          id: "user-1",
          username: "user1",
          displayName: "User One",
        }}
      />,
    );

    await user.click(screen.getByRole("button", { name: "باز کردن مجموعه‌ها" }));
    await user.click(screen.getByText("مجموعه اول").closest("button")!);

    dispatchGroupRenamed({
      groupId: "group-1",
      name: "مجموعه تغییر کرده",
    });
    dispatchNotebookRenamed({
      notebookId: "notebook-1",
      name: "زیر مجموعه تغییر کرده",
    });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "1 مجموعه تغییر کرده" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "زیر مجموعه تغییر کرده" })).toBeInTheDocument();
    });
  });
  it("renders the sync status indicator in the note header", () => {
    mocks.pathname = "/pages/page-1";
    render(
      <MobileShell
        groups={[]}
        notebooks={[]}
        currentUser={{
          id: "user-1",
          username: "user1",
          displayName: "User One",
        }}
      />,
    );

    expect(screen.getByTestId("sync-status-indicator")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "بازگشت" })).toBeInTheDocument();
  });
});
