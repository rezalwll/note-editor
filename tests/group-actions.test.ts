import { beforeEach, describe, expect, it, vi } from "vitest";
import { serializeFreeformDocument } from "@/lib/notes";

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  revalidatePath: vi.fn(),
  notebookGroupFindFirst: vi.fn(),
  notebookGroupCreate: vi.fn(),
  notebookGroupUpdate: vi.fn(),
  notebookGroupDelete: vi.fn(),
  notebookCreate: vi.fn(),
  notebookFindMany: vi.fn(),
  notebookUpdateMany: vi.fn(),
  pageCreate: vi.fn(),
  pageUpdateMany: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock("argon2", () => ({
  default: {
    hash: vi.fn(),
    verify: vi.fn(),
  },
}));

vi.mock("next/cache", () => ({
  revalidatePath: mocks.revalidatePath,
}));

vi.mock("next/headers", () => ({
  headers: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  redirect: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  requireUser: mocks.requireUser,
  clearSession: vi.fn(),
  createSession: vi.fn(),
  getUserByUsername: vi.fn(),
  getUserByEmail: vi.fn(),
}));

vi.mock("@/lib/email-auth", () => ({
  createPasswordResetTokenRecord: vi.fn(),
  createSignupVerificationCodeRecord: vi.fn(),
  getAuthHelpText: vi.fn(),
  getTokenHash: vi.fn(),
  getVerificationCodeHash: vi.fn(),
  sendPasswordResetEmail: vi.fn(),
  sendSignupVerificationCodeEmail: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: mocks.transaction,
    notebookGroup: {
      findFirst: mocks.notebookGroupFindFirst,
      create: mocks.notebookGroupCreate,
      update: mocks.notebookGroupUpdate,
      delete: mocks.notebookGroupDelete,
    },
    notebook: {
      create: mocks.notebookCreate,
      findMany: mocks.notebookFindMany,
      updateMany: mocks.notebookUpdateMany,
    },
    page: {
      create: mocks.pageCreate,
      updateMany: mocks.pageUpdateMany,
    },
    user: {
      update: vi.fn(),
      create: vi.fn(),
      findFirst: vi.fn(),
    },
    pendingSignup: {
      findUnique: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
      upsert: vi.fn(),
      update: vi.fn(),
    },
    passwordResetToken: {
      deleteMany: vi.fn(),
      create: vi.fn(),
      findUnique: vi.fn(),
    },
  },
}));

vi.mock("@/lib/storage", () => ({
  deleteUpload: vi.fn(),
}));

import {
  createNotebookGroupInlineAction,
  deleteNotebookGroupInlineAction,
} from "@/app/actions";

describe("group actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireUser.mockResolvedValue({ id: "user-1" });
    mocks.notebookGroupCreate.mockResolvedValue({ id: "clgroup000000000000000001" });
    mocks.notebookCreate.mockResolvedValue({ id: "clnotebook000000000000001" });
    mocks.pageCreate.mockResolvedValue({ id: "clpage0000000000000000001" });
    mocks.notebookUpdateMany.mockResolvedValue({ count: 0 });
    mocks.pageUpdateMany.mockResolvedValue({ count: 0 });
    mocks.notebookGroupUpdate.mockResolvedValue({
      id: "cltrash000000000000000001",
      name: "Trash",
      systemKey: "deleted-items",
    });
    mocks.notebookGroupDelete.mockResolvedValue({
      id: "clgroup000000000000000001",
    });
    mocks.transaction.mockImplementation(async (input: unknown) => {
      if (typeof input === "function") {
        return input({
          notebookGroup: {
            create: mocks.notebookGroupCreate,
            delete: mocks.notebookGroupDelete,
          },
          notebook: {
            create: mocks.notebookCreate,
            updateMany: mocks.notebookUpdateMany,
          },
          page: {
            create: mocks.pageCreate,
            updateMany: mocks.pageUpdateMany,
          },
        });
      }

      return Promise.all(input as Promise<unknown>[]);
    });
  });

  it("creates a group with an untitled notebook and page", async () => {
    await expect(createNotebookGroupInlineAction("Projects")).resolves.toMatchObject({
      id: "clgroup000000000000000001",
      notebookId: "clnotebook000000000000001",
      pageId: "clpage0000000000000000001",
    });

    expect(mocks.notebookGroupCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: "user-1",
        name: "Projects",
        sortOrder: 0,
      }),
    });
    expect(mocks.notebookCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: "user-1",
          groupId: "clgroup000000000000000001",
          sortOrder: 0,
        }),
      }),
    );
    expect(mocks.pageCreate).toHaveBeenCalledWith({
      data: {
        userId: "user-1",
        notebookId: "clnotebook000000000000001",
        title: "صفحه بدون عنوان",
        bodyHtml: serializeFreeformDocument({ type: "freeform-v1", blocks: [] }),
        bodyText: "",
        sortOrder: 0,
      },
    });
  });

  it("moves an empty group into trash by creating a trashed placeholder notebook", async () => {
    mocks.notebookGroupFindFirst
      .mockResolvedValueOnce({
        id: "clgroup000000000000000001",
        name: "Archive Me",
        systemKey: null,
      })
      .mockResolvedValueOnce({
        id: "cltrash000000000000000001",
        name: "Trash",
        systemKey: "deleted-items",
      });
    mocks.notebookFindMany.mockResolvedValue([]);
    mocks.notebookCreate.mockResolvedValue({ id: "cltrashnotebook000000001" });

    await expect(
      deleteNotebookGroupInlineAction("clgroup000000000000000001"),
    ).resolves.toEqual({
      success: true,
      trashGroupId: "cltrash000000000000000001",
      notebookIds: ["cltrashnotebook000000001"],
      wasEmpty: true,
    });

    expect(mocks.notebookCreate).toHaveBeenCalledWith({
      data: {
        userId: "user-1",
        groupId: "cltrash000000000000000001",
        name: "Archive Me",
        deletedAt: expect.any(Date),
      },
    });
    expect(mocks.notebookGroupDelete).toHaveBeenCalledWith({
      where: { id: "clgroup000000000000000001" },
    });
  });
});
