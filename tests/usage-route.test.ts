import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  userUpdate: vi.fn(),
  dailyUpsert: vi.fn(),
  routeUpsert: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ requireUser: mocks.requireUser }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { update: mocks.userUpdate },
    userUsageDaily: { upsert: mocks.dailyUpsert },
    routeUsageDaily: { upsert: mocks.routeUpsert },
    $transaction: mocks.transaction,
  },
}));

import { POST } from "@/app/api/analytics/usage/route";

function request(body: unknown) {
  return new Request("https://notava.test/api/analytics/usage", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireUser.mockResolvedValue({ id: "user-1" });
  mocks.userUpdate.mockResolvedValue({ id: "user-1" });
  mocks.dailyUpsert.mockResolvedValue({ id: "daily-1" });
  mocks.routeUpsert.mockResolvedValue({ id: "route-1" });
  mocks.transaction.mockImplementation((operations: Promise<unknown>[]) =>
    Promise.all(operations),
  );
});

describe("usage analytics route", () => {
  it("rejects malformed events", async () => {
    const response = await POST(request({ type: "heartbeat", activeSeconds: 5 }));
    expect(response.status).toBe(400);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("counts a page view while anonymizing the entity id", async () => {
    const response = await POST(
      request({ type: "page_view", path: "/pages/private-page-id?x=1" }),
    );
    expect(response.status).toBe(204);
    expect(mocks.userUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "user-1" },
        data: expect.objectContaining({
          totalPageViews: { increment: 1 },
          totalActiveSeconds: { increment: 0 },
        }),
      }),
    );
    expect(mocks.routeUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ path: "/pages/:id" }),
      }),
    );
  });

  it("counts active time without creating a route record", async () => {
    const response = await POST(
      request({ type: "heartbeat", activeSeconds: 60 }),
    );
    expect(response.status).toBe(204);
    expect(mocks.userUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          totalPageViews: { increment: 0 },
          totalActiveSeconds: { increment: 60 },
        }),
      }),
    );
    expect(mocks.routeUpsert).not.toHaveBeenCalled();
  });
});
