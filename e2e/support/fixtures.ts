import {
  expect,
  test as base,
  type Page,
  type TestInfo,
} from "@playwright/test";

import {
  createE2EAccount,
  deleteE2EAccount,
  type E2EAccount,
} from "./db";

type Fixtures = {
  account: E2EAccount;
};

export const test = base.extend<Fixtures>({
  account: async ({}, provide, testInfo) => {
    const account = await createE2EAccount(testInfo.title);
    try {
      await provide(account);
    } finally {
      await deleteE2EAccount(account.id);
    }
  },
});

export { expect };

export async function login(page: Page, account: E2EAccount) {
  await page.goto("/login");
  await page.locator("#username").fill(account.username);
  await page.locator("#password").fill(account.password);
  await Promise.all([
    page.waitForURL((url) => url.pathname === "/"),
    page.getByRole("button", { name: "ورود", exact: true }).click(),
  ]);
  await waitForOfflineRecord(page, "pages", () => true);
  await waitForSyncState(page, "synced");
}

export async function waitForSyncState(
  page: Page,
  state: "synced" | "syncing" | "error" | "conflict",
) {
  await expect(
    page.locator('[data-testid="sync-status-indicator"]:visible'),
  ).toHaveAttribute(
    "data-sync-state",
    state,
    { timeout: 15_000 },
  );
}

export function visibleSyncIndicator(page: Page) {
  return page.locator('[data-testid="sync-status-indicator"]:visible');
}

export async function readOfflineStore<T>(page: Page, storeName: string) {
  return page.evaluate(async (requestedStore) => {
    const databases = await indexedDB.databases();
    if (!databases.some((database) => database.name === "notava-offline")) {
      return [] as T[];
    }

    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("notava-offline");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });

    try {
      if (!database.objectStoreNames.contains(requestedStore)) {
        return [] as T[];
      }

      return await new Promise<T[]>((resolve, reject) => {
        const transaction = database.transaction(requestedStore, "readonly");
        const request = transaction.objectStore(requestedStore).getAll();
        request.onsuccess = () => resolve(request.result as T[]);
        request.onerror = () => reject(request.error);
      });
    } finally {
      database.close();
    }
  }, storeName);
}

export async function waitForOfflineRecord(
  page: Page,
  storeName: string,
  predicate: (record: Record<string, unknown>) => boolean,
  expected = true,
) {
  await expect
    .poll(async () => {
      const records = await readOfflineStore<Record<string, unknown>>(
        page,
        storeName,
      );
      return records.some(predicate);
    })
    .toBe(expected);
}

export function outputPath(testInfo: TestInfo, fileName: string) {
  return testInfo.outputPath(fileName);
}
