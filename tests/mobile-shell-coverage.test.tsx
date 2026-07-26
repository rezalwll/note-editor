import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ComponentProps } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { MobileShell } from "@/components/mobile-shell";

const mocks = vi.hoisted(() => ({
  archiveNotebook: vi.fn(),
  archivePage: vi.fn(),
  assignNotebookGroup: vi.fn(),
  clear: vi.fn(),
  createGroup: vi.fn(),
  createNotebook: vi.fn(),
  createPage: vi.fn(),
  deleteGroup: vi.fn(),
  deleteNotebookPermanently: vi.fn(),
  deletePagePermanently: vi.fn(),
  safeLogout: vi.fn(),
  pathname: "/notebooks/notebook-1",
  push: vi.fn(),
  record: vi.fn(),
  refresh: vi.fn(),
  renameGroup: vi.fn(),
  renameNotebook: vi.fn(),
  restoreGroup: vi.fn(),
  restorePage: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => mocks.pathname,
  useRouter: () => ({ push: mocks.push, refresh: mocks.refresh }),
}));

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: ComponentProps<"a">) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

vi.mock("@/components/brand-logo", () => ({ BrandLogo: () => <div>Brand</div> }));
vi.mock("@/components/editor-toolbar", () => ({ EditorToolbar: () => <div>Toolbar</div> }));
vi.mock("@/components/search-trigger", () => ({ SearchTrigger: () => <button>Search</button> }));
vi.mock("@/components/sync-status-indicator", () => ({
  SyncStatusIndicator: () => <div data-testid="mobile-sync">Sync</div>,
}));
vi.mock("@/components/workspace-history-provider", () => ({
  useWorkspaceHistory: () => ({ record: mocks.record, clear: mocks.clear }),
}));

vi.mock("@/app/actions", () => ({
  archiveNotebookInlineAction: mocks.archiveNotebook,
  archivePageInlineAction: mocks.archivePage,
  assignNotebookGroupInlineAction: mocks.assignNotebookGroup,
  createNotebookGroupInlineAction: mocks.createGroup,
  createNotebookInlineAction: mocks.createNotebook,
  createPageInlineAction: mocks.createPage,
  deleteNotebookGroupInlineAction: mocks.deleteGroup,
  deleteNotebookPermanentlyInlineAction: mocks.deleteNotebookPermanently,
  deletePagePermanentlyInlineAction: mocks.deletePagePermanently,
  renameNotebookGroupInlineAction: mocks.renameGroup,
  renameNotebookInlineAction: mocks.renameNotebook,
  restoreNotebookGroupInlineAction: mocks.restoreGroup,
  restorePageInlineAction: mocks.restorePage,
}));
vi.mock("@/lib/safe-logout", () => ({
  performSafeLogout: mocks.safeLogout,
}));

type Props = ComponentProps<typeof MobileShell>;

const deletedAt = new Date("2026-07-15T09:00:00.000Z");

