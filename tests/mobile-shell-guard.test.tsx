import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";

import { MobileShell } from "@/components/mobile-shell";

const mocks = vi.hoisted(() => ({
  createNotebook: vi.fn(),
  pathname: "/",
}));

vi.mock("next/navigation", () => ({
  usePathname: () => mocks.pathname,
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

vi.mock("@/components/mobile-shell-view", () => ({
  MobileShellView: ({
    submitCreateNotebook,
  }: {
    submitCreateNotebook: () => void;
  }) => (
    <button type="button" onClick={submitCreateNotebook}>
      ثبت زیر مجموعه بدون مقصد
    </button>
  ),
}));

vi.mock("@/components/workspace-history-provider", () => ({
  useWorkspaceHistory: () => ({ record: vi.fn(), clear: vi.fn() }),
}));

vi.mock("@/app/actions", () => ({
  archiveNotebookInlineAction: vi.fn(),
  archivePageInlineAction: vi.fn(),
  assignNotebookGroupInlineAction: vi.fn(),
  createNotebookGroupInlineAction: vi.fn(),
  createNotebookInlineAction: mocks.createNotebook,
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
  performSafeLogout: vi.fn(),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

it("ignores notebook submission when no target group is selected", () => {
  render(
    <MobileShell
      groups={[]}
      notebooks={[]}
      currentUser={{
        id: "user-1",
        username: "owner",
        displayName: "Owner",
      }}
    />,
  );

  fireEvent.click(
    screen.getByRole("button", { name: "ثبت زیر مجموعه بدون مقصد" }),
  );

  expect(mocks.createNotebook).not.toHaveBeenCalled();
});
