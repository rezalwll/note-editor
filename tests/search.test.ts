import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  queryRaw: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    $queryRaw: mocks.queryRaw,
  },
}));

vi.mock("@/lib/trash", () => ({
  TRASH_GROUP_SYSTEM_KEY: "deleted-items",
}));

const date = (value: string) => new Date(value);

describe("searchWorkspace", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.queryRaw.mockResolvedValue([]);
  });

  it("returns grouped empty results without touching PostgreSQL for a blank query", async () => {
    const { searchWorkspace } = await import("@/lib/search");
    const payload = await searchWorkspace("user-1", "   \u200c  ");

    expect(payload).toEqual({
      query: "",
      results: {
        page: [],
        notebook: [],
        group: [],
        attachment: [],
      },
      nextCursor: null,
    });
    expect(mocks.queryRaw).not.toHaveBeenCalled();
  });

  it("uses parameterized pg_trgm queries, Persian normalization and database ranking", async () => {
    mocks.queryRaw
      .mockResolvedValueOnce([
        {
          id: "page-title",
          title: "برنامه‌نویسی 100%_",
          subtitle: "فنی / وب",
          matchedField: "title",
          score: 433.5,
          sortAt: date("2026-07-01T12:00:00.000Z"),
        },
        {
          id: "page-tag",
          title: "یادداشت‌ها",
          subtitle: "فنی / وب",
          matchedField: "tags",
          score: 263,
          sortAt: date("2026-07-01T11:00:00.000Z"),
        },
      ])
      .mockResolvedValueOnce([
        {
          id: "notebook-1",
          title: "برنامه نویسی",
          subtitle: "فنی",
          matchedField: "name",
          score: 434,
          sortAt: date("2026-07-01T10:00:00.000Z"),
        },
      ])
      .mockResolvedValueOnce([
        {
          id: "group-1",
          title: "فنی",
          subtitle: "اولین نتیجه در صفحه‌های این مجموعه باز می‌شود",
          matchedField: "name",
          score: 431,
          sortAt: date("2026-07-01T09:00:00.000Z"),
          targetNotebookId: "notebook-1",
          targetPageId: "page-title",
        },
      ])
      .mockResolvedValueOnce([
        {
          id: "attachment-1",
          pageId: "page-title",
          title: "برنامه.pdf",
          subtitle: "برنامه‌نویسی / وب",
          matchedField: "fileName",
          score: 193,
          sortAt: date("2026-07-01T08:00:00.000Z"),
        },
      ]);

    const { searchWorkspace } = await import("@/lib/search");
    const payload = await searchWorkspace(
      "user-1",
      "  برنامۀ‌نويسي 100%_  ",
    );

    expect(mocks.queryRaw).toHaveBeenCalledTimes(4);
    const pageQuery = mocks.queryRaw.mock.calls[0][0] as {
      sql: string;
      values: unknown[];
    };
    expect(pageQuery.sql).toContain("notava_normalize_search_text");
    expect(pageQuery.sql).toContain("similarity");
    expect(pageQuery.sql).not.toContain("برنامه نویسی");
    expect(pageQuery.values).toContain("برنامه نویسی 100%_");
    expect(pageQuery.values).toContain("%برنامه نویسی 100\\%\\_%");
    expect(pageQuery.values).toContain("user-1");

    expect(payload.query).toBe("برنامه نویسی 100%_");
    expect(payload.nextCursor).toBeNull();
    expect(payload.results.page.map((item) => item.id)).toEqual([
      "page-title",
      "page-tag",
    ]);
    expect(payload.results.page[0]).toEqual({
      type: "page",
      id: "page-title",
      title: "برنامه‌نویسی 100%_",
      subtitle: "فنی / وب",
      href: "/pages/page-title",
      matchedField: "title",
    });
    expect(payload.results.group[0].href).toBe("/pages/page-title");
    expect(payload.results.notebook[0].href).toBe("/notebooks/notebook-1");
    expect(payload.results.attachment[0].href).toBe("/pages/page-title");
  });

  it("paginates each result type with an opaque stable keyset cursor", async () => {
    const firstPageRows = [
      {
        id: "page-1",
        title: "Alpha 1",
        subtitle: null,
        matchedField: "title",
        score: 420,
        sortAt: date("2026-07-01T12:00:00.000Z"),
      },
      {
        id: "page-2",
        title: "Alpha 2",
        subtitle: null,
        matchedField: "title",
        score: 410,
        sortAt: date("2026-07-01T11:00:00.000Z"),
      },
      {
        id: "page-3",
        title: "Alpha 3",
        subtitle: null,
        matchedField: "bodyText",
        score: 210,
        sortAt: date("2026-07-01T10:00:00.000Z"),
      },
    ];
    mocks.queryRaw
      .mockResolvedValueOnce(firstPageRows)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    const { searchWorkspace } = await import("@/lib/search");
    const first = await searchWorkspace("user-1", "Alpha", { limit: 2 });

    expect(first.results.page.map((item) => item.id)).toEqual(["page-1", "page-2"]);
    expect(first.nextCursor).toEqual(expect.any(String));

    mocks.queryRaw.mockReset();
    mocks.queryRaw
      .mockResolvedValueOnce([firstPageRows[2]])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    const second = await searchWorkspace("user-1", "alpha", {
      limit: 2,
      cursor: first.nextCursor,
    });

    expect(second.results.page.map((item) => item.id)).toEqual(["page-3"]);
    expect(second.nextCursor).toBeNull();
    const pageQuery = mocks.queryRaw.mock.calls[0][0] as { values: unknown[] };
    expect(pageQuery.values).toContain(410);
    expect(pageQuery.values).toContain("page-2");

    const notebookQuery = mocks.queryRaw.mock.calls[1][0] as { sql: string };
    expect(notebookQuery.sql).toContain("WHERE FALSE");
  });

  it("rejects malformed, cross-query and out-of-range pagination inputs", async () => {
    const { InvalidSearchCursorError, searchWorkspace } = await import("@/lib/search");

    await expect(
      searchWorkspace("user-1", "alpha", { cursor: "not-json" }),
    ).rejects.toBeInstanceOf(InvalidSearchCursorError);
    await expect(
      searchWorkspace("user-1", "alpha", { limit: 0 }),
    ).rejects.toBeInstanceOf(RangeError);
    expect(mocks.queryRaw).not.toHaveBeenCalled();

    mocks.queryRaw
      .mockResolvedValueOnce([
        {
          id: "page-1",
          title: "Alpha",
          subtitle: null,
          matchedField: "title",
          score: 430,
          sortAt: date("2026-07-01T12:00:00.000Z"),
        },
        {
          id: "page-2",
          title: "Alpha two",
          subtitle: null,
          matchedField: "title",
          score: 420,
          sortAt: date("2026-07-01T11:00:00.000Z"),
        },
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    const first = await searchWorkspace("user-1", "alpha", { limit: 1 });

    await expect(
      searchWorkspace("user-1", "beta", {
        limit: 1,
        cursor: first.nextCursor,
      }),
    ).rejects.toBeInstanceOf(InvalidSearchCursorError);
  });
});