function props(): Props {
  return {
    currentUser: { id: "user-1", username: "owner", displayName: "Owner" },
    groups: [
      { id: "group-1", name: "گروه اول", notebookCount: 2, themeKey: "sky", sortOrder: 3, systemKey: null },
      { id: "group-empty", name: "گروه خالی", notebookCount: 0, systemKey: null },
      { id: "trash-group", name: "حذف‌شده‌ها", notebookCount: 2, systemKey: "deleted-items" },
    ],
    notebooks: [
      {
        id: "notebook-1",
        name: "دفتر اول",
        groupId: "group-1",
        groupName: "گروه اول",
        themeKey: "sky",
        systemKey: null,
        deletedAt: null,
        pages: [
          { id: "page-1", title: "صفحه اول", updatedAt: new Date("2026-07-15T10:00:00Z"), deletedAt: null },
          { id: "page-2", title: "صفحه دوم", updatedAt: new Date("2026-07-15T09:00:00Z"), deletedAt: null },
        ],
      },
      {
        id: "system-notebook",
        name: "دفتر سیستمی",
        groupId: "group-1",
        groupName: "گروه اول",
        systemKey: "system",
        deletedAt: null,
        pages: [],
      },
      {
        id: "empty-notebook",
        name: "دفتر خالی",
        groupId: "group-1",
        groupName: "گروه اول",
        systemKey: null,
        deletedAt: null,
        pages: [],
      },
      {
        id: "deleted-notebook",
        name: "دفتر حذف شده",
        groupId: "trash-group",
        groupName: "حذف‌شده‌ها",
        systemKey: null,
        deletedAt,
        pages: [],
      },
      {
        id: "trash-pages",
        name: "صفحات حذف شده",
        groupId: "trash-group",
        groupName: "حذف‌شده‌ها",
        systemKey: "deleted-pages",
        deletedAt,
        pages: [{
          id: "trash-page",
          title: "صفحه حذف شده",
          updatedAt: deletedAt,
          deletedAt,
          originalNotebookId: "notebook-1",
        }],
      },
      {
        id: "ungrouped-notebook",
        name: "بدون گروه",
        groupId: null,
        groupName: null,
        systemKey: null,
        deletedAt: null,
        pages: [],
      },
    ],
  };
}

function renderShell(overrides: Partial<Props> = {}) {
  const base = props();
  return render(<MobileShell {...base} {...overrides} />);
}

function openSections() {
  fireEvent.click(screen.getByRole("button", { name: "باز کردن مجموعه‌ها" }));
}

function openPages() {
  fireEvent.click(screen.getByRole("button", { name: "صفحه‌ها" }));
}

function expandGroup(name: string) {
  fireEvent.click(screen.getByText(name).closest("button")!);
}

async function runHistoryCallbacks(index = mocks.record.mock.calls.length - 1) {
  const entry = mocks.record.mock.calls[index][0] as {
    undo: () => unknown;
    redo: () => unknown;
  };
  await entry.undo();
  await entry.redo();
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.pathname = "/notebooks/notebook-1";
  mocks.archiveNotebook.mockResolvedValue({});
  mocks.archivePage.mockResolvedValue({ notebookId: "notebook-1" });
  mocks.assignNotebookGroup.mockResolvedValue({});
  mocks.createGroup.mockResolvedValue({
    id: "new-group",
    notebookId: "new-notebook",
    pageId: "new-page",
    themeKey: "sky",
  });
  mocks.createNotebook.mockResolvedValue({
    id: "new-mobile-notebook",
    pageId: "new-mobile-page",
    themeKey: "mint",
  });
  mocks.createPage.mockResolvedValue({ id: "new-page" });
  mocks.deleteGroup.mockResolvedValue({ notebookIds: ["notebook-1"], wasEmpty: false });
  mocks.deleteNotebookPermanently.mockResolvedValue({});
  mocks.deletePagePermanently.mockResolvedValue({});
  mocks.renameGroup.mockResolvedValue({});
  mocks.renameNotebook.mockResolvedValue({});
  mocks.restoreGroup.mockResolvedValue({});
  mocks.restorePage.mockResolvedValue({});
  mocks.safeLogout.mockResolvedValue("completed");
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
    x: 20,
    y: 10,
    width: 40,
    height: 40,
    top: 10,
    right: 60,
    bottom: 50,
    left: 20,
    toJSON: () => ({}),
  });
});

