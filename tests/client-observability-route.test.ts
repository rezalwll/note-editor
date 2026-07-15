import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ requireUser: mocks.requireUser }));

describe("client observability route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.requireUser.mockResolvedValue({ id: "user-1" });
  });

  it("accepts bounded error and metric batches", async () => {
    const { POST } = await import("@/app/api/observability/client/route");
    const response = await POST(
      new Request("https://notava.test/api/observability/client", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-correlation-id": "browser-session-1",
        },
        body: JSON.stringify({
          events: [
            {
              kind: "error",
              name: "TypeError",
              message: "Editor failed",
              source: "error-boundary.editor",
              route: "/pages/1",
              occurredAt: "2026-07-15T08:00:00.000Z",
            },
            {
              kind: "metric",
              name: "autosave.failures",
              value: 1,
              source: "editor.autosave",
              metadata: { retryAttempt: 2 },
              occurredAt: "2026-07-15T08:00:01.000Z",
            },
          ],
        }),
      }),
    );

    expect(response.status).toBe(202);
    expect(response.headers.get("x-correlation-id")).toBe("browser-session-1");
    expect(await response.json()).toEqual({ accepted: 2 });
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining('"message":"Client error reported"'),
    );
  });

  it("rejects malformed batches without logging them as client errors", async () => {
    const { POST } = await import("@/app/api/observability/client/route");
    const response = await POST(
      new Request("https://notava.test/api/observability/client", {
        method: "POST",
        body: JSON.stringify({ events: [] }),
      }),
    );

    expect(response.status).toBe(400);
    expect(console.error).not.toHaveBeenCalled();
  });
});
