import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ pathname: "/pages/page-1" }));

vi.mock("next/navigation", () => ({
  usePathname: () => mocks.pathname,
}));

import { ShellContentLayout } from "@/components/shell-content-layout";

describe("ShellContentLayout", () => {
  beforeEach(() => {
    mocks.pathname = "/pages/page-1";
  });

  it("keeps editor and pages sidebar in a fixed desktop grid", () => {
    const { container } = render(
      <ShellContentLayout sidebar={<aside data-testid="sidebar" />}>
        <div>Editor</div>
      </ShellContentLayout>,
    );

    expect(container.firstElementChild).toHaveClass(
      "xl:min-h-0",
      "xl:flex-1",
      "xl:grid",
      "xl:grid-cols-[300px_minmax(0,1fr)]",
    );
    expect(screen.getByRole("main")).toHaveClass(
      "xl:h-full",
      "xl:overflow-hidden",
      "xl:col-start-2",
    );
    expect(screen.getByTestId("sidebar")).toBeInTheDocument();
  });

  it("keeps non-editor routes independently scrollable", () => {
    mocks.pathname = "/settings";
    render(
      <ShellContentLayout sidebar={<aside />}>
        <div>Settings</div>
      </ShellContentLayout>,
    );

    expect(screen.getByRole("main")).toHaveClass("xl:overflow-y-auto");
    expect(screen.queryByRole("complementary")).not.toBeInTheDocument();
  });
});