describe("MobileShell panels and installation", () => {
  it("delegates mobile logout to the safe client workflow", async () => {
    renderShell();

    fireEvent.click(screen.getByRole("button", { name: /باز کردن پروفایل/ }));
    const profile = screen.getByText("@owner").closest("div.fixed")!;
    fireEvent.submit(profile.querySelector("form")!);

    await waitFor(() => expect(mocks.safeLogout).toHaveBeenCalledWith("user-1"));
    expect(mocks.safeLogout).toHaveBeenCalledOnce();
  });

  it("toggles every panel, positions profile and dismisses it inside/outside correctly", async () => {
    renderShell();
    expect(screen.getByTestId("mobile-sync")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "باز کردن پروفایل" }));
    expect(screen.getByText("@owner")).toBeInTheDocument();
    const profile = screen.getByText("@owner").closest("div.fixed")!;
    expect(profile).toHaveStyle({ top: "60px", left: "12px" });
    fireEvent.pointerDown(profile);
    expect(screen.getByText("@owner")).toBeInTheDocument();
    fireEvent.resize(window);
    fireEvent.scroll(window);
    fireEvent.pointerDown(document.body);
    await waitFor(() => expect(screen.queryByText("@owner")).not.toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: "پروفایل" }));
    expect(screen.getByText("@owner")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "پروفایل" }));
    expect(screen.queryByText("@owner")).not.toBeInTheDocument();

    openSections();
    expect(screen.getByText("گروه اول")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "باز کردن مجموعه‌ها" }));
    expect(screen.queryByText("گروه اول")).not.toBeInTheDocument();
    openPages();
    expect(screen.getByText("صفحه اول")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "صفحه‌ها" }));
    expect(screen.queryByText("صفحه اول")).not.toBeInTheDocument();
  });

  it("captures and runs the PWA install prompt", async () => {
    const prompt = vi.fn().mockResolvedValue(undefined);
    renderShell();
    await act(async () => {
      window.dispatchEvent(Object.assign(new Event("beforeinstallprompt"), { prompt }));
    });
    fireEvent.click(screen.getByRole("button", { name: "باز کردن پروفایل" }));
    fireEvent.click(screen.getByRole("button", { name: "نصب برنامه" }));
    await waitFor(() => expect(prompt).toHaveBeenCalled());
    await waitFor(() => expect(
      screen.queryByRole("button", { name: "نصب برنامه" }),
    ).not.toBeInTheDocument());
    fireEvent.click(screen.getByRole("link", { name: "تنظیمات" }));
  });

  it("opens sections from the bottom navigation and collapses a selected group", () => {
    renderShell();
    fireEvent.click(screen.getByRole("button", { name: "مجموعه‌ها" }));
    expandGroup("گروه اول");
    expect(screen.getByRole("button", { name: "دفتر اول" })).toBeInTheDocument();
    expandGroup("گروه اول");
    expect(screen.queryByRole("button", { name: "دفتر اول" })).not.toBeInTheDocument();
  });
});

