import { expect, login, test } from "./support/fixtures";

test("authenticates a real user through the login form", async ({
  page,
  account,
}) => {
  await login(page, account);

  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByTestId("create-group")).toBeVisible();
});

test("reports database and storage health", async ({ request }) => {
  const response = await request.get("/api/health");
  expect(response.ok()).toBe(true);
  await expect(response.json()).resolves.toMatchObject({ status: "ok" });
});
