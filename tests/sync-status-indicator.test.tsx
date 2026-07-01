import { act, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { DesktopProfileMenu } from "@/components/desktop-profile-menu";
import { SyncStatusIndicator } from "@/components/sync-status-indicator";

vi.mock("@/app/actions", () => ({
  logoutAction: vi.fn(),
}));

const SYNCED_LABEL = "همه تغییرات با سرور همگام شده‌اند";
const SYNCING_LABEL = "در حال ذخیره و همگام‌سازی تغییرات...";
const ERROR_LABEL = "همگام‌سازی با خطا روبه‌رو شد؛ اتصال اینترنت یا وضعیت سرور را بررسی کنید";

function dispatchSyncEvent(detail: Record<string, unknown>) {
  act(() => {
    window.dispatchEvent(new CustomEvent("notava-sync", { detail }));
  });
}

describe("SyncStatusIndicator", () => {
  it("shows the synced state by default", () => {
    render(<SyncStatusIndicator />);

    const indicator = screen.getByTestId("sync-status-indicator");

    expect(indicator).toHaveAttribute("data-sync-state", "synced");
    expect(indicator).toHaveAttribute("title", SYNCED_LABEL);
    expect(screen.getByLabelText(SYNCED_LABEL)).toBeInTheDocument();
  });

  it("shows syncing while global sync is running", () => {
    render(<SyncStatusIndicator />);

    dispatchSyncEvent({ type: "global", phase: "start", syncStatus: "pending" });

    const indicator = screen.getByTestId("sync-status-indicator");

    expect(indicator).toHaveAttribute("data-sync-state", "syncing");
    expect(indicator).toHaveAttribute("title", SYNCING_LABEL);
  });

  it("returns to synced after global sync completes", () => {
    render(<SyncStatusIndicator />);

    dispatchSyncEvent({ type: "global", phase: "start", syncStatus: "pending" });
    dispatchSyncEvent({ type: "global", phase: "complete", syncStatus: "synced" });

    const indicator = screen.getByTestId("sync-status-indicator");

    expect(indicator).toHaveAttribute("data-sync-state", "synced");
    expect(indicator).toHaveAttribute("title", SYNCED_LABEL);
  });

  it("shows the error state for failed and conflict events", () => {
    render(<SyncStatusIndicator />);

    dispatchSyncEvent({ type: "page", syncStatus: "failed" });

    const indicator = screen.getByTestId("sync-status-indicator");

    expect(indicator).toHaveAttribute("data-sync-state", "error");
    expect(indicator).toHaveAttribute("title", ERROR_LABEL);

    dispatchSyncEvent({ type: "page", syncStatus: "conflict" });

    expect(indicator).toHaveAttribute("data-sync-state", "error");
  });

  it("renders next to the desktop profile menu", () => {
    render(
      <DesktopProfileMenu
        currentUser={{ username: "owner", displayName: "Owner" }}
        userAccent="#12b886"
        userInitials="O"
      />,
    );

    expect(screen.getByTestId("sync-status-indicator")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /@owner/i })).toBeInTheDocument();
  });
});