describe("MobileShell group workflows", () => {
  it("creates a default-named group and records undo/redo", async () => {
    openSectionsAfterRender();
    fireEvent.click(screen.getByRole("button", { name: "مجموعه جدید" }));
    const input = screen.getByPlaceholderText("نام مجموعه جدید");
    fireEvent.change(input, { target: { value: "   " } });
    fireEvent.keyDown(input, { key: "Enter" });
    await waitFor(() => expect(mocks.createGroup).toHaveBeenCalled());
    expect(mocks.push).toHaveBeenCalledWith("/pages/new-page");
    expect(mocks.record).toHaveBeenCalled();
    await runHistoryCallbacks();
    expect(mocks.deleteGroup).toHaveBeenCalledWith("new-group");
    expect(mocks.restoreGroup).toHaveBeenCalled();
  });

  it("cancels group creation and ignores incomplete server results", async () => {
    openSectionsAfterRender();
    fireEvent.click(screen.getByRole("button", { name: "مجموعه جدید" }));
    const input = screen.getByPlaceholderText("نام مجموعه جدید");
    fireEvent.keyDown(input, { key: "Escape" });
    expect(screen.queryByPlaceholderText("نام مجموعه جدید")).not.toBeInTheDocument();

    const results = [{}, { id: "g" }, { id: "g", notebookId: "n" }];
    fireEvent.click(screen.getByRole("button", { name: "مجموعه جدید" }));
    const pendingInput = screen.getByPlaceholderText("نام مجموعه جدید");
    for (const [index, result] of results.entries()) {
      mocks.createGroup.mockResolvedValueOnce(result);
      fireEvent.keyDown(pendingInput, { key: "Enter" });
      await waitFor(() => expect(mocks.createGroup).toHaveBeenCalledTimes(index + 1));
    }
    expect(mocks.push).not.toHaveBeenCalled();
  });

  it("renames a group by Enter, cancels by Escape and records reversible changes", async () => {
    openSectionsAfterRender();
    fireEvent.click(screen.getByRole("button", { name: "عملیات گروه اول" }));
    fireEvent.click(screen.getByRole("button", { name: "تغییر نام مجموعه" }));
    const input = screen.getByDisplayValue("گروه اول");
    fireEvent.click(input);
    fireEvent.change(input, { target: { value: "گروه تازه" } });
    fireEvent.keyDown(input, { key: "Enter" });
    await waitFor(() => expect(mocks.renameGroup).toHaveBeenCalledWith("group-1", "گروه تازه"));
    await runHistoryCallbacks();
    expect(mocks.renameGroup).toHaveBeenCalledWith("group-1", "گروه اول");

    fireEvent.click(screen.getByRole("button", { name: "عملیات گروه تازه" }));
    fireEvent.click(screen.getByRole("button", { name: "تغییر نام مجموعه" }));
    fireEvent.keyDown(screen.getByDisplayValue("گروه تازه"), { key: "Escape" });
    expect(screen.queryByDisplayValue("گروه تازه")).not.toBeInTheDocument();
  });

  it("deletes a group and exercises both redo result shapes", async () => {
    openSectionsAfterRender();
    expandGroup("گروه اول");
    fireEvent.click(screen.getByRole("button", { name: "عملیات گروه اول" }));
    fireEvent.click(screen.getByRole("button", { name: "حذف مجموعه" }));
    await waitFor(() => expect(mocks.deleteGroup).toHaveBeenCalledWith("group-1"));
    const entry = mocks.record.mock.calls.at(-1)![0];
    await entry.undo();
    mocks.deleteGroup.mockResolvedValueOnce({});
    await entry.redo();
    mocks.deleteGroup.mockResolvedValueOnce({ notebookIds: ["notebook-1"], wasEmpty: true });
    await entry.redo();
    expect(mocks.restoreGroup).toHaveBeenCalled();
  });

  it("uses the unnamed fallback, missing theme fallback and default sort order", async () => {
    openSectionsAfterRender();
    fireEvent.click(screen.getByRole("button", { name: "عملیات گروه خالی" }));
    fireEvent.click(screen.getByRole("button", { name: "تغییر نام مجموعه" }));
    const renameInput = screen.getByDisplayValue("گروه خالی");
    fireEvent.change(renameInput, { target: { value: "   " } });
    fireEvent.blur(renameInput);
    await waitFor(() => expect(mocks.renameGroup).toHaveBeenCalledWith("group-empty", "مجموعه بدون عنوان"));

    fireEvent.click(screen.getByRole("button", { name: "عملیات مجموعه بدون عنوان" }));
    fireEvent.click(screen.getByRole("button", { name: "حذف مجموعه" }));
    await waitFor(() => expect(mocks.deleteGroup).toHaveBeenCalledWith("group-empty"));

    mocks.createGroup.mockResolvedValueOnce({ id: "g2", notebookId: "n2", pageId: "p2" });
    fireEvent.click(screen.getByRole("button", { name: "مجموعه جدید" }));
    fireEvent.keyDown(screen.getByPlaceholderText("نام مجموعه جدید"), { key: "Enter" });
    await waitFor(() => expect(mocks.push).toHaveBeenCalledWith("/pages/p2"));
    await runHistoryCallbacks();
    expect(mocks.restoreGroup).toHaveBeenLastCalledWith(expect.objectContaining({ themeKey: null }));
  });
});

