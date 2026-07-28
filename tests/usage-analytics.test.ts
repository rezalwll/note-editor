import { describe, expect, it } from "vitest";

import {
  formatUsageDuration,
  getUtcDay,
  normalizeAnalyticsPath,
} from "@/lib/usage-analytics";

describe("usage analytics helpers", () => {
  it("keeps useful route names without storing entity identifiers", () => {
    expect(normalizeAnalyticsPath("/pages/secret-page-id?from=search")).toBe(
      "/pages/:id",
    );
    expect(normalizeAnalyticsPath("/notebooks/private-id")).toBe(
      "/notebooks/:id",
    );
    expect(normalizeAnalyticsPath("/support/private-ticket-id")).toBe(
      "/support/:id",
    );
    expect(normalizeAnalyticsPath("/admin/support/private-ticket-id")).toBe(
      "/admin/support/:id",
    );
    expect(normalizeAnalyticsPath("/settings")).toBe("/settings");
    expect(normalizeAnalyticsPath("not-a-path")).toBe("/");
  });

  it("uses a stable UTC day and Persian duration", () => {
    expect(
      getUtcDay(new Date("2026-07-28T23:59:59.000Z")).toISOString(),
    ).toBe("2026-07-28T00:00:00.000Z");
    expect(formatUsageDuration(30)).toContain("۱");
    expect(formatUsageDuration(3_900)).toContain("۱");
  });
});
