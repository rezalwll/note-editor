import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { SyncConflictDialog } from "@/components/sync-conflict-dialog";
import type { ConflictRecord } from "@/lib/offline-db/types";

const mocks = vi.hoisted(() => ({
  discardConflicts: vi.fn(),
  listConflictRecords: vi.fn(),
  processSyncQueue: vi.fn(),
  refresh: vi.fn(),
  resolveLocal: vi.fn(),
  resolveRemote: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mocks.refresh }),
}));

vi.mock("@/lib/offline-db/client", () => ({
  discardConflictRecords: mocks.discardConflicts,
  listConflictRecords: mocks.listConflictRecords,
  resolveConflictWithLocal: mocks.resolveLocal,
  resolveConflictWithRemote: mocks.resolveRemote,
}));

vi.mock("@/lib/sync/client", () => ({
  processSyncQueue: mocks.processSyncQueue,
}));

function conflict(
  id: string,
  overrides: Partial<ConflictRecord> = {},
): ConflictRecord {
  return {
    id,
    userId: "user-1",
    entityType: "page",
    entityId: `entity-${id}`,
    createdAt: "2026-07-15T10:00:00.000Z",
    message: "conflict",
    localPayload: { title: "نسخه محلی", bodyText: "متن محلی" },
    remotePayload: { title: "نسخه سرور", bodyText: "متن سرور" },
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.discardConflicts.mockResolvedValue(0);
  mocks.listConflictRecords.mockResolvedValue([]);
  mocks.processSyncQueue.mockResolvedValue(undefined);
  mocks.resolveLocal.mockResolvedValue(undefined);
  mocks.resolveRemote.mockResolvedValue(undefined);
});

