import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  logout: vi.fn(),
}));

vi.mock("@/app/actions", () => ({
  logoutAction: mocks.logout,
}));

import { performSafeLogout } from "@/lib/safe-logout";

describe("performSafeLogout", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.logout.mockResolvedValue({ success: true });
  });

  it("revokes the session and navigates directly to login", async () => {
    const navigateToLogin = vi.fn();

    await expect(
      performSafeLogout("user-1", { navigateToLogin }),
    ).resolves.toBe("completed");

    expect(mocks.logout).toHaveBeenCalledOnce();
    expect(navigateToLogin).toHaveBeenCalledOnce();
  });

  it.each([
    ["a rejected request", () => mocks.logout.mockRejectedValue(new Error("offline"))],
    ["an unsuccessful response", () => mocks.logout.mockResolvedValue({ success: false })],
  ])("does not navigate after %s", async (_label, arrange) => {
    arrange();
    const navigateToLogin = vi.fn();

    await expect(
      performSafeLogout("user-1", { navigateToLogin }),
    ).resolves.toBe("failed");

    expect(navigateToLogin).not.toHaveBeenCalled();
  });
});
