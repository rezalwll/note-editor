import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  clearSession: vi.fn(),
  searchWorkspace: vi.fn(),
  readUpload: vi.fn(),
  storeUpload: vi.fn(),
  inspectUpload: vi.fn(),
  mkdir: vi.fn(),
  access: vi.fn(),
  loggerError: vi.fn(),
  queryRaw: vi.fn(),
  notebookFindMany: vi.fn(),
  pageFindMany: vi.fn(),
  pageFindFirst: vi.fn(),
  pageUpdate: vi.fn(),
  attachmentFindFirst: vi.fn(),
  attachmentCreate: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  requireUser: mocks.requireUser,
  clearSession: mocks.clearSession,
}));
vi.mock("@/lib/search", () => ({ searchWorkspace: mocks.searchWorkspace }));
vi.mock("@/lib/storage", () => ({
  readUpload: mocks.readUpload,
  storeUpload: mocks.storeUpload,
  getUploadRoot: () => "C:/tmp/uploads",
}));
vi.mock("@/lib/upload-validation", () => ({ inspectUpload: mocks.inspectUpload }));
vi.mock("@/lib/logger", () => {
  const testLogger = {
    error: mocks.loggerError,
    info: vi.fn(),
    warn: vi.fn(),
    metric: vi.fn(),
    child: vi.fn(),
  };
  testLogger.child.mockReturnValue(testLogger);
  return { logger: testLogger };
});
vi.mock("@/lib/env", () => ({ env: { MAX_UPLOAD_SIZE_MB: 10 } }));
vi.mock("node:fs/promises", () => ({
  default: { mkdir: mocks.mkdir, access: mocks.access },
  mkdir: mocks.mkdir,
  access: mocks.access,
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    $queryRaw: mocks.queryRaw,
    notebook: { findMany: mocks.notebookFindMany },
    page: {
      findMany: mocks.pageFindMany,
      findFirst: mocks.pageFindFirst,
      update: mocks.pageUpdate,
    },
    attachment: {
      findFirst: mocks.attachmentFindFirst,
      create: mocks.attachmentCreate,
    },
  },
}));

import { GET as getAttachment } from "@/app/api/attachments/[id]/route";
import { POST as logout } from "@/app/api/auth/logout/route";
import { GET as health } from "@/app/api/health/route";
import { PUT as updatePage } from "@/app/api/pages/[id]/route";
import { POST as uploadAttachment } from "@/app/api/pages/[id]/attachments/route";
import { GET as search } from "@/app/api/search/route";
import { GET as bootstrap } from "@/app/api/sync/bootstrap/route";
import { GET as pull } from "@/app/api/sync/pull/route";

const user = { id: "user-1", username: "owner", displayName: "Owner" };
const routeProps = { params: Promise.resolve({ id: "page-1" }) };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireUser.mockResolvedValue(user);
  mocks.mkdir.mockResolvedValue(undefined);
  mocks.access.mockResolvedValue(undefined);
  mocks.queryRaw.mockResolvedValue([{ ok: 1 }]);
});

