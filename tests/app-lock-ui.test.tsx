import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AppLockButton } from "@/components/app-lock-button";
import { AppLockScreen } from "@/components/app-lock-screen";
import { PatternLockGrid } from "@/components/pattern-lock-grid";

describe("pattern lock interface", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("collects crossed and intermediate points while drawing", () => {
    const onChange = vi.fn();
    const onComplete = vi.fn();
    render(
      <PatternLockGrid
        value={[]}
        onChange={onChange}
        onComplete={onComplete}
      />,
    );
    const grid = screen.getByTestId("pattern-lock-grid");
    expect(grid).toHaveAttribute("dir", "ltr");
    vi.spyOn(grid, "getBoundingClientRect").mockReturnValue({
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      right: 300,
      bottom: 300,
      width: 300,
      height: 300,
      toJSON: () => ({}),
    });
    Object.defineProperty(grid, "setPointerCapture", {
      configurable: true,
      value: vi.fn(),
    });
    Object.defineProperty(grid, "hasPointerCapture", {
      configurable: true,
      value: vi.fn(() => false),
    });

    fireEvent.pointerDown(grid, {
      button: 0,
      pointerId: 1,
      clientX: 10,
      clientY: 10,
    });
    fireEvent.pointerMove(grid, {
      pointerId: 1,
      clientX: 290,
      clientY: 10,
    });
    fireEvent.pointerMove(grid, {
      pointerId: 1,
      clientX: 290,
      clientY: 290,
    });
    fireEvent.pointerUp(grid, {
      pointerId: 1,
      clientX: 290,
      clientY: 290,
    });

    expect(onComplete).toHaveBeenCalledWith([0, 1, 2, 5, 8]);
  });

  it("explains that recovery email is required before first setup", () => {
    render(
      <AppLockButton configured={false} recoveryAvailable={false} />,
    );
    fireEvent.click(
      screen.getByRole("button", { name: "تعریف قفل برنامه" }),
    );

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "ابتدا ایمیل حساب را در تنظیمات ثبت کنید",
    );
    expect(screen.getByTestId("pattern-lock-grid")).toHaveAttribute(
      "aria-disabled",
      "true",
    );
  });

  it("requests a recovery code from the locked screen", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ sent: true, email: "ow•••@example.com" }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    render(
      <AppLockScreen
        maskedEmail="ow•••@example.com"
        returnTo="/pages/page-1"
      />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: "الگو را فراموش کرده‌ام" }),
    );

    await waitFor(() => {
      expect(screen.getByRole("textbox", { name: "کد بازیابی" })).toBeVisible();
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/app-lock/recovery/request",
      expect.objectContaining({ method: "POST" }),
    );
    expect(screen.getByText(/کد بازیابی به/)).toHaveTextContent(
      "ow•••@example.com",
    );
  });
});
