import { z } from "zod";

export const SYNC_PAGE_SIZE = 100;
export const MAX_SYNC_PAGE_SIZE = 100;

export type SyncMode = "bootstrap" | "pull";
export type SyncPhase = "notebooks" | "pages" | "tombstones";

const cursorSchema = z.object({
  version: z.literal(1),
  mode: z.enum(["bootstrap", "pull"]),
  snapshotAt: z.iso.datetime(),
  since: z.iso.datetime().nullable(),
  phase: z.enum(["notebooks", "pages", "tombstones"]),
  position: z.object({
    timestamp: z.iso.datetime(),
    id: z.string().min(1),
  }).nullable(),
});

export type SyncCursor = z.infer<typeof cursorSchema>;

export function encodeSyncCursor(cursor: SyncCursor) {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

export function decodeSyncCursor(value: string | null, mode: SyncMode) {
  if (!value) return null;

  try {
    const parsed = cursorSchema.safeParse(
      JSON.parse(Buffer.from(value, "base64url").toString("utf8")),
    );
    return parsed.success && parsed.data.mode === mode ? parsed.data : null;
  } catch {
    return null;
  }
}

export function parseSyncPageRequest(request: Request, mode: SyncMode) {
  const { searchParams } = new URL(request.url);
  const rawCursor = searchParams.get("cursor");
  const cursor = decodeSyncCursor(rawCursor, mode);

  if (rawCursor && !cursor) {
    return { error: "Invalid sync cursor." } as const;
  }

  const rawLimit = Number(searchParams.get("limit") ?? SYNC_PAGE_SIZE);
  const limit = Number.isInteger(rawLimit) && rawLimit > 0
    ? Math.min(rawLimit, MAX_SYNC_PAGE_SIZE)
    : SYNC_PAGE_SIZE;

  if (cursor) return { cursor, limit } as const;

  const rawSince = mode === "pull" ? searchParams.get("since") : null;
  const sinceDate = rawSince ? new Date(rawSince) : null;
  if (sinceDate && Number.isNaN(sinceDate.getTime())) {
    return { error: "Invalid sync timestamp." } as const;
  }

  return {
    limit,
    cursor: {
      version: 1,
      mode,
      snapshotAt: new Date().toISOString(),
      since: sinceDate?.toISOString() ?? null,
      phase: "notebooks",
      position: null,
    } satisfies SyncCursor,
  } as const;
}

export function nextSyncPhase(mode: SyncMode, phase: SyncPhase): SyncPhase | null {
  if (phase === "notebooks") return "pages";
  if (phase === "pages") return mode === "pull" ? "tombstones" : null;
  return null;
}

export function stableCursorFilter(
  field: "updatedAt" | "deletedAt",
  cursor: SyncCursor,
) {
  const snapshotAt = new Date(cursor.snapshotAt);
  const since = cursor.since ? new Date(cursor.since) : null;
  const positionAt = cursor.position
    ? new Date(cursor.position.timestamp)
    : null;

  return {
    AND: [
      {
        [field]: {
          ...(since ? { gt: since } : {}),
          lte: snapshotAt,
        },
      },
      ...(positionAt && cursor.position
        ? [{
            OR: [
              { [field]: { gt: positionAt } },
              { [field]: positionAt, id: { gt: cursor.position.id } },
            ],
          }]
        : []),
    ],
  };
}

export function advanceSyncCursor(
  cursor: SyncCursor,
  items: Array<{ id: string; timestamp: string }>,
  hasMoreInPhase: boolean,
) {
  if (hasMoreInPhase) {
    const last = items.at(-1)!;
    return {
      ...cursor,
      position: { timestamp: last.timestamp, id: last.id },
    } satisfies SyncCursor;
  }

  const phase = nextSyncPhase(cursor.mode, cursor.phase);
  return phase
    ? ({ ...cursor, phase, position: null } satisfies SyncCursor)
    : null;
}
