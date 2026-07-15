import JSZip from "jszip";
import { readFile } from "node:fs/promises";

import { createE2EWorkspace, findPage } from "./support/db";
import {
  expect,
  login,
  outputPath,
  test,
  waitForSyncState,
} from "./support/fixtures";

test("exports and imports a real workspace archive", async ({
  page,
  browser,
  account,
}, testInfo) => {
  const originalTitle = "عنوان اصلی پشتیبان";
  const workspace = await createE2EWorkspace(account.id, {
    groupName: "گروه پشتیبان",
    notebookName: "دفتر پشتیبان",
    pages: [{ title: originalTitle, bodyText: "متن واقعی داخل آرشیو" }],
  });
  const target = workspace.pages[0];

  await login(page, account);
  await page.goto("/settings");
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByTestId("workspace-export").click(),
  ]);
  const archivePath = outputPath(testInfo, "workspace-export.zip");
  await download.saveAs(archivePath);

  const zip = await JSZip.loadAsync(await readFile(archivePath));
  const manifest = JSON.parse(await zip.file("manifest.json")!.async("text"));
  const archive = JSON.parse(await zip.file("workspace.json")!.async("text"));
  expect(manifest).toMatchObject({
    app: "notebook",
    formatVersion: 1,
    user: { username: account.username },
  });
  expect(archive.pages).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        id: target.id,
        title: originalTitle,
        bodyText: "متن واقعی داخل آرشیو",
      }),
    ]),
  );

  await page.goto(`/pages/${target.id}`);
  await page.getByTestId("page-title-input").fill("عنوان تغییرکرده بعد از خروجی");
  await page.getByTestId("note-canvas").click({ position: { x: 12, y: 12 } });
  await expect
    .poll(async () =>
      (await findPage(target.id))?.title,
    )
    .toBe("عنوان تغییرکرده بعد از خروجی");
  await waitForSyncState(page, "synced");

  await page.goto("/settings");
  await page.getByTestId("workspace-import-file").setInputFiles(archivePath);
  await page.getByTestId("workspace-import-submit").click();
  await expect(page.getByTestId("workspace-import-success")).toBeVisible();
  await expect
    .poll(async () =>
      (await findPage(target.id))?.title,
    )
    .toBe(originalTitle);

  const verificationContext = await browser.newContext({
    baseURL: "http://127.0.0.1:3107",
  });
  const verificationPage = await verificationContext.newPage();
  try {
    await login(verificationPage, account);
    await verificationPage.goto(`/pages/${target.id}`);
    await expect(verificationPage.getByTestId("page-title-input")).toHaveValue(
      originalTitle,
    );
    await expect(
      verificationPage
        .locator('[data-editor-block] textarea, [data-editor-block] .ProseMirror')
        .first(),
    ).toHaveValue("متن واقعی داخل آرشیو");
  } finally {
    await verificationContext.close();
  }
});
