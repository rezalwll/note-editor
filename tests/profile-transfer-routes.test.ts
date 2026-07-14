import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  parseArchive: vi.fn(),
  readUpload: vi.fn(),
  writeUploadBuffer: vi.fn(),
  transaction: vi.fn(),
  groupFindMany: vi.fn(),
  notebookFindMany: vi.fn(),
  pageFindMany: vi.fn(),
  attachmentFindMany: vi.fn(),
  groupFindUnique: vi.fn(),
  groupUpdate: vi.fn(),
  groupCreate: vi.fn(),
  notebookFindUnique: vi.fn(),
  notebookUpdate: vi.fn(),
  notebookCreate: vi.fn(),
  pageFindUnique: vi.fn(),
  pageUpdate: vi.fn(),
  pageCreate: vi.fn(),
  tagDeleteMany: vi.fn(),
  tagCreateMany: vi.fn(),
  attachmentFindUnique: vi.fn(),
  attachmentUpdate: vi.fn(),
  attachmentCreate: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ requireUser: mocks.requireUser }));
vi.mock("@/lib/storage", () => ({
  readUpload: mocks.readUpload,
  writeUploadBuffer: mocks.writeUploadBuffer,
}));
vi.mock("@/lib/workspace-transfer", () => ({
  MAX_WORKSPACE_ARCHIVE_BYTES: 100 * 1024 * 1024,
  WORKSPACE_ARCHIVE_APP: "notava",
  WORKSPACE_ARCHIVE_FORMAT_VERSION: 1,
  getWorkspaceArchiveFileName: (username: string) => `notava-${username}.zip`,
  parseWorkspaceArchive: mocks.parseArchive,
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: mocks.transaction,
    notebookGroup: { findMany: mocks.groupFindMany },
    notebook: { findMany: mocks.notebookFindMany },
    page: { findMany: mocks.pageFindMany },
    attachment: { findMany: mocks.attachmentFindMany },
  },
}));

import { GET as exportWorkspace } from "@/app/api/profile/export/route";
import { POST as importWorkspace } from "@/app/api/profile/import/route";
import { serializeFreeformDocument } from "@/lib/notes";

const now = new Date("2026-07-14T10:00:00.000Z");
const user = { id: "user-1", username: "owner", displayName: "Owner" };

function importRequest() {
  const formData = new FormData();
  formData.set("archive", new File([new Uint8Array([1, 2, 3])], "workspace.zip", { type: "application/zip" }));
  return { formData: async () => formData } as Request;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireUser.mockResolvedValue(user);
  mocks.transaction.mockImplementation(async (callback: (tx: unknown) => unknown) =>
    callback({
      notebookGroup: {
        findUnique: mocks.groupFindUnique,
        update: mocks.groupUpdate,
        create: mocks.groupCreate,
      },
      notebook: {
        findUnique: mocks.notebookFindUnique,
        update: mocks.notebookUpdate,
        create: mocks.notebookCreate,
      },
      page: {
        findUnique: mocks.pageFindUnique,
        update: mocks.pageUpdate,
        create: mocks.pageCreate,
      },
      pageTag: {
        deleteMany: mocks.tagDeleteMany,
        createMany: mocks.tagCreateMany,
      },
      attachment: {
        findUnique: mocks.attachmentFindUnique,
        update: mocks.attachmentUpdate,
        create: mocks.attachmentCreate,
      },
    }),
  );
});

