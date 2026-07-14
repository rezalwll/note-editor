import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ComponentProps } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  refresh: vi.fn(),
  fetch: vi.fn(),
  action: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mocks.refresh }),
  useSearchParams: () => new URLSearchParams("next=/settings"),
}));
vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: ComponentProps<"a">) => (
    <a href={href} {...props}>{children}</a>
  ),
}));
vi.mock("@/app/actions", () => ({
  loginAction: mocks.action,
  signupAction: mocks.action,
  completeSignupVerificationAction: mocks.action,
  resendSignupVerificationCodeAction: mocks.action,
  requestPasswordResetAction: mocks.action,
  resetPasswordAction: mocks.action,
  updateProfileAction: mocks.action,
  changePasswordAction: mocks.action,
  logoutAction: mocks.action,
}));
vi.mock("@/lib/clear-client-data", () => ({ clearPrivateClientData: vi.fn() }));

import { ForgotPasswordForm } from "@/components/forms/forgot-password-form";
import { LoginForm } from "@/components/forms/login-form";
import { LogoutForm } from "@/components/forms/logout-form";
import { PasswordForm } from "@/components/forms/password-form";
import { ProfileForm } from "@/components/forms/profile-form";
import { ResetPasswordForm } from "@/components/forms/reset-password-form";
import { SignupForm } from "@/components/forms/signup-form";
import { SignupVerificationForm } from "@/components/forms/signup-verification-form";
import { WorkspacePortabilityCard } from "@/components/forms/workspace-portability-card";

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("fetch", mocks.fetch);
});

describe("authentication and settings forms", () => {
  it("renders every authentication and account form with its persisted values", () => {
    const { container } = render(
      <div>
        <LoginForm />
        <SignupForm initialEmail="new@example.com" />
        <SignupVerificationForm email="new@example.com" supportEmail="help@example.com" />
        <ForgotPasswordForm supportEmail="help@example.com" />
        <ResetPasswordForm token="reset-token" supportEmail="help@example.com" />
        <ProfileForm username="owner" displayName="Owner" email="owner@example.com" />
        <PasswordForm />
        <LogoutForm />
      </div>,
    );

    expect(container.querySelectorAll("form")).toHaveLength(9);
    expect(container.querySelector<HTMLInputElement>('input[name="next"]')?.value).toBe("/settings");
    expect(container.querySelector<HTMLInputElement>('input[name="token"]')?.value).toBe("reset-token");
    expect(container.querySelector<HTMLInputElement>('input[name="username"][value="owner"]')).toBeTruthy();
    expect(screen.getAllByRole("button").length).toBeGreaterThan(7);
    expect(screen.getAllByRole("link").some((link) => link.getAttribute("href") === "mailto:help@example.com")).toBe(true);
  });

  it("imports a workspace and reports server failures", async () => {
    mocks.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ imported: { groups: 1, notebooks: 2, pages: 3, attachments: 0 } }),
    });
    const { container } = render(<WorkspacePortabilityCard />);
    const form = container.querySelector("form")!;
    fireEvent.submit(form);

    await waitFor(() => expect(mocks.refresh).toHaveBeenCalledOnce());
    expect(mocks.fetch).toHaveBeenCalledWith("/api/profile/import", expect.objectContaining({ method: "POST" }));
    expect(screen.getByText(/2/)).toBeInTheDocument();

    mocks.fetch.mockResolvedValueOnce({ ok: false, json: async () => ({ error: "Import failed" }) });
    fireEvent.submit(form);
    await waitFor(() => expect(screen.getByText("Import failed")).toBeInTheDocument());
  });
});
