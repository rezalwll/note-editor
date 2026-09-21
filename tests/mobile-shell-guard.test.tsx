import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";

import { MobileShell } from "@/components/mobile-shell";

const mocks = vi.hoisted(() => ({
  createNotebook: vi.fn(),
  pathname: "/workspace",
}));

vi.mock("next/navigation", () => ({
  usePathname: () => mocks.pathname,
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

vi.mock("@/components/mobile-shell-view", () => ({
  MobileShellView: ({
    startCreateGroup,
    startCreateNotebook,
    startCreatePage,
    submitCreateNotebook,
  }: {
    startCreateGroup: () => void;
    startCreateNotebook: () => void;
    startCreatePage: () => void;
    submitCreateNotebook: () => void;
  }) => (
    <>
      <button type="button" onClick={submitCreateNotebook}>
        ثبت زیر مجموعه بدون مقصد
      </button>
      <button type="button" onClick={startCreatePage}>شروع صفحه محافظت‌شده</button>
      <button type="button" onClick={startCreateNotebook}>شروع زیرمجموعه محافظت‌شده</button>
      <button type="button" onClick={startCreateGroup}>شروع مجموعه</button>
    </>
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

it("guards contextual create actions when there is no active destination", () => {
  render(
    <MobileShell
      groups={[]}
      notebooks={[]}
      currentUser={{ id: "user-1", username: "owner", displayName: "Owner" }}
    />,
  );

  fireEvent.click(screen.getByRole("button", { name: "شروع صفحه محافظت‌شده" }));
  fireEvent.click(screen.getByRole("button", { name: "شروع زیرمجموعه محافظت‌شده" }));
  fireEvent.click(screen.getByRole("button", { name: "شروع مجموعه" }));

  expect(mocks.createNotebook).not.toHaveBeenCalled();
});

it("guards contextual create actions in deleted system destinations", () => {
  render(
    <MobileShell
      groups={[
        {
          id: "trash-group",
          name: "حذف‌شده‌ها",
          notebookCount: 1,
          systemKey: "deleted-items",
        },
      ]}
      notebooks={[
        {
          id: "deleted-notebook",
          name: "حذف شده",
          groupId: "trash-group",
          groupName: "حذف‌شده‌ها",
          systemKey: null,
          pages: [],
          deletedAt: new Date("2026-08-23T00:00:00.000Z"),
        },
      ]}
      currentUser={{ id: "user-1", username: "owner", displayName: "Owner" }}
    />,
  );

  fireEvent.click(screen.getByRole("button", { name: "شروع صفحه محافظت‌شده" }));
  fireEvent.click(screen.getByRole("button", { name: "شروع زیرمجموعه محافظت‌شده" }));

  expect(mocks.createNotebook).not.toHaveBeenCalled();
});