describe("workspace profile transfer routes", () => {
  it("exports workspace metadata and attachment bytes as a zip", async () => {
    mocks.groupFindMany.mockResolvedValue([{ id: "g1", name: "Group", createdAt: now, updatedAt: now }]);
    mocks.notebookFindMany.mockResolvedValue([{
      id: "n1", groupId: "g1", name: "Notebook", description: null,
      archived: false, createdAt: now, updatedAt: now,
    }]);
    mocks.pageFindMany.mockResolvedValue([{
      id: "p1", notebookId: "n1", title: "Page", bodyHtml: "<p>Hello</p>", bodyText: "Hello",
      archived: false, tags: [{ value: "tag" }], createdAt: now, updatedAt: now,
    }]);
    mocks.attachmentFindMany.mockResolvedValue([{
      id: "a1", pageId: "p1", fileName: "image.png", mimeType: "image/png",
      sizeBytes: 3, storageKey: "user-1/image.png", createdAt: now,
    }]);
    mocks.readUpload.mockResolvedValue(new Uint8Array([1, 2, 3]));

    const response = await exportWorkspace();

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("application/zip");
    expect(response.headers.get("Content-Disposition")).toContain("notava-owner.zip");
    expect((await response.arrayBuffer()).byteLength).toBeGreaterThan(0);
    expect(mocks.readUpload).toHaveBeenCalledWith("user-1/image.png");
  });

  it("imports existing and new records, sanitizes pages and writes attachments", async () => {
    const freeform = serializeFreeformDocument({ type: "freeform-v1", blocks: [] });
    const workspace = {
      groups: [
        { id: "g1", name: "Existing", createdAt: now.toISOString(), updatedAt: now.toISOString() },
        { id: "g2", name: "New", createdAt: now.toISOString(), updatedAt: now.toISOString() },
      ],
      notebooks: [
        { id: "n1", groupId: "g1", name: "Existing", description: null, archived: false, createdAt: now.toISOString(), updatedAt: now.toISOString() },
        { id: "n2", groupId: "g2", name: "New", description: "Description", archived: false, createdAt: now.toISOString(), updatedAt: now.toISOString() },
      ],
      pages: [
        { id: "p1", notebookId: "n1", title: "Existing", bodyHtml: freeform, bodyText: "", archived: false, tags: [], createdAt: now.toISOString(), updatedAt: now.toISOString() },
        { id: "p2", notebookId: "n2", title: "New", bodyHtml: "<script>x</script><p>Safe</p>", bodyText: "ignored", archived: false, tags: ["tag"], createdAt: now.toISOString(), updatedAt: now.toISOString() },
      ],
      attachments: [
        { id: "a1", pageId: "p1", fileName: "old.png", mimeType: "image/png", sizeBytes: 1, storageKey: "u/old.png", createdAt: now.toISOString() },
        { id: "a2", pageId: "p2", fileName: "new.pdf", mimeType: "application/pdf", sizeBytes: 1, storageKey: "u/new.pdf", createdAt: now.toISOString() },
      ],
    };
    mocks.parseArchive.mockResolvedValue({
      workspace,
      attachmentFiles: new Map([
        ["a1", new Uint8Array([1])],
        ["a2", new Uint8Array([2])],
      ]),
    });
    mocks.groupFindUnique.mockResolvedValueOnce({ id: "g1", userId: "user-1" }).mockResolvedValueOnce(null);
    mocks.notebookFindUnique.mockResolvedValueOnce({ id: "n1", userId: "user-1" }).mockResolvedValueOnce(null);
    mocks.pageFindUnique.mockResolvedValueOnce({ id: "p1", userId: "user-1" }).mockResolvedValueOnce(null);
    mocks.attachmentFindUnique.mockResolvedValueOnce({ id: "a1", userId: "user-1" }).mockResolvedValueOnce(null);

    const response = await importWorkspace(importRequest());

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      success: true,
      imported: { groups: 2, notebooks: 2, pages: 2, attachments: 2 },
    });
    expect(mocks.groupUpdate).toHaveBeenCalledOnce();
    expect(mocks.groupCreate).toHaveBeenCalledOnce();
    expect(mocks.notebookUpdate).toHaveBeenCalledOnce();
    expect(mocks.notebookCreate).toHaveBeenCalledOnce();
    expect(mocks.pageUpdate).toHaveBeenCalledOnce();
    expect(mocks.pageCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ id: "p2", bodyText: "Safe" }),
    }));
    expect(mocks.tagCreateMany).toHaveBeenCalledOnce();
    expect(mocks.attachmentUpdate).toHaveBeenCalledOnce();
    expect(mocks.attachmentCreate).toHaveBeenCalledOnce();
    expect(mocks.writeUploadBuffer).toHaveBeenCalledTimes(2);
  });

  it("rejects missing, malformed and foreign-owned archives", async () => {
    const missing = await importWorkspace(
      { formData: async () => new FormData() } as Request,
    );
    expect(missing.status).toBe(400);

    mocks.parseArchive.mockRejectedValueOnce(new Error("bad archive"));
    const malformed = await importWorkspace(importRequest());
    expect(malformed.status).toBe(400);
    expect(await malformed.json()).toEqual({ error: "bad archive" });

    mocks.parseArchive.mockResolvedValue({
      workspace: {
        groups: [{ id: "g1", name: "Foreign", createdAt: now.toISOString(), updatedAt: now.toISOString() }],
        notebooks: [], pages: [], attachments: [],
      },
      attachmentFiles: new Map(),
    });
    mocks.groupFindUnique.mockResolvedValue({ id: "g1", userId: "someone-else" });
    const foreign = await importWorkspace(importRequest());
    expect(foreign.status).toBe(400);
  });
});