describe("MobileShell notebook workflows", () => {
  it("creates a notebook inside a group and records reversible history", async () => {
    openSectionsAfterRender();

    fireEvent.click(
      screen.getByRole("button", { name: "افزودن زیر مجموعه به گروه اول" }),
    );
    const input = screen.getByPlaceholderText("نام زیر مجموعه جدید");
    fireEvent.change(input, { target: { value: "دفتر موبایل" } });
    fireEvent.keyDown(input, { key: "Enter" });

    await waitFor(() =>
      expect(mocks.createNotebook).toHaveBeenCalledWith(
        "دفتر موبایل",
        "group-1",
        expect.any(String),
      ),
    );
    expect(mocks.push).toHaveBeenCalledWith("/pages/new-mobile-page");
    await runHistoryCallbacks();
    expect(mocks.archiveNotebook).toHaveBeenCalledWith("new-mobile-notebook");
    expect(mocks.assignNotebookGroup).toHaveBeenCalledWith(
      ["new-mobile-notebook"],
      "group-1",
    );
  });

  it("cancels notebook creation and ignores incomplete server results", async () => {
    openSectionsAfterRender();

    fireEvent.click(
      screen.getByRole("button", { name: "افزودن زیر مجموعه به گروه اول" }),
    );
    fireEvent.keyDown(screen.getByPlaceholderText("نام زیر مجموعه جدید"), {
      key: "Escape",
    });
    expect(
      screen.queryByPlaceholderText("نام زیر مجموعه جدید"),
    ).not.toBeInTheDocument();

    mocks.createNotebook.mockResolvedValueOnce({ error: "failed" });
    fireEvent.click(
      screen.getByRole("button", { name: "افزودن زیر مجموعه به گروه اول" }),
    );
    const input = screen.getByPlaceholderText("نام زیر مجموعه جدید");
    fireEvent.change(input, { target: { value: "   " } });
    fireEvent.keyDown(input, { key: "Enter" });

    await waitFor(() =>
      expect(mocks.createNotebook).toHaveBeenCalledWith(
        "زیر مجموعه جدید",
        "group-1",
        expect.any(String),
      ),
    );
    expect(mocks.push).not.toHaveBeenCalled();
  });

  it("selects and renames a notebook with reversible history", async () => {
    openSectionsAfterRender();
    expandGroup("گروه اول");

    fireEvent.click(screen.getByRole("button", { name: "دفتر اول" }));
    expect(mocks.push).toHaveBeenCalledWith("/notebooks/notebook-1");
    expect(mocks.refresh).not.toHaveBeenCalled();

    openSections();
    fireEvent.click(screen.getByRole("button", { name: "عملیات دفتر اول" }));
    fireEvent.click(screen.getByRole("button", { name: "تغییر نام زیر مجموعه" }));
    const input = screen.getByDisplayValue("دفتر اول");
    fireEvent.change(input, { target: { value: "دفتر تازه" } });
    fireEvent.keyDown(input, { key: "Enter" });
    await waitFor(() => expect(mocks.renameNotebook).toHaveBeenCalledWith("notebook-1", "دفتر تازه"));
    await runHistoryCallbacks();
    expect(mocks.renameNotebook).toHaveBeenCalledWith("notebook-1", "دفتر اول");

    fireEvent.click(screen.getByRole("button", { name: "عملیات دفتر تازه" }));
    fireEvent.click(screen.getByRole("button", { name: "تغییر نام زیر مجموعه" }));
    fireEvent.keyDown(screen.getByDisplayValue("دفتر تازه"), { key: "Escape" });
    expect(screen.queryByDisplayValue("دفتر تازه")).not.toBeInTheDocument();
  });

  it("archives an active notebook and records undo/redo", async () => {
    openSectionsAfterRender();
    expandGroup("گروه اول");
    fireEvent.click(screen.getByRole("button", { name: "عملیات دفتر اول" }));
    fireEvent.click(screen.getByRole("button", { name: "انتقال زیر مجموعه به حذف‌شده‌ها" }));

    await waitFor(() => expect(mocks.archiveNotebook).toHaveBeenCalledWith("notebook-1"));
    expect(mocks.push).toHaveBeenCalledWith("/");
    await runHistoryCallbacks();
    expect(mocks.assignNotebookGroup).toHaveBeenCalledWith(["notebook-1"], "group-1");
  });

  it("uses the unnamed notebook fallback and archives a non-active notebook", async () => {
    openSectionsAfterRender();
    expandGroup("گروه اول");
    fireEvent.click(screen.getByRole("button", { name: "عملیات دفتر خالی" }));
    fireEvent.click(screen.getByRole("button", { name: "تغییر نام زیر مجموعه" }));
    const input = screen.getByDisplayValue("دفتر خالی");
    fireEvent.click(input);
    fireEvent.change(input, { target: { value: " " } });
    fireEvent.blur(input);
    await waitFor(() => expect(mocks.renameNotebook).toHaveBeenCalledWith(
      "empty-notebook",
      "زیر مجموعه بدون عنوان",
    ));

    fireEvent.click(screen.getByRole("button", { name: "عملیات زیر مجموعه بدون عنوان" }));
    fireEvent.click(screen.getByRole("button", { name: "انتقال زیر مجموعه به حذف‌شده‌ها" }));
    await waitFor(() => expect(mocks.archiveNotebook).toHaveBeenCalledWith("empty-notebook"));
    expect(mocks.push).not.toHaveBeenCalled();
  });

  it("permanently deletes a trashed notebook and clears structural history", async () => {
    mocks.pathname = "/notebooks/deleted-notebook";
    openSectionsAfterRender();
    expandGroup("حذف‌شده‌ها");
    fireEvent.click(screen.getByRole("button", { name: "عملیات دفتر حذف شده" }));
    expect(screen.queryByRole("button", { name: "تغییر نام زیر مجموعه" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "حذف دائمی زیر مجموعه" }));

    await waitFor(() => expect(mocks.deleteNotebookPermanently).toHaveBeenCalledWith("deleted-notebook"));
    expect(mocks.clear).toHaveBeenCalled();
    expect(mocks.push).toHaveBeenCalledWith("/");
  });

  it("does not offer operations for system notebooks and renders empty groups", () => {
    openSectionsAfterRender();
    expandGroup("گروه اول");
    expect(screen.queryByRole("button", { name: "عملیات دفتر سیستمی" })).not.toBeInTheDocument();
    expandGroup("گروه خالی");
    expect(screen.getByText("هنوز زیر مجموعه‌ای در این مجموعه نیست")).toBeInTheDocument();
  });
});

