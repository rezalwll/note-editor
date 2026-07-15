import { describe, expect, it } from "vitest";

import {
  advanceSyncCursor,
  decodeSyncCursor,
  encodeSyncCursor,
  parseSyncPageRequest,
  stableCursorFilter,
  type SyncCursor,
} from "@/lib/sync/cursor";

const cursor: SyncCursor = {
  version: 1,
  mode: "pull",
  snapshotAt: "2026-07-15T10:00:00.000Z",
  since: "2026-07-14T10:00:00.000Z",
  phase: "pages",
  position: {
    timestamp: "2026-07-15T09:00:00.000Z",
    id: "page-10",
  },
};

describe("stable sync cursor", () => {
  it("round-trips opaque cursors and rejects a cursor from another mode", () => {
    const encoded = encodeSyncCursor(cursor);
    expect(decodeSyncCursor(encoded, "pull")).toEqual(cursor);
    expect(decodeSyncCursor(encoded, "bootstrap")).toBeNull();
  });

  it("uses timestamp and id as the stable tie breaker", () => {
    expect(stableCursorFilter("updatedAt", cursor)).toEqual({
      AND: [
        {
          updatedAt: {
            gt: new Date("2026-07-14T10:00:00.000Z"),
            lte: new Date("2026-07-15T10:00:00.000Z"),
          },
        },
        {
          OR: [
            { updatedAt: { gt: new Date("2026-07-15T09:00:00.000Z") } },
            {
              updatedAt: new Date("2026-07-15T09:00:00.000Z"),
              id: { gt: "page-10" },
            },
          ],
        },
      ],
    });
  });

  it("advances within a phase, then moves to tombstones", () => {
    const withinPhase = advanceSyncCursor(cursor, [{
      id: "page-20",
      timestamp: "2026-07-15T09:30:00.000Z",
    }], true);
    expect(withinPhase).toMatchObject({
      phase: "pages",
      position: { id: "page-20" },
    });

    expect(advanceSyncCursor(cursor, [], false)).toMatchObject({
      phase: "tombstones",
      position: null,
    });
  });

  it("rejects malformed cursors at the request boundary", () => {
    const parsed = parseSyncPageRequest(
      new Request("https://notava.test/api/sync/pull?cursor=broken"),
      "pull",
    );
    expect(parsed).toEqual({ error: "Invalid sync cursor." });
  });
});
