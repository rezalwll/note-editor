import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  timeout: 60_000,
  expect: {
    timeout: 10_000,
  },
  retries: process.env.CI ? 2 : 0,
  workers: 2,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: "http://127.0.0.1:3107",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video:
      process.env.PLAYWRIGHT_USE_EDGE === "1" ? "off" : "retain-on-failure",
  },
  webServer: {
    command:
      "npm run prisma:deploy && npm run dev -- --hostname 127.0.0.1 --port 3107",
    url: "http://127.0.0.1:3107/login",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        ...(process.env.PLAYWRIGHT_USE_EDGE === "1"
          ? { channel: "msedge" as const }
          : {}),
      },
    },
  ],
});
