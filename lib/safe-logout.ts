"use client";

import { logoutAction } from "@/app/actions";

type LogoutDependencies = {
  revokeSession: () => Promise<{ success: true }>;
  navigateToLogin: () => void;
};

const defaultDependencies: LogoutDependencies = {
  revokeSession: logoutAction,
  navigateToLogin: () => window.location.replace("/login"),
};

/**
 * Ends the server session immediately. Local sync, IndexedDB cleanup and
 * cross-tab coordination must never prevent the user from signing out.
 */
export async function performSafeLogout(
  _userId: string,
  overrides: Partial<LogoutDependencies> = {},
): Promise<"completed" | "failed"> {
  const dependencies = { ...defaultDependencies, ...overrides };

  try {
    const result = await dependencies.revokeSession();
    if (result.success !== true) {
      return "failed";
    }
  } catch {
    return "failed";
  }

  dependencies.navigateToLogin();
  return "completed";
}
