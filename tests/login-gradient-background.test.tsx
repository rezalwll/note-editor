import { render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { LoginGradientBackground } from "@/components/login-gradient-background";

describe("LoginGradientBackground", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("keeps the CSS fallback visible and non-interactive without WebGL", () => {
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);

    const { container } = render(<LoginGradientBackground />);
    const background = container.firstElementChild;
    const canvas = container.querySelector("canvas");

    expect(background).toHaveAttribute("aria-hidden", "true");
    expect(background).toHaveClass("pointer-events-none", "absolute", "inset-0");
    expect(canvas).toHaveAttribute("aria-hidden", "true");
    expect(canvas).toHaveClass("h-full", "w-full");
  });
});
