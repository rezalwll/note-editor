"use server";

import * as authActions from "@/app/actions/auth-actions";
import * as workspaceActions from "@/app/actions/workspace-actions";

export type {
  AuthActionState,
  ForgotPasswordActionState,
  PasswordActionState,
  ProfileActionState,
  ResetPasswordActionState,
} from "@/app/actions/auth-actions";

export async function loginAction(...args: Parameters<typeof authActions.loginAction>) {
  return authActions.loginAction(...args);
}

export async function signupAction(...args: Parameters<typeof authActions.signupAction>) {
  return authActions.signupAction(...args);
}

export async function completeSignupVerificationAction(
  ...args: Parameters<typeof authActions.completeSignupVerificationAction>
) {
  return authActions.completeSignupVerificationAction(...args);
}

export async function resendSignupVerificationCodeAction(
  ...args: Parameters<typeof authActions.resendSignupVerificationCodeAction>
) {
  return authActions.resendSignupVerificationCodeAction(...args);
}

export async function logoutAction(...args: Parameters<typeof authActions.logoutAction>) {
  return authActions.logoutAction(...args);
}

export async function updateProfileAction(
  ...args: Parameters<typeof authActions.updateProfileAction>
) {
  return authActions.updateProfileAction(...args);
}

export async function changePasswordAction(
  ...args: Parameters<typeof authActions.changePasswordAction>
) {
  return authActions.changePasswordAction(...args);
}

export async function requestPasswordResetAction(
  ...args: Parameters<typeof authActions.requestPasswordResetAction>
) {
  return authActions.requestPasswordResetAction(...args);
}

export async function resetPasswordAction(
  ...args: Parameters<typeof authActions.resetPasswordAction>
) {
  return authActions.resetPasswordAction(...args);
}

export async function createNotebookAction(
  ...args: Parameters<typeof workspaceActions.createNotebookAction>
) {
  return workspaceActions.createNotebookAction(...args);
}

export async function createNotebookInlineAction(
  ...args: Parameters<typeof workspaceActions.createNotebookInlineAction>
) {
  return workspaceActions.createNotebookInlineAction(...args);
}

export async function createNotebookGroupInlineAction(
  ...args: Parameters<typeof workspaceActions.createNotebookGroupInlineAction>
) {
  return workspaceActions.createNotebookGroupInlineAction(...args);
}

export async function renameNotebookGroupInlineAction(
  ...args: Parameters<typeof workspaceActions.renameNotebookGroupInlineAction>
) {
  return workspaceActions.renameNotebookGroupInlineAction(...args);
}

export async function updateNotebookGroupThemeInlineAction(
  ...args: Parameters<typeof workspaceActions.updateNotebookGroupThemeInlineAction>
) {
  return workspaceActions.updateNotebookGroupThemeInlineAction(...args);
}

export async function deleteNotebookGroupInlineAction(
  ...args: Parameters<typeof workspaceActions.deleteNotebookGroupInlineAction>
) {
  return workspaceActions.deleteNotebookGroupInlineAction(...args);
}

export async function restoreNotebookGroupInlineAction(
  ...args: Parameters<typeof workspaceActions.restoreNotebookGroupInlineAction>
) {
  return workspaceActions.restoreNotebookGroupInlineAction(...args);
}

export async function assignNotebookGroupInlineAction(
  ...args: Parameters<typeof workspaceActions.assignNotebookGroupInlineAction>
) {
  return workspaceActions.assignNotebookGroupInlineAction(...args);
}

export async function renameNotebookInlineAction(
  ...args: Parameters<typeof workspaceActions.renameNotebookInlineAction>
) {
  return workspaceActions.renameNotebookInlineAction(...args);
}

export async function updateNotebookThemeInlineAction(
  ...args: Parameters<typeof workspaceActions.updateNotebookThemeInlineAction>
) {
  return workspaceActions.updateNotebookThemeInlineAction(...args);
}

export async function reorderNotebookGroupsInlineAction(
  ...args: Parameters<typeof workspaceActions.reorderNotebookGroupsInlineAction>
) {
  return workspaceActions.reorderNotebookGroupsInlineAction(...args);
}

export async function reorderNotebooksInlineAction(
  ...args: Parameters<typeof workspaceActions.reorderNotebooksInlineAction>
) {
  return workspaceActions.reorderNotebooksInlineAction(...args);
}

export async function reorderPagesInlineAction(
  ...args: Parameters<typeof workspaceActions.reorderPagesInlineAction>
) {
  return workspaceActions.reorderPagesInlineAction(...args);
}

export async function updateNotebookAction(
  ...args: Parameters<typeof workspaceActions.updateNotebookAction>
) {
  return workspaceActions.updateNotebookAction(...args);
}

export async function archiveNotebookAction(
  ...args: Parameters<typeof workspaceActions.archiveNotebookAction>
) {
  return workspaceActions.archiveNotebookAction(...args);
}

export async function archiveNotebookInlineAction(
  ...args: Parameters<typeof workspaceActions.archiveNotebookInlineAction>
) {
  return workspaceActions.archiveNotebookInlineAction(...args);
}

export async function deleteNotebookPermanentlyInlineAction(
  ...args: Parameters<typeof workspaceActions.deleteNotebookPermanentlyInlineAction>
) {
  return workspaceActions.deleteNotebookPermanentlyInlineAction(...args);
}

export async function createPageAction(
  ...args: Parameters<typeof workspaceActions.createPageAction>
) {
  return workspaceActions.createPageAction(...args);
}

export async function createPageInlineAction(
  ...args: Parameters<typeof workspaceActions.createPageInlineAction>
) {
  return workspaceActions.createPageInlineAction(...args);
}

export async function archivePageAction(
  ...args: Parameters<typeof workspaceActions.archivePageAction>
) {
  return workspaceActions.archivePageAction(...args);
}

export async function archivePageInlineAction(
  ...args: Parameters<typeof workspaceActions.archivePageInlineAction>
) {
  return workspaceActions.archivePageInlineAction(...args);
}

export async function restorePageInlineAction(
  ...args: Parameters<typeof workspaceActions.restorePageInlineAction>
) {
  return workspaceActions.restorePageInlineAction(...args);
}

export async function deletePagePermanentlyInlineAction(
  ...args: Parameters<typeof workspaceActions.deletePagePermanentlyInlineAction>
) {
  return workspaceActions.deletePagePermanentlyInlineAction(...args);
}

export async function updateTagsAction(
  ...args: Parameters<typeof workspaceActions.updateTagsAction>
) {
  return workspaceActions.updateTagsAction(...args);
}

export async function emptyTrashInlineAction(
  ...args: Parameters<typeof workspaceActions.emptyTrashInlineAction>
) {
  return workspaceActions.emptyTrashInlineAction(...args);
}
