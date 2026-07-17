import { beforeEach, describe, expect, it, vi } from "vitest";

const defaultMocks = vi.hoisted(() => ({
  clearClientData: vi.fn(),
  listConflicts: vi.fn(),
  listPending: vi.fn(),
  logout: vi.fn(),
  prepare: vi.fn(),
  processQueue: vi.fn(),
  resume: vi.fn(),
}));

vi.mock("@/app/actions", () => ({
  logoutAction: defaultMocks.logout,
}));
vi.mock("@/lib/clear-client-data", () => ({
  clearPrivateClientData: defaultMocks.clearClientData,
}));
vi.mock("@/lib/offline-db/client", () => ({
  listConflictRecords: defaultMocks.listConflicts,
  listPendingQueue: defaultMocks.listPending,
}));
vi.mock("@/lib/private-data-coordinator", () => ({
  preparePrivateDataClear: defaultMocks.prepare,
  resumePrivateDataClear: defaultMocks.resume,
}));
vi.mock("@/lib/sync/client", () => ({
  processSyncQueue: defaultMocks.processQueue,
}));

import {
  performSafeLogout,
  UNSYNCED_LOGOUT_CONFIRMATION,
} from "@/lib/safe-logout";

const preparation = {
  userId: "user-1",
  requestId: "request-1",
  epoch: "epoch-1",
};

function createDependencies() {
  return {
    flush: vi.fn().mockResolvedValue(undefined),
    inspect: vi.fn().mockResolvedValue({ pending: 0, conflicts: 0 }),
    confirm: vi.fn().mockReturnValue(true),
    prepare: vi.fn().mockResolvedValue(preparation),
    revokeSession: vi.fn().mockResolvedValue({ success: true as const }),
    purge: vi.fn().mockResolvedValue(undefined),
    resume: vi.fn().mockResolvedValue(undefined),
    notifyFailure: vi.fn(),
    navigateToLogin: vi.fn(),
  };
}

