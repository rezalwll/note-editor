import type { Browser, BrowserContext, Page } from "@playwright/test";

import {
  createE2EWorkspace,
  findPage,
  findPageTombstone,
  type E2EAccount,
} from "./support/db";
import {
  expect,
  login,
  readOfflineStore,
  test,
  visibleSyncIndicator,
  waitForOfflineRecord,
  waitForSyncState,
} from "./support/fixtures";

const BASE_URL = "http://127.0.0.1:3107";

async function openDevice(
  browser: Browser,
  account: E2EAccount,
) {
  const context = (await browser.newContext({ baseURL: BASE_URL })) as BrowserContext;
  const page = await context.newPage();
  await login(page, account);
  return { context, page };
}

async function editTitle(page: Page, title: string) {
  await page.getByTestId("page-title-input").fill(title);
  await page.getByTestId("note-canvas").click({ position: { x: 12, y: 12 } });
}

test("queues an offline edit and syncs it after reconnecting", async ({
  page,
  account,
}) => {
  const workspace = await createE2EWorkspace(account.id, {
    pages: [{ title: "نسخه آنلاین" }],
  });
  const target = workspace.pages[0];
  const offlineTitle = "ویرایش ثبت‌شده در حالت آفلاین";

  await login(page, account);
  await page.goto(`/pages/${target.id}`);
  await waitForOfflineRecord(
    page,
    "pages",
    (record) => record.id === target.id,
  );
  await waitForSyncState(page, "synced");

  await page.context().setOffline(true);
  await editTitle(page, offlineTitle);
  await waitForSyncState(page, "error");
  await waitForOfflineRecord(
    page,
    "queue",
    (record) => record.entityId === target.id && record.status === "pending",
  );
  await expect
    .poll(async () =>
      (await findPage(target.id))?.title,
    )
    .toBe("نسخه آنلاین");

  await page.context().setOffline(false);
  await expect
    .poll(async () =>
      (await findPage(target.id))?.title,
    )
    .toBe(offlineTitle);
  await waitForOfflineRecord(
    page,
    "queue",
    (record) => record.entityId === target.id,
    false,
  );
  await waitForSyncState(page, "synced");

  await page.reload();
  await expect(page.getByTestId("page-title-input")).toHaveValue(offlineTitle);
});

test("detects a two-device conflict and resolves it with the remote version", async ({
  browser,
  account,
}) => {
  const workspace = await createE2EWorkspace(account.id, {
    pages: [{ title: "نسخه پایه" }],
  });
  const target = workspace.pages[0];
  const deviceA = await openDevice(browser, account);
  const deviceB = await openDevice(browser, account);

  try {
    await Promise.all([
      deviceA.page.goto(`/pages/${target.id}`),
      deviceB.page.goto(`/pages/${target.id}`),
    ]);
    await Promise.all([
      waitForOfflineRecord(
        deviceA.page,
        "pages",
        (record) => record.id === target.id,
      ),
      waitForOfflineRecord(
        deviceB.page,
        "pages",
        (record) => record.id === target.id,
      ),
    ]);

    await deviceB.context.setOffline(true);
    await editTitle(deviceB.page, "نسخه محلی دستگاه دوم");
    await waitForOfflineRecord(
      deviceB.page,
      "queue",
      (record) => record.entityId === target.id,
    );

    await editTitle(deviceA.page, "نسخه نهایی سرور");
    await expect
      .poll(async () =>
        (await findPage(target.id))?.title,
      )
      .toBe("نسخه نهایی سرور");

    await deviceB.context.setOffline(false);
    await waitForSyncState(deviceB.page, "conflict");
    await visibleSyncIndicator(deviceB.page).click();
    const dialog = deviceB.page.getByTestId("sync-conflict-dialog");
    await expect(dialog).toContainText("نسخه محلی دستگاه دوم");
    await expect(dialog).toContainText("نسخه نهایی سرور");
    await dialog.locator('[data-testid^="conflict-use-remote-"]').click();
    await expect(dialog).toBeHidden();
    await expect
      .poll(async () => {
        const conflicts = await readOfflineStore<Record<string, unknown>>(
          deviceB.page,
          "conflicts",
        );
        return conflicts.filter((record) => record.userId === account.id).length;
      })
      .toBe(0);

    await deviceB.page.reload();
    await expect(deviceB.page.getByTestId("page-title-input")).toHaveValue(
      "نسخه نهایی سرور",
    );
  } finally {
    await Promise.allSettled([
      deviceA.context.close(),
      deviceB.context.close(),
    ]);
  }
});

test("propagates a permanent deletion tombstone to a second device", async ({
  browser,
  account,
}) => {
  test.setTimeout(90_000);
  const workspace = await createE2EWorkspace(account.id, {
    pages: [
      { title: "صفحه باقی‌مانده" },
      { title: "صفحه حذف دائمی" },
    ],
  });
  const [survivor, target] = workspace.pages;
  const deviceA = await openDevice(browser, account);
  const deviceB = await openDevice(browser, account);

  try {
    await Promise.all([
      deviceA.page.goto(`/pages/${target.id}`),
      deviceB.page.goto(`/pages/${survivor.id}`),
    ]);
    await waitForOfflineRecord(
      deviceB.page,
      "pages",
      (record) => record.id === target.id,
    );

    const activeTargetRow = deviceA.page.getByTestId(`page-item-${target.id}`);
    await activeTargetRow.click({ button: "right" });
    await deviceA.page
      .getByRole("menu")
      .getByRole("menuitem", { name: "حذف صفحه", exact: true })
      .click();

    await expect
      .poll(async () => {
        const deleted = await findPage(target.id);
        return deleted?.deletedAt ? deleted.notebookId : null;
      })
      .not.toBeNull();
    const trashedPage = await findPage(target.id);
    expect(trashedPage?.deletedAt).not.toBeNull();
    const trashNotebookId = trashedPage!.notebookId;

    await deviceA.page.goto(`/notebooks/${trashNotebookId}`);
    const trashTargetRow = deviceA.page.getByTestId(`page-item-${target.id}`);
    await expect(trashTargetRow).toBeVisible();
    await trashTargetRow.click({ button: "right" });
    const permanentDeleteItem = deviceA.page
      .getByRole("menu")
      .getByRole("menuitem", { name: "حذف دائمی صفحه", exact: true });
    await expect(permanentDeleteItem).toBeVisible();
    await permanentDeleteItem.click({ noWaitAfter: true });

    await expect
      .poll(() => findPage(target.id))
      .toBeNull();
    await expect
      .poll(() => findPageTombstone(account.id, target.id))
      .not.toBeNull();

    await deviceB.page.reload();
    await waitForOfflineRecord(
      deviceB.page,
      "pages",
      (record) => record.id === target.id,
      false,
    );
    await expect(deviceB.page.getByTestId(`page-item-${target.id}`)).toBeHidden();
  } finally {
    await Promise.allSettled([
      deviceA.context.close(),
      deviceB.context.close(),
    ]);
  }
});
