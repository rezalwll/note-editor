import { beforeEach, describe, expect, it, vi } from "vitest";

const delegate = vi.hoisted(() => vi.fn().mockResolvedValue({ delegated: true }));

vi.mock("@/app/actions/auth-actions", () => ({
  loginAction: delegate,
  signupAction: delegate,
  completeSignupVerificationAction: delegate,
  resendSignupVerificationCodeAction: delegate,
  logoutAction: delegate,
  updateProfileAction: delegate,
  changePasswordAction: delegate,
  requestPasswordResetAction: delegate,
  resetPasswordAction: delegate,
}));
vi.mock("@/app/actions/workspace-actions", () => ({
  createNotebookAction: delegate,
  createNotebookInlineAction: delegate,
  createNotebookGroupInlineAction: delegate,
  renameNotebookGroupInlineAction: delegate,
  updateNotebookGroupThemeInlineAction: delegate,
  deleteNotebookGroupInlineAction: delegate,
  restoreNotebookGroupInlineAction: delegate,
  assignNotebookGroupInlineAction: delegate,
  renameNotebookInlineAction: delegate,
  updateNotebookThemeInlineAction: delegate,
  reorderNotebookGroupsInlineAction: delegate,
  reorderNotebooksInlineAction: delegate,
  reorderPagesInlineAction: delegate,
  updateNotebookAction: delegate,
  archiveNotebookAction: delegate,
  archiveNotebookInlineAction: delegate,
  deleteNotebookPermanentlyInlineAction: delegate,
  createPageAction: delegate,
  createPageInlineAction: delegate,
  archivePageAction: delegate,
  archivePageInlineAction: delegate,
  restorePageInlineAction: delegate,
  deletePagePermanentlyInlineAction: delegate,
  updateTagsAction: delegate,
  emptyTrashInlineAction: delegate,
}));

import * as actions from "@/app/actions";

describe("server action facade", () => {
  beforeEach(() => {
    delegate.mockReset().mockResolvedValue({ delegated: true });
  });

  it("delegates every public action to its focused implementation module", async () => {
    const publicActions = Object.values(actions).filter(
      (value) => typeof value === "function",
    ) as Array<() => Promise<unknown>>;

    expect(publicActions).toHaveLength(34);
    await Promise.all(publicActions.map((action) => action()));
    expect(delegate).toHaveBeenCalledTimes(34);
  });

  it("returns the non-redirecting logout result from the auth action", async () => {
    delegate.mockResolvedValueOnce({ success: true });

    await expect(actions.logoutAction()).resolves.toEqual({ success: true });
    expect(delegate).toHaveBeenCalledOnce();
  });
});
