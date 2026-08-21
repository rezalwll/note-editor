import {
  createE2EWorkspace,
  findGroup,
  findNotebook,
  findFirstPageInNotebook,
  findPage,
  findPageByTitle,
} from "./support/db";
import {
  expect,
  login,
  test,
  waitForOfflineRecord,
  waitForSyncState,
} from "./support/fixtures";

test("creates a group, notebook and page through the workspace UI", async ({
  page,
  account,
}) => {
  const groupName = "گروه تست مرورگر";
  const notebookName = "دفتر تست مرورگر";
  const pageTitle = "صفحه تست مرورگر";

  await login(page, account);
  await page.getByTestId("create-group").click();
  await page.getByTestId("new-group-name").fill(groupName);
  await page.getByTestId("new-group-name").press("Enter");

  await expect
    .poll(() => findGroup(account.id, groupName))
    .not.toBeNull();
  const createdGroup = await findGroup(account.id, groupName);
  expect(createdGroup).not.toBeNull();
  await expect(page).toHaveURL(/\/pages\//);
  await expect(page.getByText(groupName, { exact: true })).toBeVisible();

  await page.getByTestId("create-notebook").click();
  await page.getByTestId("new-notebook-name").fill(notebookName);
  await page.getByTestId("new-notebook-name").press("Enter");

  await expect
    .poll(() => findNotebook(account.id, createdGroup!.id, notebookName))
    .not.toBeNull();
  const notebook = await findNotebook(
    account.id,
    createdGroup!.id,
    notebookName,
  );
  expect(notebook).not.toBeNull();
  const notebookTab = page.getByTestId(`notebook-tab-${notebook!.id}`);
  await expect(notebookTab).toBeVisible();
  await expect
    .poll(() => findFirstPageInNotebook(account.id, notebook!.id))
    .not.toBeNull();
  const firstNotebookPage = await findFirstPageInNotebook(
    account.id,
    notebook!.id,
  );
  expect(firstNotebookPage).not.toBeNull();
  await page.goto(`/pages/${firstNotebookPage!.id}`);
  await expect(page.getByTestId("page-title-input")).toBeVisible();

  await page.getByTestId("create-page").click();
  await page.getByTestId("new-page-title").fill(pageTitle);
  await page.getByTestId("new-page-title").press("Enter");

  await expect
    .poll(() => findPageByTitle(account.id, notebook!.id, pageTitle))
    .not.toBeNull();
  const createdPage = await findPageByTitle(
    account.id,
    notebook!.id,
    pageTitle,
  );
  expect(createdPage).not.toBeNull();
  await expect(page).toHaveURL(new RegExp(`/pages/${createdPage!.id}$`));
  await expect(page.getByTestId("page-title-input")).toHaveValue(pageTitle);
});

test("keeps the desktop editor inside the viewport with isolated scrolling", async ({
  page,
  account,
}) => {
  await page.setViewportSize({ width: 1920, height: 868 });
  const workspace = await createE2EWorkspace(account.id, {
    groupName: "Desktop layout group",
    notebookName: "Desktop layout notebook",
    pages: [{ title: "Desktop layout page" }],
  });

  await login(page, account);
  await page.goto(`/pages/${workspace.pages[0].id}`);
  await expect(page.getByTestId("note-editor-scroll-area")).toBeVisible();
  await expect(page.getByTestId("pages-sidebar-container")).toBeVisible();

  const geometry = await page.evaluate(() => {
    const editor = document.querySelector<HTMLElement>(
      '[data-testid="note-editor-scroll-area"]',
    );
    const sidebar = document.querySelector<HTMLElement>(
      '[data-testid="pages-sidebar-container"]',
    );
    const main = document.querySelector("main");

    if (!editor || !sidebar || !main) {
      throw new Error("Desktop workspace geometry is unavailable.");
    }

    const editorRect = editor.getBoundingClientRect();
    const sidebarRect = sidebar.getBoundingClientRect();
    const mainRect = main.getBoundingClientRect();

    return {
      documentClientHeight: document.documentElement.clientHeight,
      documentScrollHeight: document.documentElement.scrollHeight,
      windowScrollY: window.scrollY,
      viewportHeight: window.innerHeight,
      mainTop: mainRect.top,
      editorTop: editorRect.top,
      editorBottom: editorRect.bottom,
      sidebarTop: sidebarRect.top,
      sidebarBottom: sidebarRect.bottom,
    };
  });

  expect(geometry.documentScrollHeight).toBe(geometry.documentClientHeight);
  expect(geometry.windowScrollY).toBe(0);
  expect(Math.abs(geometry.editorTop - geometry.sidebarTop)).toBeLessThanOrEqual(1);
  expect(Math.abs(geometry.editorTop - geometry.mainTop - 6)).toBeLessThanOrEqual(1);
  expect(Math.abs(geometry.editorBottom - geometry.viewportHeight)).toBeLessThanOrEqual(1);
  expect(Math.abs(geometry.sidebarBottom - geometry.viewportHeight + 10)).toBeLessThanOrEqual(1);

  await page.mouse.move(900, 600);
  await page.mouse.wheel(0, 800);
  await expect
    .poll(() => page.evaluate(() => window.scrollY))
    .toBe(0);
});

test("moves a notebook between groups and keeps navigation stable", async ({
  page,
  account,
}) => {
  const source = await createE2EWorkspace(account.id, {
    groupName: "Source group",
    notebookName: "Notebook to move",
    pages: [{ title: "Page after move" }],
  });
  const target = await createE2EWorkspace(account.id, {
    groupName: "Target group",
    notebookName: "Existing target notebook",
  });
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  await login(page, account);
  await page.goto(`/pages/${source.pages[0].id}`);

  const notebookTab = page.getByTestId(`notebook-tab-${source.notebookId}`);
  await expect(notebookTab).toBeVisible();
  await notebookTab.click({ button: "right" });
  await page
    .locator(`[data-context-menu-item-id="move-${target.groupId}"]`)
    .click();

  await expect
    .poll(() =>
      findNotebook(account.id, target.groupId, "Notebook to move"),
    )
    .not.toBeNull();

  await page.getByTestId(`group-tab-${source.groupId}`).click();
  await expect(notebookTab).toBeHidden();
  await page.getByTestId(`group-tab-${target.groupId}`).click();
  await expect(notebookTab).toBeVisible();
  await notebookTab.getByRole("link", { name: "Notebook to move" }).click();

  await expect(page).toHaveURL(new RegExp(`/pages/${source.pages[0].id}$`));
  await expect(page.getByTestId("page-title-input")).toHaveValue(
    "Page after move",
  );
  expect(pageErrors).toEqual([]);
});

test("moves a page to another notebook from its context menu", async ({
  page,
  account,
}) => {
  const source = await createE2EWorkspace(account.id, {
    groupName: "Page source group",
    notebookName: "Page source notebook",
    pages: [{ title: "Page to move" }],
  });
  const target = await createE2EWorkspace(account.id, {
    groupName: "Page target group",
    notebookName: "Page target notebook",
  });
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  await login(page, account);
  await page.goto(`/pages/${source.pages[0].id}`);

  const pageRow = page.getByTestId(`page-item-${source.pages[0].id}`);
  await expect(pageRow).toBeVisible();
  await pageRow.click({ button: "right" });
  await page.locator('[data-context-menu-item-id="move-pages"]').click();
  await page
    .locator(
      `[data-context-menu-item-id="move-page-${target.notebookId}"]`,
    )
    .click();

  await expect
    .poll(async () => (await findPage(source.pages[0].id))?.notebookId)
    .toBe(target.notebookId);
  await expect(page).toHaveURL(
    new RegExp(`/pages/${source.pages[0].id}$`),
  );
  await expect(page.getByTestId("page-title-input")).toHaveValue(
    "Page to move",
  );
  await expect(
    page.getByTestId(`notebook-tab-${target.notebookId}`),
  ).toBeVisible();
  expect(pageErrors).toEqual([]);
});

test("keeps a long move-page submenu attached to its parent item", async ({
  page,
  account,
}) => {
  await page.setViewportSize({ width: 1920, height: 868 });
  const source = await createE2EWorkspace(account.id, {
    groupName: "Long move menu source",
    notebookName: "Long move menu notebook",
    pages: Array.from({ length: 9 }, (_, index) => ({
      title: `Move menu page ${index + 1}`,
    })),
  });

  for (let index = 0; index < 18; index += 1) {
    await createE2EWorkspace(account.id, {
      groupName: `Move target group ${index + 1}`,
      notebookName: `Move target notebook ${index + 1}`,
    });
  }

  await login(page, account);
  const activePage = source.pages.at(-1)!;
  await page.goto(`/pages/${activePage.id}`);

  const pageRow = page.getByTestId(`page-item-${activePage.id}`);
  await pageRow.scrollIntoViewIfNeeded();
  await pageRow.click({ button: "right" });

  const moveTrigger = page.locator(
    '[data-context-menu-item-id="move-pages"]',
  );
  await expect(moveTrigger).toBeVisible();
  await moveTrigger.click();

  const submenu = page.getByRole("menu", { name: "انتقال صفحه به" });
  await expect(submenu).toBeVisible();
  const [triggerBox, submenuBox] = await Promise.all([
    moveTrigger.boundingBox(),
    submenu.boundingBox(),
  ]);

  expect(triggerBox).not.toBeNull();
  expect(submenuBox).not.toBeNull();
  expect(submenuBox!.y).toBeCloseTo(436, 0);
  expect(submenuBox!.y).toBeLessThanOrEqual(triggerBox!.y);
  expect(submenuBox!.y + submenuBox!.height).toBeGreaterThanOrEqual(
    triggerBox!.y + triggerBox!.height,
  );
  expect(triggerBox!.x - (submenuBox!.x + submenuBox!.width)).toBeCloseTo(
    8,
    0,
  );
  expect(submenuBox!.y + submenuBox!.height).toBeLessThanOrEqual(856);
});

test("autosaves editor content and restores it after reload", async ({
  page,
  account,
}) => {
  const workspace = await createE2EWorkspace(account.id, {
    pages: [{ title: "عنوان اولیه", bodyText: "متن اولیه" }],
  });
  const target = workspace.pages[0];
  const savedTitle = "عنوان ذخیره‌شده با اتوسیو";
  const savedBody = "متن ذخیره‌شده پس از بارگذاری مجدد";

  await login(page, account);
  await page.goto(`/pages/${target.id}`);
  await expect(page.getByTestId("page-title-input")).toHaveValue("عنوان اولیه");
  await waitForOfflineRecord(
    page,
    "pages",
    (record) => record.id === target.id,
  );

  await page.getByTestId("page-title-input").fill(savedTitle);
  const bodyEditor = page
    .locator('[data-editor-block] textarea, [data-editor-block] .ProseMirror')
    .first();
  await bodyEditor.fill(savedBody);
  await page.getByTestId("note-canvas").click({ position: { x: 12, y: 12 } });

  await expect
    .poll(async () => {
      const record = await findPage(target.id);
      return { title: record?.title, bodyText: record?.bodyText };
    })
    .toEqual({ title: savedTitle, bodyText: savedBody });
  await waitForSyncState(page, "synced");

  await page.reload();
  await expect(page.getByTestId("page-title-input")).toHaveValue(savedTitle);
  const reloadedBodyEditor = page
    .locator('[data-editor-block] textarea, [data-editor-block] .ProseMirror')
    .first();
  await expect(reloadedBodyEditor).toHaveValue(savedBody);
});

test("undoes and redoes a structural page deletion", async ({
  page,
  account,
}) => {
  const workspace = await createE2EWorkspace(account.id, {
    pages: [
      { title: "صفحه فعال" },
      { title: "صفحه ساختاری" },
    ],
  });
  const [activePage, structuralPage] = workspace.pages;

  await login(page, account);
  await page.goto(`/pages/${activePage.id}`);
  const targetRow = page.getByTestId(`page-item-${structuralPage.id}`);
  await expect(targetRow).toBeVisible();

  await targetRow.click({ button: "right" });
  await page
    .getByRole("menu")
    .getByRole("menuitem", { name: "حذف صفحه", exact: true })
    .click();
  await expect(targetRow).toBeHidden();
  await expect
    .poll(async () =>
      Boolean(
        (await findPage(structuralPage.id))?.deletedAt,
      ),
    )
    .toBe(true);

  await page.getByRole("button", { name: "واگرد", exact: true }).click();
  await expect(targetRow).toBeVisible();
  await expect
    .poll(async () =>
      (await findPage(structuralPage.id))?.deletedAt ?? null,
    )
    .toBeNull();

  await page
    .getByRole("button", { name: "انجام دوباره", exact: true })
    .click();
  await expect(targetRow).toBeHidden();
  await expect
    .poll(async () =>
      Boolean(
        (await findPage(structuralPage.id))?.deletedAt,
      ),
    )
    .toBe(true);
});
