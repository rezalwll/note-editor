import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  transaction: vi.fn(),
  userUpdateMany: vi.fn(),
  pageFindFirst: vi.fn(),
  groupCreate: vi.fn(),
  notebookCreate: vi.fn(),
  pageCreate: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: mocks.transaction,
  },
}));

import {
  ensureWelcomeWorkspace,
  welcomeWorkspaceContent,
} from "@/lib/welcome-workspace";
import { parseFreeformDocument } from "@/lib/notes";

const transaction = {
  user: { updateMany: mocks.userUpdateMany },
  notebookGroup: { create: mocks.groupCreate },
  notebook: { create: mocks.notebookCreate },
  page: {
    findFirst: mocks.pageFindFirst,
    create: mocks.pageCreate,
  },
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.transaction.mockImplementation(
    async (callback: (tx: typeof transaction) => unknown) => callback(transaction),
  );
  mocks.userUpdateMany.mockResolvedValue({ count: 1 });
  mocks.pageFindFirst.mockResolvedValue(null);
  mocks.groupCreate.mockResolvedValue({ id: "group-1" });
  mocks.notebookCreate.mockResolvedValue({ id: "notebook-1" });
  mocks.pageCreate.mockResolvedValue({ id: "page-1" });
});

describe("welcome workspace", () => {
  it("creates one usable sample workspace for a page-less account", async () => {
    await expect(ensureWelcomeWorkspace("user-1")).resolves.toEqual({
      groupId: "group-1",
      notebookId: "notebook-1",
      pageId: "page-1",
    });

    expect(mocks.userUpdateMany).toHaveBeenCalledWith({
      where: { id: "user-1", onboardingSeededAt: null },
      data: { onboardingSeededAt: expect.any(Date) },
    });
    expect(mocks.groupCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ userId: "user-1", name: "شروع کار" }),
    });
    expect(mocks.notebookCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: "user-1",
        groupId: "group-1",
        name: "راهنمای نوتاوا",
      }),
    });
    expect(mocks.pageCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: "user-1",
        notebookId: "notebook-1",
        title: "به نوتاوا خوش آمدید",
      }),
    });

    const document = parseFreeformDocument(welcomeWorkspaceContent.bodyHtml);
    expect(document?.blocks).toHaveLength(4);
    expect(welcomeWorkspaceContent.bodyText).toContain("خوش آمدید");
  });

  it("does nothing after onboarding was already handled", async () => {
    mocks.userUpdateMany.mockResolvedValue({ count: 0 });

    await expect(ensureWelcomeWorkspace("user-1")).resolves.toBeNull();

    expect(mocks.pageFindFirst).not.toHaveBeenCalled();
    expect(mocks.groupCreate).not.toHaveBeenCalled();
  });

  it("marks existing accounts without adding sample data", async () => {
    mocks.pageFindFirst.mockResolvedValue({ id: "existing-page" });

    await expect(ensureWelcomeWorkspace("user-1")).resolves.toBeNull();

    expect(mocks.groupCreate).not.toHaveBeenCalled();
    expect(mocks.notebookCreate).not.toHaveBeenCalled();
    expect(mocks.pageCreate).not.toHaveBeenCalled();
  });
});
