import path from "node:path";

import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    include: ["tests/**/*.test.{ts,tsx}"],
    setupFiles: ["./tests/setup.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary", "html"],
      reportsDirectory: "coverage",
      include: ["app/**/*.{ts,tsx}", "components/**/*.{ts,tsx}", "lib/**/*.{ts,tsx}"],
      exclude: ["**/*.d.ts", "generated/**"],
      thresholds: {
        statements: 70,
        branches: 70,
        functions: 60,
        lines: 70,
        "app/actions/auth-actions.ts": {
          statements: 100,
          branches: 100,
          functions: 100,
          lines: 100,
        },
        "app/api/sync/push/route.ts": {
          statements: 100,
          branches: 100,
          functions: 100,
          lines: 100,
        },
        "components/mobile-shell.tsx": {
          statements: 100,
          branches: 100,
          functions: 100,
          lines: 100,
        },
        "components/sync-conflict-dialog.tsx": {
          statements: 100,
          branches: 100,
          functions: 100,
          lines: 100,
        },
        "lib/offline-db/client.ts": {
          statements: 100,
          branches: 100,
          functions: 100,
          lines: 100,
        },
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname),
    },
  },
});
