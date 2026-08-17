import { render, screen } from "@testing-library/react";
import type { ComponentProps } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  groupFindMany: vi.fn(),
  notebookFindMany: vi.fn(),
  notebookFindFirst: vi.fn(),
  pageFindFirst: vi.fn(),
  cookieGet: vi.fn(),
  redirect: vi.fn(),
  notFound: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ requireUser: mocks.requireUser }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    notebookGroup: { findMany: mocks.groupFindMany },
    notebook: { findMany: mocks.notebookFindMany, findFirst: mocks.notebookFindFirst },
    page: { findFirst: mocks.pageFindFirst },
  },
}));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: mocks.cookieGet }),
}));
vi.mock("next/navigation", () => ({
  redirect: mocks.redirect,
  notFound: mocks.notFound,
}));
vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: ComponentProps<"a">) => <a href={href} {...props}>{children}</a>,
}));
vi.mock("@/components/editor/note-editor", () => ({
  NoteEditor: (props: { pageId: string }) => <div data-testid="note-editor">{props.pageId}</div>,
}));
vi.mock("@/components/forms/login-form", () => ({ LoginForm: () => <div>Login form</div> }));
vi.mock("@/components/forms/signup-form", () => ({ SignupForm: ({ initialEmail }: { initialEmail?: string }) => <div>Signup {initialEmail}</div> }));
vi.mock("@/components/forms/signup-verification-form", () => ({ SignupVerificationForm: ({ email }: { email: string }) => <div>Verify {email}</div> }));
vi.mock("@/components/forms/forgot-password-form", () => ({ ForgotPasswordForm: () => <div>Forgot form</div> }));
vi.mock("@/components/forms/reset-password-form", () => ({ ResetPasswordForm: ({ token }: { token: string }) => <div>Reset {token}</div> }));
vi.mock("@/components/forms/profile-form", () => ({ ProfileForm: () => <div>Profile form</div> }));
vi.mock("@/components/forms/password-form", () => ({ PasswordForm: () => <div>Password form</div> }));
vi.mock("@/components/forms/logout-form", () => ({ LogoutForm: () => <div>Logout form</div> }));
vi.mock("@/components/forms/workspace-portability-card", () => ({ WorkspacePortabilityCard: () => <div>Portability</div> }));
vi.mock("@/lib/email-auth", () => ({ getSupportEmail: () => "help@notava.test" }));

import DashboardPage from "@/app/(protected)/workspace/page";
import NotebookPage, { generateMetadata as notebookMetadata } from "@/app/(protected)/notebooks/[id]/page";
import PageView, { generateMetadata as pageMetadata } from "@/app/(protected)/pages/[id]/page";
import SettingsPage from "@/app/(protected)/settings/page";
import SecurityPage from "@/app/(protected)/settings/security/page";
import TrashEmptyPage from "@/app/(protected)/trash/page";
import ForgotPasswordPage from "@/app/forgot-password/page";
import LoginPage from "@/app/login/page";
import ResetPasswordPage from "@/app/reset-password/page";
import SignupPage from "@/app/signup/page";
import SignupVerifyPage from "@/app/signup/verify/page";

const user = {
  id: "user-1",
  username: "owner",
  displayName: "Owner",
  email: "owner@example.com",
  mustChangePassword: true,
  createdAt: new Date("2026-07-14T10:00:00.000Z"),
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireUser.mockResolvedValue(user);
  mocks.cookieGet.mockReturnValue(undefined);
});

