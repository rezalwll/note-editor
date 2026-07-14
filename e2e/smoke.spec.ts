import { expect, test } from "@playwright/test";

test("serves the login form", async ({ page }) => {
  await page.goto("/login");
  await expect(page.locator("#username")).toBeVisible();
  await expect(page.locator("#password")).toBeVisible();
});

test("reports database and storage health", async ({ request }) => {
  const response = await request.get("/api/health");
  expect(response.ok()).toBe(true);
  await expect(response.json()).resolves.toMatchObject({ status: "ok" });
});
