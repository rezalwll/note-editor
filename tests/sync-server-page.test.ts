import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  notebookFindMany: vi.fn(),
  pageFindMany: vi.fn(),
  tombstoneFindMany: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    notebook: { findMany: mocks.notebookFindMany },
    page: { findMany: mocks.pageFindMany },
    entityTombstone: { findMany: mocks.tombstoneFindMany },
  },
}));

import { decodeSyncCursor, type SyncCursor } from "@/lib/sync/cursor";
import { getSyncPage } from "@/lib/sync/server-page";

const initialCursor: SyncCursor = {
  version: 1,
  mode: "pull",
  snapshotAt: "2026-07-15T10:00:00.000Z",
  since: "2026-07-14T10:00:00.000Z",
  phase: "notebooks",
  position: null,
};

function notebook(id: string, updatedAt: string) {
  return {
    id,
    userId: "user-1",
    groupId: "group-1",
    name: id,
    description: null,
    archived: false,
    updatedAt: new Date(updatedAt),
    deletedAt: null,
  };
}

describe("sync server pagination", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.pageFindMany.mockResolvedValue([]);
    mocks.tombstoneFindMany.mockResolvedValue([]);
  });

  it("keeps a stable timestamp/id cursor and advances across entity phases", async () => {
    mocks.notebookFindMany
      .mockResolvedValueOnce([
        notebook("notebook-1", "2026-07-15T09:00:00.000Z"),
        notebook("notebook-2", "2026-07-15T09:00:00.000Z"),
        notebook("notebook-3", "2026-07-15T09:30:00.000Z"),
      ])
      .mockResolvedValueOnce([
        notebook("notebook-3", "2026-07-15T09:30:00.000Z"),
      ]);

    const first = await getSyncPage("user-1", initialCursor, 2);
    expect(first.notebooks.map((item) => item.id)).toEqual([
      "notebook-1",
      "notebook-2",
    ]);
    expect(first.hasMore).toBe(true);
    const withinNotebookCursor = decodeSyncCursor(first.nextCursor!, "pull")!;
    expect(withinNotebookCursor).toMatchObject({
      phase: "notebooks",
      position: {
        timestamp: "2026-07-15T09:00:00.000Z",
        id: "notebook-2",
      },
    });

    const second = await getSyncPage("user-1", withinNotebookCursor, 2);
    expect(second.notebooks.map((item) => item.id)).toEqual(["notebook-3"]);
    const pageCursor = decodeSyncCursor(second.nextCursor!, "pull")!;
    expect(pageCursor.phase).toBe("pages");
    expect(mocks.notebookFindMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        take: 3,
        orderBy: [{ updatedAt: "asc" }, { id: "asc" }],
        where: expect.objectContaining({
          AND: expect.arrayContaining([
            expect.objectContaining({
              OR: expect.arrayContaining([
                expect.objectContaining({ id: { gt: "notebook-2" } }),
              ]),
            }),
          ]),
        }),
      }),
    );

    mocks.tombstoneFindMany.mockResolvedValueOnce([{
      id: "tombstone-1",
      userId: "user-1",
      entityType: "page",
      entityId: "page-deleted",
      deletedAt: new Date("2026-07-15T09:45:00.000Z"),
    }]);
    const final = await getSyncPage("user-1", pageCursor, 2);
    expect(final.pages).toEqual([]);
    expect(final.tombstones).toEqual([expect.objectContaining({
      entityId: "page-deleted",
    })]);
    expect(final.hasMore).toBe(false);
    expect(final.nextCursor).toBeNull();
  });
});
