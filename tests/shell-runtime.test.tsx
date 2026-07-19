import { act, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSidebarData: vi.fn(),
  requireUser: vi.fn(),
  activateSync: vi.fn(),
  bootstrap: vi.fn(),
  sync: vi.fn(),
  registerPrivateDataTab: vi.fn(),
  unregisterPrivateDataTab: vi.fn(),
  unregister: vi.fn(),
  register: vi.fn(),
  cacheDelete: vi.fn(),
  pathname: "/",
}));

vi.mock("@/lib/queries", () => ({ getSidebarData: mocks.getSidebarData }));
vi.mock("@/lib/auth", () => ({ requireUser: mocks.requireUser }));
vi.mock("@/lib/trash", () => ({
  TRASH_GROUP_SYSTEM_KEY: "deleted-items",
  TRASH_PAGES_NOTEBOOK_SYSTEM_KEY: "deleted-pages",
}));
vi.mock("@/lib/sync/client", () => ({
  activateOfflineSync: mocks.activateSync,
  bootstrapOfflineState: mocks.bootstrap,
  processSyncQueue: mocks.sync,
}));
vi.mock("@/lib/private-data-coordinator", () => ({
  registerPrivateDataTab: mocks.registerPrivateDataTab,
}));
vi.mock("next/navigation", () => ({
  usePathname: () => mocks.pathname,
}));
vi.mock("next/font/local", () => ({ default: () => ({ variable: "font-variable" }) }));
vi.mock("@/components/context-menu", () => ({ ContextMenuProvider: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
vi.mock("@/components/mobile-shell", () => ({ MobileShell: () => <div>Mobile shell</div> }));
vi.mock("@/components/global-search-overlay", () => ({ GlobalSearchOverlay: () => <div>Search overlay</div> }));
vi.mock("@/components/brand-logo", () => ({ BrandLogo: () => <div>Brand</div> }));
vi.mock("@/components/search-trigger", () => ({ SearchTrigger: () => <button>Search</button> }));
vi.mock("@/components/editor-toolbar", () => ({ EditorToolbar: () => <div>Toolbar</div> }));
vi.mock("@/components/desktop-profile-menu", () => ({ DesktopProfileMenu: () => <div>Profile menu</div> }));
vi.mock("@/components/section-tabs", () => ({ SectionTabs: () => <div>Section tabs</div> }));
vi.mock("@/components/pages-sidebar", () => ({ PagesSidebar: () => <aside>Pages</aside> }));
vi.mock("@/components/shell-content-layout", () => ({ ShellContentLayout: ({ children }: { children: React.ReactNode }) => <main>{children}</main> }));
vi.mock("@/components/workspace-history-provider", () => ({ WorkspaceHistoryProvider: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
import ProtectedLayout from "@/app/(protected)/layout";
import RootLayout from "@/app/layout";
import manifest from "@/app/manifest";
import { AppShell } from "@/components/app-shell";
import { AuthenticatedRuntime } from "@/components/authenticated-runtime";
import { PwaRuntime } from "@/components/pwa-runtime";

const user = { id: "user-1", username: "owner", displayName: "Owner" };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireUser.mockResolvedValue(user);
  mocks.bootstrap.mockResolvedValue(undefined);
  mocks.sync.mockResolvedValue(undefined);
  mocks.registerPrivateDataTab.mockReturnValue(mocks.unregisterPrivateDataTab);
  mocks.unregister.mockResolvedValue(true);
  mocks.register.mockResolvedValue(undefined);
  mocks.cacheDelete.mockResolvedValue(true);
  mocks.pathname = "/";
  document.cookie = "notava_last_page_user-1=; Path=/; Max-Age=0";
});

describe("application shell and runtimes", () => {
  it("maps sidebar records into the responsive application shell", async () => {
    mocks.getSidebarData.mockResolvedValue({
      groups: [{
        id: "group-1", name: "Group", themeKey: "iris", systemKey: null,
        sortOrder: 0, _count: { notebooks: 1 },
      }],
      notebooks: [{
        id: "notebook-1", name: "Notebook", sortOrder: 0, themeKey: "sky",
        systemKey: null, deletedAt: null, group: { id: "group-1", name: "Group" },
        pages: [{
          id: "page-1", title: "Page", updatedAt: new Date(), deletedAt: null,
          originalNotebookId: null, sortOrder: 0,
        }],
      }],
    });

    render(await AppShell({ currentUser: user, children: <div>Workspace</div> }));
    expect(screen.getByText("Mobile shell")).toBeInTheDocument();
    expect(screen.getByText("Section tabs")).toBeInTheDocument();
    expect(screen.getByText("Workspace")).toBeInTheDocument();
  });

  it("boots offline sync and retries on browser lifecycle events", async () => {
    const view = render(<AuthenticatedRuntime userId="user-1" />);
    expect(mocks.registerPrivateDataTab).toHaveBeenCalledWith("user-1");
    expect(mocks.activateSync).toHaveBeenCalledWith("user-1");
    await waitFor(() => expect(mocks.bootstrap).toHaveBeenCalledWith("user-1"));
    await waitFor(() => expect(mocks.sync).toHaveBeenCalled());

    act(() => {
      window.dispatchEvent(new Event("online"));
      window.dispatchEvent(new Event("focus"));
    });
    expect(mocks.sync.mock.calls.length).toBeGreaterThanOrEqual(3);

    view.unmount();
    expect(mocks.unregisterPrivateDataTab).toHaveBeenCalledOnce();
  });

  it("remembers the last visited page for the current user", async () => {
    mocks.pathname = "/pages/page-9";

    render(<AuthenticatedRuntime userId="user-1" />);

    await waitFor(() => {
      expect(document.cookie).toContain("notava_last_page_user-1=page-9");
    });
  });

  it("cleans stale development service workers and caches", async () => {
    Object.defineProperty(navigator, "serviceWorker", {
      configurable: true,
      value: {
        getRegistrations: vi.fn().mockResolvedValue([{ unregister: mocks.unregister }]),
        register: mocks.register,
      },
    });
    vi.stubGlobal("caches", {
      keys: vi.fn().mockResolvedValue(["old-cache"]),
      delete: mocks.cacheDelete,
    });

    render(<PwaRuntime />);
    await waitFor(() => expect(mocks.unregister).toHaveBeenCalled());
    expect(mocks.cacheDelete).toHaveBeenCalledWith("old-cache");
    expect(mocks.register).not.toHaveBeenCalled();
  });

  it("builds root/protected layouts and the install manifest", async () => {
    expect(manifest()).toMatchObject({ name: "notava", display: "standalone" });
    const root = RootLayout({ children: <div>Root child</div> });
    expect(root.type).toBe("html");

    const protectedNode = await ProtectedLayout({ children: <div>Protected child</div> });
    expect(protectedNode).toBeTruthy();
  });
});
