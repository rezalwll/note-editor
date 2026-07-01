import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  prisma: {
    page: {
      findMany: vi.fn(),
    },
    notebook: {
      findMany: vi.fn(),
    },
    notebookGroup: {
      findMany: vi.fn(),
    },
    attachment: {
      findMany: vi.fn(),
    },
  },
}));

vi.mock("@/lib/prisma", () => ({
  prisma: mocks.prisma,
}));

vi.mock("@/lib/trash", () => ({
  TRASH_GROUP_SYSTEM_KEY: "deleted-items",
}));

describe("searchWorkspace", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.prisma.page.findMany.mockResolvedValue([]);
    mocks.prisma.notebook.findMany.mockResolvedValue([]);
    mocks.prisma.notebookGroup.findMany.mockResolvedValue([]);
    mocks.prisma.attachment.findMany.mockResolvedValue([]);
  });

  it("searches all supported entities and ranks page title matches above body and tags", async () => {
    mocks.prisma.page.findMany.mockResolvedValue([
      {
        id: "page-title",
        title: "Alpha Project",
        bodyText: "plain text",
        updatedAt: new Date("2026-07-01T10:00:00.000Z"),
        tags: [{ value: "misc" }],
        notebook: { name: "Notebook A", group: { name: "Group A" } },
      },
      {
        id: "page-tag",
        title: "Notes",
        bodyText: "plain text",
        updatedAt: new Date("2026-07-01T12:00:00.000Z"),
        tags: [{ value: "alpha-tag" }],
        notebook: { name: "Notebook B", group: { name: "Group B" } },
      },
      {
        id: "page-body",
        title: "Archive",
        bodyText: "contains alpha in body",
        updatedAt: new Date("2026-07-01T11:00:00.000Z"),
        tags: [],
        notebook: { name: "Notebook C", group: { name: "Group C" } },
      },
    ]);
    mocks.prisma.notebook.findMany.mockResolvedValue([
      {
        id: "notebook-1",
        name: "Alpha Notebook",
        updatedAt: new Date("2026-07-01T09:00:00.000Z"),
        group: { name: "Projects" },
      },
    ]);
    mocks.prisma.notebookGroup.findMany.mockResolvedValue([
      {
        id: "group-1",
        name: "Alpha Group",
        updatedAt: new Date("2026-07-01T08:00:00.000Z"),
        notebooks: [{ id: "notebook-1", pages: [{ id: "page-title" }] }],
      },
    ]);
    mocks.prisma.attachment.findMany.mockResolvedValue([
      {
        id: "attachment-1",
        fileName: "alpha-spec.pdf",
        createdAt: new Date("2026-07-01T07:00:00.000Z"),
        page: {
          id: "page-title",
          title: "Alpha Project",
          notebook: { name: "Notebook A" },
        },
      },
    ]);

    const { searchWorkspace } = await import("@/lib/search");
    const payload = await searchWorkspace("user-1", "Alpha");

    expect(mocks.prisma.page.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          userId: "user-1",
          archived: false,
          deletedAt: null,
        }),
      }),
    );
    expect(mocks.prisma.notebook.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          userId: "user-1",
          archived: false,
          deletedAt: null,
        }),
      }),
    );
    expect(mocks.prisma.attachment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          userId: "user-1",
          fileName: { contains: "alpha", mode: "insensitive" },
        }),
      }),
    );

    expect(payload.results.page.map((item) => item.id)).toEqual([
      "page-title",
      "page-tag",
      "page-body",
    ]);
    expect(payload.results.page[0]).toEqual(
      expect.objectContaining({
        matchedField: "title",
        href: "/pages/page-title",
        subtitle: "Group A / Notebook A",
      }),
    );
    expect(payload.results.page[1]).toEqual(
      expect.objectContaining({ matchedField: "tags" }),
    );
    expect(payload.results.page[2]).toEqual(
      expect.objectContaining({ matchedField: "bodyText" }),
    );
    expect(payload.results.notebook[0]).toEqual(
      expect.objectContaining({
        title: "Alpha Notebook",
        href: "/notebooks/notebook-1",
        matchedField: "name",
      }),
    );
    expect(payload.results.group[0]).toEqual(
      expect.objectContaining({
        title: "Alpha Group",
        href: "/pages/page-title",
      }),
    );
    expect(payload.results.attachment[0]).toEqual(
      expect.objectContaining({
        title: "alpha-spec.pdf",
        href: "/pages/page-title",
        matchedField: "fileName",
      }),
    );
  });

  it("returns empty grouped results for blank queries", async () => {
    const { searchWorkspace } = await import("@/lib/search");
    const payload = await searchWorkspace("user-1", "   ");

    expect(payload).toEqual({
      query: "",
      results: {
        page: [],
        notebook: [],
        group: [],
        attachment: [],
      },
    });
    expect(mocks.prisma.page.findMany).not.toHaveBeenCalled();
    expect(mocks.prisma.notebook.findMany).not.toHaveBeenCalled();
    expect(mocks.prisma.notebookGroup.findMany).not.toHaveBeenCalled();
    expect(mocks.prisma.attachment.findMany).not.toHaveBeenCalled();
  });
});