describe("SyncConflictDialog", () => {
  it("stays unmounted while closed", () => {
    render(
      <SyncConflictDialog userId="user-1" open={false} onClose={vi.fn()} />,
    );

    expect(screen.queryByTestId("sync-conflict-dialog")).not.toBeInTheDocument();
    expect(mocks.listConflictRecords).not.toHaveBeenCalled();
  });

  it("loads an empty conflict list, reports its count and closes with UI controls", async () => {
    const onClose = vi.fn();
    const onCountChange = vi.fn();
    render(
      <SyncConflictDialog
        userId="user-1"
        open
        onClose={onClose}
        onCountChange={onCountChange}
      />,
    );

    expect(await screen.findByText("تعارض حل‌نشده‌ای وجود ندارد.")).toBeInTheDocument();
    expect(onCountChange).toHaveBeenCalledWith(0);

    fireEvent.keyDown(window, { key: "Enter" });
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "بستن" }));
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("ignores a conflict load that finishes after unmount", async () => {
    let finish!: (value: ConflictRecord[]) => void;
    mocks.listConflictRecords.mockReturnValue(
      new Promise<ConflictRecord[]>((resolve) => {
        finish = resolve;
      }),
    );
    const onCountChange = vi.fn();
    const view = render(
      <SyncConflictDialog
        userId="user-1"
        open
        onClose={vi.fn()}
        onCountChange={onCountChange}
      />,
    );

    view.unmount();
    await act(async () => finish([conflict("late")]));
    expect(onCountChange).not.toHaveBeenCalled();
  });

  it("reports load failures but ignores a failure that arrives after unmount", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.listConflictRecords.mockRejectedValueOnce(new Error("indexeddb"));
    const first = render(
      <SyncConflictDialog userId="user-1" open onClose={vi.fn()} />,
    );
    expect(
      await screen.findByText("خواندن اختلاف‌های همگام‌سازی انجام نشد."),
    ).toBeInTheDocument();
    first.unmount();

    let rejectLoad!: (cause: Error) => void;
    mocks.listConflictRecords.mockReturnValueOnce(
      new Promise<ConflictRecord[]>((_, reject) => {
        rejectLoad = reject;
      }),
    );
    const second = render(
      <SyncConflictDialog userId="user-1" open onClose={vi.fn()} />,
    );
    second.unmount();
    await act(async () => rejectLoad(new Error("late")));
    expect(consoleError).toHaveBeenCalledTimes(1);
    consoleError.mockRestore();
  });

  it("renders page and notebook payload fallbacks", async () => {
    const conflicts = [
      conflict("page-normal"),
      conflict("page-missing", {
        localPayload: undefined,
        remotePayload: {},
      }),
      conflict("page-empty", {
        localPayload: { title: "", bodyText: "" },
        remotePayload: { title: 12, bodyText: 14 },
      }),
      conflict("notebook", {
        entityType: "notebook",
        localPayload: { name: "دفتر محلی", description: "توضیح محلی" },
        remotePayload: { name: "", description: "" },
      }),
      conflict("notebook-default", {
        entityType: "notebook",
        localPayload: {},
        remotePayload: { name: 12, description: 14 },
      }),
    ];
    mocks.listConflictRecords.mockResolvedValue(conflicts);

    render(<SyncConflictDialog userId="user-1" open onClose={vi.fn()} />);

    expect(
      await screen.findByText((content, element) =>
        element?.tagName === "P" &&
        content.includes("نسخه محلی") &&
        content.includes("متن محلی"),
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("اطلاعات این نسخه در دسترس نیست.")).toBeInTheDocument();
    expect(screen.getByText("صفحه خالی")).toBeInTheDocument();
    expect(screen.getAllByText("صفحه بدون عنوان")).toHaveLength(2);
    expect(
      screen.getByText((content, element) =>
        element?.tagName === "P" &&
        content.includes("دفتر محلی") &&
        content.includes("توضیح محلی"),
      ),
    ).toBeInTheDocument();
    expect(screen.getAllByText("زیرمجموعه بدون عنوان")).toHaveLength(2);
    expect(screen.getAllByText("زیرمجموعه")).toHaveLength(2);
  });

  it("explains a remote tombstone and presents recovery or deletion actions", async () => {
    mocks.listConflictRecords.mockResolvedValue([
      conflict("deleted", {
        remotePayload: {
          isTombstone: true,
          deletedAt: "2026-07-15T10:00:00.000Z",
        },
      }),
    ]);

    render(<SyncConflictDialog userId="user-1" open onClose={vi.fn()} />);

    expect(
      await screen.findByText(
        "این مورد در سرور برای همیشه حذف شده است و نسخه‌ای برای جایگزینی وجود ندارد.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "بازیابی نسخه این دستگاه" }),
    ).toHaveAttribute("data-testid", "conflict-use-local-deleted");
    expect(
      screen.getByRole("button", { name: "پذیرش حذف از سرور" }),
    ).toHaveAttribute("data-testid", "conflict-use-remote-deleted");
    expect(
      screen.queryByRole("button", { name: "استفاده از نسخه سرور" }),
    ).not.toBeInTheDocument();
  });

  it("keeps the dialog open after a remote resolution when conflicts remain", async () => {
    const first = conflict("first");
    const remaining = conflict("remaining");
    mocks.listConflictRecords
      .mockResolvedValueOnce([first])
      .mockResolvedValueOnce([remaining]);
    const onClose = vi.fn();
    const onCountChange = vi.fn();
    render(
      <SyncConflictDialog
        userId="user-1"
        open
        onClose={onClose}
        onCountChange={onCountChange}
      />,
    );

    fireEvent.click(await screen.findByTestId("conflict-use-remote-first"));

    await waitFor(() => expect(mocks.resolveRemote).toHaveBeenCalledWith("user-1", "first"));
    await waitFor(() => expect(screen.getByTestId("conflict-use-remote-remaining")).toBeEnabled());
    expect(onCountChange).toHaveBeenLastCalledWith(1);
    expect(mocks.refresh).toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    expect(mocks.processSyncQueue).not.toHaveBeenCalled();
  });

  it("processes the queue and closes after the local version resolves the final conflict", async () => {
    const item = conflict("local");
    let finish!: () => void;
    mocks.resolveLocal.mockReturnValue(
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
    );
    mocks.listConflictRecords
      .mockResolvedValueOnce([item])
      .mockResolvedValueOnce([]);
    const onClose = vi.fn();
    render(<SyncConflictDialog userId="user-1" open onClose={onClose} />);

    const localButton = await screen.findByTestId("conflict-use-local-local");
    fireEvent.click(localButton);
    await waitFor(() => expect(localButton).toHaveTextContent("در حال اعمال..."));
    expect(screen.getByTestId("conflict-use-remote-local")).toBeDisabled();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).not.toHaveBeenCalled();

    await act(async () => finish());
    await waitFor(() => expect(mocks.processSyncQueue).toHaveBeenCalledWith("user-1"));
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });

  it("shows an error and unlocks the dialog when resolution fails", async () => {
    const item = conflict("failure");
    mocks.listConflictRecords.mockResolvedValue([item]);
    mocks.resolveRemote.mockRejectedValue(new Error("network"));
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const onClose = vi.fn();
    render(<SyncConflictDialog userId="user-1" open onClose={onClose} />);

    const button = await screen.findByTestId("conflict-use-remote-failure");
    fireEvent.click(button);

    expect(
      await screen.findByText(
        "حل اختلاف انجام نشد. اگر این مورد از نسخه‌های قدیمی باقی مانده، از گزینه «پاک‌کردن موارد قدیمی» استفاده کنید.",
      ),
    ).toBeInTheDocument();
    await waitFor(() => expect(button).toBeEnabled());
    expect(consoleError).toHaveBeenCalledWith(
      "Failed to resolve sync conflict.",
      expect.any(Error),
    );
    await waitFor(() => {
      fireEvent.keyDown(window, { key: "Escape" });
      expect(onClose).toHaveBeenCalledTimes(1);
    });
    consoleError.mockRestore();
  });

  it("confirms and discards every obsolete conflict before reconciling", async () => {
    const items = [conflict("old-1"), conflict("old-2")];
    let finishDiscard!: () => void;
    mocks.discardConflicts.mockReturnValueOnce(
      new Promise<number>((resolve) => {
        finishDiscard = () => resolve(2);
      }),
    );
    mocks.listConflictRecords
      .mockResolvedValueOnce(items)
      .mockResolvedValueOnce([]);
    const onClose = vi.fn();
    const onCountChange = vi.fn();
    render(
      <SyncConflictDialog
        userId="user-1"
        open
        onClose={onClose}
        onCountChange={onCountChange}
      />,
    );

    fireEvent.click(await screen.findByTestId("conflict-discard-all"));
    expect(
      screen.getByText("این رکوردهای قدیمی از فهرست اختلاف‌ها پاک شوند؟"),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "انصراف" }));
    expect(
      screen.queryByText("این رکوردهای قدیمی از فهرست اختلاف‌ها پاک شوند؟"),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId("conflict-discard-all"));
    const confirm = screen.getByTestId("conflict-confirm-discard-all");
    fireEvent.click(confirm);
    await waitFor(() => expect(confirm).toHaveTextContent("پاک‌کردن ۲ مورد"));
    expect(screen.getByRole("button", { name: "بستن" })).toBeDisabled();

    await act(async () => finishDiscard());
    await waitFor(() =>
      expect(mocks.discardConflicts).toHaveBeenCalledWith("user-1", [
        "old-1",
        "old-2",
      ]),
    );
    expect(mocks.processSyncQueue).toHaveBeenCalledWith("user-1");
    expect(onCountChange).toHaveBeenLastCalledWith(0);
    expect(mocks.refresh).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("keeps cleanup successful when reconciliation is offline and conflicts remain", async () => {
    const first = conflict("old");
    const remaining = conflict("remaining");
    mocks.discardConflicts.mockResolvedValueOnce(1);
    mocks.processSyncQueue.mockRejectedValueOnce(new Error("offline"));
    mocks.listConflictRecords
      .mockResolvedValueOnce([first])
      .mockResolvedValueOnce([remaining]);
    const consoleWarn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const onClose = vi.fn();
    render(<SyncConflictDialog userId="user-1" open onClose={onClose} />);

    fireEvent.click(await screen.findByTestId("conflict-discard-all"));
    fireEvent.click(screen.getByTestId("conflict-confirm-discard-all"));

    await waitFor(() => expect(consoleWarn).toHaveBeenCalled());
    await waitFor(() =>
      expect(screen.getByTestId("conflict-use-remote-remaining")).toBeEnabled(),
    );
    expect(onClose).not.toHaveBeenCalled();
    consoleWarn.mockRestore();
  });

  it("reports a failed obsolete-conflict cleanup", async () => {
    mocks.listConflictRecords.mockResolvedValue([conflict("old")]);
    mocks.discardConflicts.mockRejectedValueOnce(new Error("blocked"));
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    render(<SyncConflictDialog userId="user-1" open onClose={vi.fn()} />);

    fireEvent.click(await screen.findByTestId("conflict-discard-all"));
    fireEvent.click(screen.getByTestId("conflict-confirm-discard-all"));

    expect(
      await screen.findByText(
        "پاک‌سازی اختلاف‌های قدیمی انجام نشد. دوباره تلاش کنید.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByTestId("conflict-confirm-discard-all")).toBeEnabled();
    expect(consoleError).toHaveBeenCalledWith(
      "Failed to discard stale sync conflicts.",
      expect.any(Error),
    );
    consoleError.mockRestore();
  });
});
