import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";

import { proxy } from "@/proxy";

vi.mock("@/lib/auth", () => ({
  getSessionCookieName: () => "notava_session",
  verifySession: vi.fn().mockResolvedValue(null),
}));

describe("request proxy", () => {
  it("rejects malformed Server Action identifiers before Next.js handles them", async () => {
    const response = await proxy(
      new NextRequest("https://notava.test/notebooks/notebook-1", {
        method: "POST",
        headers: {
          "next-action": "dontcare",
          "x-request-id": "malformed-action",
        },
      }),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "Invalid server action identifier.",
    });
    expect(response.headers.get("x-request-id")).toBe("malformed-action");
    expect(response.headers.get("x-correlation-id")).toBe("malformed-action");
  });

  it("allows a structurally valid Server Action identifier to continue", async () => {
    const response = await proxy(
      new NextRequest("https://notava.test/notebooks/notebook-1", {
        method: "POST",
        headers: {
          "next-action": "7f".padEnd(42, "a"),
        },
      }),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("x-middleware-next")).toBe("1");
  });
});