describe("MobileShell page workflows", () => {
  it("creates a named page and records undo/redo", async () => {
    mocks.pathname = "/pages/page-1";
    renderShell();
    openPages();
    fireEvent.click(screen.getByRole("button", { name: "صفحه جدید" }));
    const input = screen.getByPlaceholderText("صفحه بدون عنوان");
    fireEvent.change(input, { target: { value: "صفحه تازه" } });
    fireEvent.keyDown(input, { key: "Enter" });

    await waitFor(() => expect(mocks.createPage).toHaveBeenCalledWith("notebook-1", "صفحه تازه"));
    expect(mocks.push).toHaveBeenCalledWith("/pages/new-page");
    expect(mocks.refresh).not.toHaveBeenCalled();
    await runHistoryCallbacks();
    expect(mocks.archivePage).toHaveBeenCalledWith("new-page");
    expect(mocks.restorePage).toHaveBeenCalledWith("new-page");
  });

  it("keeps creation open when the server does not return an id", async () => {
    mocks.createPage.mockResolvedValueOnce({});
    renderShell();
    openPages();
    fireEvent.click(screen.getByRole("button", { name: "صفحه جدید" }));
    const input = screen.getByPlaceholderText("صفحه بدون عنوان");
    fireEvent.blur(input);
    await waitFor(() => expect(mocks.createPage).toHaveBeenCalledWith("notebook-1", "صفحه بدون عنوان"));
    expect(screen.getByPlaceholderText("صفحه بدون عنوان")).toBeInTheDocument();
  });

  it("switches notebooks from the pages panel", () => {
    renderShell();
    openPages();
    fireEvent.click(screen.getByRole("link", { name: "دفتر خالی" }));
    expect(screen.getByText("این زیر مجموعه هنوز صفحه‌ای ندارد.")).toBeInTheDocument();
  });

  it("archives the active page and records reversible history", async () => {
    mocks.pathname = "/pages/page-1";
    renderShell();
    openPages();
    fireEvent.click(screen.getByRole("button", { name: "عملیات صفحه اول" }));
    fireEvent.click(screen.getByRole("button", { name: "حذف صفحه" }));

    await waitFor(() => expect(mocks.archivePage).toHaveBeenCalledWith("page-1"));
    expect(mocks.push).toHaveBeenCalledWith("/notebooks/notebook-1");
    await runHistoryCallbacks();
  });

  it("restores and permanently deletes a trashed page", async () => {
    mocks.pathname = "/pages/trash-page";
    renderShell();
    openPages();
    fireEvent.click(screen.getByRole("button", { name: "عملیات صفحه حذف شده" }));
    fireEvent.click(screen.getByRole("button", { name: "بازیابی صفحه" }));
    await waitFor(() => expect(mocks.restorePage).toHaveBeenCalledWith("trash-page"));
    expect(mocks.push).toHaveBeenCalledWith("/pages/trash-page");
    await runHistoryCallbacks();

    fireEvent.click(screen.getByRole("button", { name: "عملیات صفحه حذف شده" }));
    fireEvent.click(screen.getByRole("button", { name: "حذف دائمی صفحه" }));
    await waitFor(() => expect(mocks.deletePagePermanently).toHaveBeenCalledWith("trash-page"));
    expect(mocks.clear).toHaveBeenCalled();
    expect(mocks.push).toHaveBeenCalledWith("/notebooks/trash-pages");
  });

  it("refreshes in place after changing pages that are not active", async () => {
    mocks.pathname = "/pages/page-2";
    const activeNotebookView = renderShell();
    openPages();

    fireEvent.click(screen.getByRole("button", { name: "عملیات صفحه اول" }));
    fireEvent.click(screen.getByRole("button", { name: "حذف صفحه" }));
    await waitFor(() => expect(mocks.archivePage).toHaveBeenCalledWith("page-1"));

    activeNotebookView.unmount();
    mocks.pathname = "/notebooks/trash-pages";
    renderShell();
    openPages();

    fireEvent.click(screen.getByRole("button", { name: "عملیات صفحه حذف شده" }));
    fireEvent.click(screen.getByRole("button", { name: "بازیابی صفحه" }));
    await waitFor(() => expect(mocks.restorePage).toHaveBeenCalledWith("trash-page"));

    fireEvent.click(screen.getByRole("button", { name: "عملیات صفحه حذف شده" }));
    fireEvent.click(screen.getByRole("button", { name: "حذف دائمی صفحه" }));
    await waitFor(() => expect(mocks.deletePagePermanently).toHaveBeenCalledWith("trash-page"));

    expect(mocks.refresh).toHaveBeenCalledTimes(3);
    expect(mocks.push).not.toHaveBeenCalled();
  });

  it("renders the no-page and no-selection states", () => {
    mocks.pathname = "/notebooks/empty-notebook";
    const view = renderShell();
    openPages();
    expect(screen.getByText("این زیر مجموعه هنوز صفحه‌ای ندارد.")).toBeInTheDocument();
    view.unmount();

    mocks.pathname = "/";
    renderShell({ groups: [], notebooks: [] });
    openPages();
    expect(screen.getByText("هنوز زیر مجموعه‌ای برای این مجموعه انتخاب نشده است.")).toBeInTheDocument();
  });
});

function openSectionsAfterRender() {
  renderShell();
  openSections();
}