describe("protected page routes", () => {
  it("renders the dashboard empty state", async () => {
    mocks.groupFindMany.mockResolvedValue([{ id: "group-1", name: "Group" }]);
    mocks.notebookFindMany.mockResolvedValue([]);
    render(await DashboardPage());
    expect(screen.getByRole("heading", { name: "سلام، Owner" })).toBeInTheDocument();
    expect(screen.getByText("اولین صفحه‌ات را بساز")).toBeInTheDocument();
  });

  it("renders the most recently edited page as continue writing", async () => {
    mocks.groupFindMany.mockResolvedValue([{ id: "group-1", name: "کار", systemKey: null }]);
    mocks.notebookFindMany.mockResolvedValue([
      {
        id: "notebook-1",
        name: "پروژه",
        groupId: "group-1",
        group: { id: "group-1", name: "کار" },
        systemKey: null,
        deletedAt: null,
        pages: [
          {
            id: "page-recent",
            title: "ایده تازه",
            updatedAt: new Date("2026-08-23T10:00:00.000Z"),
            deletedAt: null,
          },
        ],
      },
    ]);

    render(await DashboardPage());

    expect(screen.getAllByRole("link", { name: /ایده تازه/ })[0]).toHaveAttribute(
      "href",
      "/pages/page-recent",
    );
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it("summarizes collection note counts on the dashboard", async () => {
    mocks.groupFindMany.mockResolvedValue([
      { id: "group-1", name: "کار", systemKey: null },
    ]);
    mocks.notebookFindMany.mockResolvedValue([
      {
        id: "notebook-1",
        name: "پروژه",
        groupId: "group-1",
        group: { id: "group-1", name: "کار" },
        systemKey: null,
        deletedAt: null,
        pages: [
          { id: "page-1", title: "یک", updatedAt: new Date(), deletedAt: null },
          { id: "page-2", title: "دو", updatedAt: new Date(), deletedAt: null },
        ],
      },
    ]);

    render(await DashboardPage());

    expect(screen.getByText("۲ یادداشت")).toBeInTheDocument();
  });

  it("renders a notebook without pages and generates its metadata", async () => {
    mocks.notebookFindFirst.mockResolvedValue({
      id: "notebook-1", name: "Notebook", archived: false, themeKey: null, pages: [],
    });
    const props = { params: Promise.resolve({ id: "notebook-1" }) };
    expect(await notebookMetadata(props)).toEqual({ title: expect.stringContaining("Notebook") });
    render(await NotebookPage(props));
    const heading = screen.getByRole("heading");
    expect(heading).toHaveTextContent("Notebook");
    const emptyNotebookSurface = heading.parentElement?.parentElement?.parentElement;
    expect(emptyNotebookSurface).toHaveClass("xl:h-full", "xl:min-h-0");
    expect(emptyNotebookSurface?.parentElement).toHaveClass("h-full");
    expect(emptyNotebookSurface?.parentElement?.parentElement).toHaveClass(
      "xl:pt-[6px]",
    );
  });

  it("renders an editable page and generates its metadata", async () => {
    mocks.pageFindFirst.mockResolvedValue({
      id: "page-1",
      title: "My Page",
      bodyHtml: "<p>Hello</p>",
      updatedAt: new Date("2026-07-14T10:00:00.000Z"),
      archived: false,
      notebook: { id: "notebook-1", archived: false, themeKey: null },
      attachments: [{ id: "a1", fileName: "x.png", mimeType: "image/png", sizeBytes: 1 }],
      tags: [],
    });
    const props = { params: Promise.resolve({ id: "page-1" }) };
    expect(await pageMetadata(props)).toEqual({ title: "notava" });
    render(await PageView(props));
    expect(screen.getByTestId("note-editor")).toHaveTextContent("page-1");
  });

  it("renders settings and trash and redirects the legacy security page", async () => {
    render(await SettingsPage());
    expect(screen.getByText("Profile form")).toBeInTheDocument();
    render(<TrashEmptyPage />);
    expect(screen.getAllByRole("heading").length).toBeGreaterThan(0);
    SecurityPage();
    expect(mocks.redirect).toHaveBeenCalledWith("/settings");
  });
});

describe("public authentication pages", () => {
  it("renders login success, signup and forgot password screens", async () => {
    render(await LoginPage({ searchParams: Promise.resolve({ passwordReset: "success" }) }));
    expect(screen.getByText("Login form")).toBeInTheDocument();
    render(await SignupPage({ searchParams: Promise.resolve({ email: "new@example.com" }) }));
    expect(screen.getByText(/Signup new@example.com/)).toBeInTheDocument();
    render(<ForgotPasswordPage />);
    expect(screen.getByText("Forgot form")).toBeInTheDocument();
  });

  it("renders both valid and missing reset/verification parameters", async () => {
    const reset = await ResetPasswordPage({ searchParams: Promise.resolve({ token: "token-1" }) });
    const { unmount } = render(reset);
    expect(screen.getByText("Reset token-1")).toBeInTheDocument();
    unmount();
    render(await ResetPasswordPage({ searchParams: Promise.resolve({}) }));
    expect(screen.getByRole("link")).toHaveAttribute("href", "/forgot-password");

    const verify = render(await SignupVerifyPage({ searchParams: Promise.resolve({ email: "new@example.com" }) }));
    expect(screen.getByText("Verify new@example.com")).toBeInTheDocument();
    verify.unmount();
    render(await SignupVerifyPage({ searchParams: Promise.resolve({}) }));
    expect(screen.getAllByRole("link").some((link) => link.getAttribute("href") === "/signup")).toBe(true);
  });
});