describe("small API routes", () => {
  it("reports healthy and unavailable dependencies", async () => {
    const healthy = await health();
    expect(healthy.status).toBe(200);
    expect(await healthy.json()).toMatchObject({ status: "ok" });
    expect(healthy.headers.get("Cache-Control")).toBe("no-store");

    mocks.queryRaw.mockRejectedValueOnce(new Error("database down"));
    const unavailable = await health();
    expect(unavailable.status).toBe(503);
    expect(await unavailable.json()).toEqual({ status: "unavailable" });
    expect(mocks.loggerError).toHaveBeenCalled();
  });

  it("logs out and redirects to login", async () => {
    const response = await logout(new Request("https://notava.test/api/auth/logout", { method: "POST" }));
    expect(mocks.clearSession).toHaveBeenCalledOnce();
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("https://notava.test/login");
  });

  it("searches the authenticated workspace", async () => {
    mocks.searchWorkspace.mockResolvedValue({ results: [{ id: "page-1" }] });
    const response = await search(new Request("https://notava.test/api/search?q=hello"));
    expect(mocks.searchWorkspace).toHaveBeenCalledWith("user-1", "hello");
    expect(await response.json()).toEqual({ results: [{ id: "page-1" }] });
  });

  it("downloads an owned attachment and returns 404 otherwise", async () => {
    mocks.attachmentFindFirst.mockResolvedValueOnce(null);
    expect((await getAttachment(new Request("https://notava.test"), routeProps)).status).toBe(404);

    mocks.attachmentFindFirst.mockResolvedValue({
      id: "page-1",
      storageKey: "user-1/file.png",
      mimeType: "image/png",
      fileName: "my image.png",
    });
    mocks.readUpload.mockResolvedValue(new Uint8Array([1, 2, 3]));
    const response = await getAttachment(new Request("https://notava.test"), routeProps);
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("image/png");
    expect(response.headers.get("Content-Disposition")).toContain("my%20image.png");
  });

  it("validates, locates, sanitizes and updates pages", async () => {
    const invalid = await updatePage(
      new Request("https://notava.test", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "", bodyHtml: "" }),
      }),
      routeProps,
    );
    expect(invalid.status).toBe(400);

    mocks.pageFindFirst.mockResolvedValueOnce(null);
    const missing = await updatePage(
      new Request("https://notava.test", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "Title", bodyHtml: "<script>x</script><p>Hello</p>" }),
      }),
      routeProps,
    );
    expect(missing.status).toBe(404);

    mocks.pageFindFirst.mockResolvedValue({ id: "page-1" });
    mocks.pageUpdate.mockResolvedValue({ id: "page-1" });
    const updated = await updatePage(
      new Request("https://notava.test", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: " Title ", bodyHtml: "<p>Hello</p>" }),
      }),
      routeProps,
    );
    expect(updated.status).toBe(200);
    expect(mocks.pageUpdate).toHaveBeenCalledWith({
      where: { id: "page-1" },
      data: expect.objectContaining({ title: "Title", bodyText: "Hello" }),
    });
  });

  it("validates and stores page attachments", async () => {
    mocks.pageFindFirst.mockResolvedValueOnce(null);
    expect((await uploadAttachment(new Request("https://notava.test", { method: "POST" }), routeProps)).status).toBe(404);

    mocks.pageFindFirst.mockResolvedValue({ id: "page-1", archived: false, notebook: { archived: false } });
    const emptyForm = new FormData();
    const noFile = await uploadAttachment(
      { formData: async () => emptyForm } as Request,
      routeProps,
    );
    expect(noFile.status).toBe(400);

    const file = new File([new Uint8Array([1, 2, 3])], "pic.png", { type: "image/png" });
    const formData = new FormData();
    formData.set("file", file);
    mocks.inspectUpload.mockResolvedValueOnce(null);
    expect((await uploadAttachment({ formData: async () => formData } as Request, routeProps)).status).toBe(400);

    mocks.inspectUpload.mockResolvedValue({ mimeType: "image/png", extension: "png" });
    mocks.storeUpload.mockResolvedValue({ storageKey: "user-1/pic.png" });
    mocks.attachmentCreate.mockResolvedValue({
      id: "attachment-1",
      fileName: "pic.png",
      mimeType: "image/png",
      sizeBytes: 3,
    });
    const saved = await uploadAttachment(
      { formData: async () => formData } as Request,
      routeProps,
    );
    expect(saved.status).toBe(200);
    expect(await saved.json()).toMatchObject({ url: "/api/attachments/attachment-1" });
  });

  it("serializes bootstrap and incremental pull payloads", async () => {
    const updatedAt = new Date("2026-07-14T10:00:00.000Z");
    mocks.notebookFindMany.mockResolvedValue([{
      id: "notebook-1", groupId: "group-1", name: "Notes", description: null,
      archived: false, deletedAt: null, updatedAt,
    }]);
    mocks.pageFindMany.mockResolvedValue([{
      id: "page-1", notebookId: "notebook-1", title: "Page", bodyHtml: "<p>x</p>",
      bodyText: "x", archived: false, deletedAt: null, updatedAt,
    }]);

    const initial = await bootstrap(
      new Request("https://notava.test/api/sync/bootstrap"),
    );
    expect((await initial.json()).notebooks[0]).toMatchObject({
      id: "notebook-1", userId: "user-1", syncStatus: "synced",
    });

    const incremental = await pull(new Request("https://notava.test/api/sync/pull?since=2026-07-14T09:00:00.000Z"));
    expect((await incremental.json()).pages[0]).toMatchObject({ id: "page-1", syncStatus: "synced" });
    expect(mocks.notebookFindMany).toHaveBeenLastCalledWith(expect.objectContaining({
      where: { userId: "user-1", updatedAt: { gt: new Date("2026-07-14T09:00:00.000Z") } },
    }));

    mocks.notebookFindMany.mockRejectedValueOnce(new Error("sync database down"));
    const failed = await bootstrap(
      new Request("https://notava.test/api/sync/bootstrap", {
        headers: { "x-request-id": "failed-bootstrap" },
      }),
    );
    expect(failed.status).toBe(500);
    expect(failed.headers.get("x-request-id")).toBe("failed-bootstrap");
    expect(mocks.loggerError).toHaveBeenCalledWith(
      "Request failed",
      expect.objectContaining({ error: expect.any(Error) }),
    );
  });
});
