"use client";

import { logoutAction } from "@/app/actions";
import { clearPrivateClientData } from "@/lib/clear-client-data";
import {
  listConflictRecords,
  listPendingQueue,
} from "@/lib/offline-db/client";
import {
  preparePrivateDataClear,
  resumePrivateDataClear,
  type PrivateDataClearPreparation,
} from "@/lib/private-data-coordinator";
import { processSyncQueue } from "@/lib/sync/client";

export const UNSYNCED_LOGOUT_CONFIRMATION =
  "هنوز تغییرات همگام‌نشده یا تعارض‌دار روی این دستگاه باقی مانده است. با ادامه خروج، نسخه محلی این تغییرات حذف می‌شود و ممکن است قابل بازیابی نباشد. آیا مطمئن هستید؟";

const LOGOUT_FAILURE_MESSAGE =
  "خروج امن انجام نشد. داده‌های محلی شما حذف نشده‌اند؛ اتصال و تب‌های دیگر برنامه را بررسی و دوباره تلاش کنید.";
const FINAL_SYNC_TIMEOUT_MS = 2_000;

type SafeLogoutDependencies = {
  flush: (userId: string) => Promise<void>;
  inspect: (userId: string) => Promise<{ pending: number; conflicts: number }>;
  confirm: (message: string) => boolean;
  prepare: (userId: string) => Promise<PrivateDataClearPreparation>;
  revokeSession: () => Promise<{ success: true }>;
  purge: (preparation: PrivateDataClearPreparation) => Promise<void>;
  resume: (preparation: PrivateDataClearPreparation) => Promise<void>;
  notifyFailure: (message: string) => void;
  navigateToLogin: () => void;
};

const defaultDependencies: SafeLogoutDependencies = {
  flush: async (userId) => {
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        processSyncQueue(userId),
        new Promise<never>((_, reject) => {
          timeout = setTimeout(
            () => reject(new Error("FINAL_SYNC_TIMEOUT")),
            FINAL_SYNC_TIMEOUT_MS,
          );
        }),
      ]);
    } finally {
      if (timeout) clearTimeout(timeout);
    }
  },
  inspect: async (userId) => {
    const [pending, conflicts] = await Promise.all([
      listPendingQueue(userId, 1),
      listConflictRecords(userId),
    ]);
    return { pending: pending.length, conflicts: conflicts.length };
  },
  confirm: (message) => window.confirm(message),
  prepare: preparePrivateDataClear,
  revokeSession: logoutAction,
  purge: clearPrivateClientData,
  resume: resumePrivateDataClear,
  notifyFailure: (message) => window.alert(message),
  navigateToLogin: () => window.location.replace("/login"),
};

export async function performSafeLogout(
  userId: string,
  overrides: Partial<SafeLogoutDependencies> = {},
): Promise<"completed" | "cancelled" | "failed"> {
  const dependencies = { ...defaultDependencies, ...overrides };
  try {
    await dependencies.flush(userId);
  } catch {
    // The final local inspection below decides whether explicit consent is needed.
  }

  let unsynced: { pending: number; conflicts: number };
  try {
    unsynced = await dependencies.inspect(userId);
  } catch {
    dependencies.notifyFailure(LOGOUT_FAILURE_MESSAGE);
    return "failed";
  }
  let unsyncedDeletionConfirmed = false;
  if (unsynced.pending + unsynced.conflicts > 0) {
    if (!dependencies.confirm(UNSYNCED_LOGOUT_CONFIRMATION)) {
      return "cancelled";
    }
    unsyncedDeletionConfirmed = true;
  }

  let preparation: PrivateDataClearPreparation | null = null;
  try {
    preparation = await dependencies.prepare(userId);
    const afterDrain = await dependencies.inspect(userId);
    if (
      !unsyncedDeletionConfirmed &&
      afterDrain.pending + afterDrain.conflicts > 0
    ) {
      if (!dependencies.confirm(UNSYNCED_LOGOUT_CONFIRMATION)) {
        await dependencies.resume(preparation);
        return "cancelled";
      }
      unsyncedDeletionConfirmed = true;
    }
    const result = await dependencies.revokeSession();
    if (result.success !== true) {
      throw new Error("SESSION_REVOCATION_FAILED");
    }
  } catch {
    if (preparation) {
      await dependencies.resume(preparation).catch(() => undefined);
    }
    dependencies.notifyFailure(LOGOUT_FAILURE_MESSAGE);
    return "failed";
  }

  try {
    await dependencies.purge(preparation);
  } catch {
    dependencies.notifyFailure(
      "نشست شما بسته شد، اما پاک‌سازی کامل داده‌های این دستگاه ناموفق بود. برای حفظ حریم خصوصی، مرورگر را ببندید و داده‌های سایت را پاک کنید.",
    );
    dependencies.navigateToLogin();
    return "failed";
  }

  dependencies.navigateToLogin();
  return "completed";
}