describe("performSafeLogout", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    defaultMocks.processQueue.mockResolvedValue(undefined);
    defaultMocks.listPending.mockResolvedValue([]);
    defaultMocks.listConflicts.mockResolvedValue([]);
    defaultMocks.prepare.mockResolvedValue(preparation);
    defaultMocks.logout.mockResolvedValue({ success: true });
    defaultMocks.clearClientData.mockResolvedValue(undefined);
    defaultMocks.resume.mockResolvedValue(undefined);
  });

  it("wires the production sync, inspection, coordinator, session, and purge dependencies", async () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    const navigateToLogin = vi.fn();

    await expect(
      performSafeLogout("user-1", { navigateToLogin }),
    ).resolves.toBe("completed");

    expect(defaultMocks.processQueue).toHaveBeenCalledWith("user-1");
    expect(defaultMocks.listPending).toHaveBeenCalledTimes(2);
    expect(defaultMocks.listPending).toHaveBeenCalledWith("user-1", 1);
    expect(defaultMocks.listConflicts).toHaveBeenCalledTimes(2);
    expect(defaultMocks.listConflicts).toHaveBeenCalledWith("user-1");
    expect(defaultMocks.prepare).toHaveBeenCalledWith("user-1");
    expect(defaultMocks.logout).toHaveBeenCalledOnce();
    expect(defaultMocks.clearClientData).toHaveBeenCalledWith(preparation);
    expect(confirm).not.toHaveBeenCalled();
    expect(navigateToLogin).toHaveBeenCalledOnce();
  });

  it("uses the browser confirmation and alert adapters", async () => {
    defaultMocks.listPending.mockResolvedValue([{ id: "queue-1" }]);
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    const alert = vi.spyOn(window, "alert").mockImplementation(() => undefined);

    await expect(
      performSafeLogout("user-1", { navigateToLogin: vi.fn() }),
    ).resolves.toBe("cancelled");
    expect(confirm).toHaveBeenCalledWith(UNSYNCED_LOGOUT_CONFIRMATION);

    defaultMocks.listPending.mockRejectedValue(new Error("DB_FAILED"));
    await expect(
      performSafeLogout("user-1", { navigateToLogin: vi.fn() }),
    ).resolves.toBe("failed");
    expect(alert).toHaveBeenCalledWith(expect.any(String));
  });

  it("uses the production resume adapter when revocation fails", async () => {
    defaultMocks.logout.mockRejectedValue(new Error("SERVER_FAILED"));

    await expect(
      performSafeLogout("user-1", {
        notifyFailure: vi.fn(),
        navigateToLogin: vi.fn(),
      }),
    ).resolves.toBe("failed");

    expect(defaultMocks.resume).toHaveBeenCalledWith(preparation);
  });

  it("flushes, inspects, revokes, purges, and navigates in a data-safe order", async () => {
    const dependencies = createDependencies();

    await expect(
      performSafeLogout("user-1", dependencies),
    ).resolves.toBe("completed");

    expect(dependencies.flush).toHaveBeenCalledWith("user-1");
    expect(dependencies.inspect).toHaveBeenCalledTimes(2);
    expect(dependencies.inspect).toHaveBeenNthCalledWith(1, "user-1");
    expect(dependencies.inspect).toHaveBeenNthCalledWith(2, "user-1");
    expect(dependencies.confirm).not.toHaveBeenCalled();
    expect(dependencies.prepare).toHaveBeenCalledWith("user-1");
    expect(dependencies.revokeSession).toHaveBeenCalledOnce();
    expect(dependencies.purge).toHaveBeenCalledWith(preparation);
    expect(dependencies.navigateToLogin).toHaveBeenCalledOnce();
    expect(dependencies.resume).not.toHaveBeenCalled();
    expect(dependencies.notifyFailure).not.toHaveBeenCalled();
    expect(dependencies.prepare.mock.invocationCallOrder[0]).toBeLessThan(
      dependencies.revokeSession.mock.invocationCallOrder[0],
    );
    expect(dependencies.revokeSession.mock.invocationCallOrder[0]).toBeLessThan(
      dependencies.purge.mock.invocationCallOrder[0],
    );
    expect(dependencies.purge.mock.invocationCallOrder[0]).toBeLessThan(
      dependencies.navigateToLogin.mock.invocationCallOrder[0],
    );
  });

  it("preserves local data when the user rejects an unsynced logout", async () => {
    const dependencies = createDependencies();
    dependencies.inspect.mockResolvedValue({ pending: 1, conflicts: 1 });
    dependencies.confirm.mockReturnValue(false);

    await expect(
      performSafeLogout("user-1", dependencies),
    ).resolves.toBe("cancelled");

    expect(dependencies.confirm).toHaveBeenCalledWith(
      UNSYNCED_LOGOUT_CONFIRMATION,
    );
    expect(dependencies.prepare).not.toHaveBeenCalled();
    expect(dependencies.revokeSession).not.toHaveBeenCalled();
    expect(dependencies.purge).not.toHaveBeenCalled();
    expect(dependencies.navigateToLogin).not.toHaveBeenCalled();
  });

  it("continues after explicit consent when conflicts remain", async () => {
    const dependencies = createDependencies();
    dependencies.inspect.mockResolvedValue({ pending: 0, conflicts: 2 });

    await expect(
      performSafeLogout("user-1", dependencies),
    ).resolves.toBe("completed");

    expect(dependencies.confirm).toHaveBeenCalledWith(
      UNSYNCED_LOGOUT_CONFIRMATION,
    );
    expect(dependencies.purge).toHaveBeenCalledOnce();
  });

  it("catches a late local mutation after all tabs have been drained", async () => {
    const dependencies = createDependencies();
    dependencies.inspect
      .mockResolvedValueOnce({ pending: 0, conflicts: 0 })
      .mockResolvedValueOnce({ pending: 1, conflicts: 0 });
    dependencies.confirm.mockReturnValue(false);

    await expect(
      performSafeLogout("user-1", dependencies),
    ).resolves.toBe("cancelled");

    expect(dependencies.inspect).toHaveBeenCalledTimes(2);
    expect(dependencies.confirm).toHaveBeenCalledWith(
      UNSYNCED_LOGOUT_CONFIRMATION,
    );
    expect(dependencies.resume).toHaveBeenCalledWith(preparation);
    expect(dependencies.revokeSession).not.toHaveBeenCalled();
    expect(dependencies.purge).not.toHaveBeenCalled();
  });

  it("deletes a late local mutation only after explicit consent", async () => {
    const dependencies = createDependencies();
    dependencies.inspect
      .mockResolvedValueOnce({ pending: 0, conflicts: 0 })
      .mockResolvedValueOnce({ pending: 1, conflicts: 0 });

    await expect(
      performSafeLogout("user-1", dependencies),
    ).resolves.toBe("completed");

    expect(dependencies.confirm).toHaveBeenCalledOnce();
    expect(dependencies.revokeSession).toHaveBeenCalledOnce();
    expect(dependencies.purge).toHaveBeenCalledOnce();
  });

  it("uses the authoritative inspection when the best-effort flush fails", async () => {
    const dependencies = createDependencies();
    dependencies.flush.mockRejectedValue(new Error("OFFLINE"));

    await expect(
      performSafeLogout("user-1", dependencies),
    ).resolves.toBe("completed");

    expect(dependencies.inspect).toHaveBeenCalledWith("user-1");
    expect(dependencies.purge).toHaveBeenCalledOnce();
  });

  it("fails closed when local unsynced state cannot be inspected", async () => {
    const dependencies = createDependencies();
    dependencies.inspect.mockRejectedValue(new Error("DB_FAILED"));

    await expect(
      performSafeLogout("user-1", dependencies),
    ).resolves.toBe("failed");

    expect(dependencies.notifyFailure).toHaveBeenCalledWith(expect.any(String));
    expect(dependencies.prepare).not.toHaveBeenCalled();
    expect(dependencies.revokeSession).not.toHaveBeenCalled();
    expect(dependencies.purge).not.toHaveBeenCalled();
  });

  it("does not revoke the session when cross-tab suspension fails", async () => {
    const dependencies = createDependencies();
    dependencies.prepare.mockRejectedValue(new Error("TAB_TIMEOUT"));

    await expect(
      performSafeLogout("user-1", dependencies),
    ).resolves.toBe("failed");

    expect(dependencies.revokeSession).not.toHaveBeenCalled();
    expect(dependencies.resume).not.toHaveBeenCalled();
    expect(dependencies.purge).not.toHaveBeenCalled();
    expect(dependencies.notifyFailure).toHaveBeenCalledWith(expect.any(String));
  });

  it("resumes all tabs when the post-drain inspection fails", async () => {
    const dependencies = createDependencies();
    dependencies.inspect
      .mockResolvedValueOnce({ pending: 0, conflicts: 0 })
      .mockRejectedValueOnce(new Error("SECOND_INSPECTION_FAILED"));

    await expect(
      performSafeLogout("user-1", dependencies),
    ).resolves.toBe("failed");

    expect(dependencies.resume).toHaveBeenCalledWith(preparation);
    expect(dependencies.revokeSession).not.toHaveBeenCalled();
    expect(dependencies.purge).not.toHaveBeenCalled();
    expect(dependencies.notifyFailure).toHaveBeenCalledWith(expect.any(String));
  });

  it("resumes local writes when session revocation fails", async () => {
    const dependencies = createDependencies();
    dependencies.revokeSession.mockRejectedValue(new Error("SERVER_FAILED"));

    await expect(
      performSafeLogout("user-1", dependencies),
    ).resolves.toBe("failed");

    expect(dependencies.resume).toHaveBeenCalledWith(preparation);
    expect(dependencies.purge).not.toHaveBeenCalled();
    expect(dependencies.navigateToLogin).not.toHaveBeenCalled();
    expect(dependencies.notifyFailure).toHaveBeenCalledWith(expect.any(String));
  });

  it("treats a non-success revocation response as a failed logout", async () => {
    const dependencies = createDependencies();
    dependencies.revokeSession.mockResolvedValue({ success: false } as never);

    await expect(
      performSafeLogout("user-1", dependencies),
    ).resolves.toBe("failed");

    expect(dependencies.resume).toHaveBeenCalledWith(preparation);
    expect(dependencies.purge).not.toHaveBeenCalled();
  });

  it("contains resume failures after a rejected revocation", async () => {
    const dependencies = createDependencies();
    dependencies.revokeSession.mockRejectedValue(new Error("SERVER_FAILED"));
    dependencies.resume.mockRejectedValue(new Error("REOPEN_FAILED"));

    await expect(
      performSafeLogout("user-1", dependencies),
    ).resolves.toBe("failed");

    expect(dependencies.notifyFailure).toHaveBeenCalledOnce();
  });

  it("navigates away after a post-revocation purge failure", async () => {
    const dependencies = createDependencies();
    dependencies.purge.mockRejectedValue(new Error("PURGE_FAILED"));

    await expect(
      performSafeLogout("user-1", dependencies),
    ).resolves.toBe("failed");

    expect(dependencies.notifyFailure).toHaveBeenCalledWith(expect.any(String));
    expect(dependencies.navigateToLogin).toHaveBeenCalledOnce();
    expect(dependencies.resume).not.toHaveBeenCalled();
  });
});
