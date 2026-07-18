import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { TRASH_GROUP_SYSTEM_KEY } from "@/lib/trash";

export type SearchResultType = "page" | "notebook" | "group" | "attachment";
export type SearchMatchedField = "title" | "bodyText" | "tags" | "name" | "fileName";

export type SearchResult = {
  type: SearchResultType;
  id: string;
  title: string;
  subtitle?: string;
  href: string;
  matchedField: SearchMatchedField;
};

export type SearchResultsPayload = {
  query: string;
  results: Record<SearchResultType, SearchResult[]>;
  /** Opaque keyset cursor. Pass it back to fetch the next page. */
  nextCursor: string | null;
};

export type SearchWorkspaceOptions = {
  cursor?: string | null;
  limit?: number;
};

type RankedSearchRow = {
  id: string;
  title: string;
  subtitle: string | null;
  matchedField: SearchMatchedField;
  score: number;
  sortAt: Date;
};

type RankedGroupRow = RankedSearchRow & {
  targetNotebookId: string | null;
  targetPageId: string | null;
};

type RankedAttachmentRow = RankedSearchRow & {
  pageId: string;
};

type SearchCursorPosition = {
  score: number;
  sortAt: string;
  id: string;
};

type SearchCursor = {
  version: 1;
  query: string;
  positions: Record<SearchResultType, SearchCursorPosition | null>;
  exhausted: Record<SearchResultType, boolean>;
};

const RESULT_TYPES: SearchResultType[] = ["page", "notebook", "group", "attachment"];
const DEFAULT_RESULTS_PER_TYPE = 5;
const MAX_RESULTS_PER_TYPE = 20;
const MAX_QUERY_LENGTH = 200;
const MAX_CURSOR_LENGTH = 4_096;

export class InvalidSearchCursorError extends Error {
  constructor() {
    super("Invalid search cursor.");
    this.name = "InvalidSearchCursorError";
  }
}

function normalizeQuery(query: string) {
  return query
    .normalize("NFKC")
    .toLocaleLowerCase("fa-IR")
    .replace(/[يى]/g, "ی")
    .replace(/ك/g, "ک")
    .replace(/[ۀة]/g, "ه")
    .replace(/ؤ/g, "و")
    .replace(/[إأٱ]/g, "ا")
    .replace(/[\u064b-\u065f\u0670\u06d6-\u06ed]/g, "")
    .replace(/[\s\u00a0\u200c]+/g, " ")
    .trim()
    .slice(0, MAX_QUERY_LENGTH);
}

function escapeLikePattern(value: string) {
  return value.replace(/[\\%_]/g, "\\$&");
}

function normalizeLimit(limit: number | undefined) {
  if (limit === undefined) {
    return DEFAULT_RESULTS_PER_TYPE;
  }

  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_RESULTS_PER_TYPE) {
    throw new RangeError(`Search limit must be between 1 and ${MAX_RESULTS_PER_TYPE}.`);
  }

  return limit;
}

function isCursorPosition(value: unknown): value is SearchCursorPosition {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<SearchCursorPosition>;
  return (
    typeof candidate.score === "number" &&
    Number.isFinite(candidate.score) &&
    typeof candidate.sortAt === "string" &&
    Number.isFinite(Date.parse(candidate.sortAt)) &&
    typeof candidate.id === "string" &&
    candidate.id.length > 0
  );
}

function createInitialCursor(query: string): SearchCursor {
  return {
    version: 1,
    query,
    positions: {
      page: null,
      notebook: null,
      group: null,
      attachment: null,
    },
    exhausted: {
      page: false,
      notebook: false,
      group: false,
      attachment: false,
    },
  };
}

function decodeCursor(rawCursor: string | null | undefined, query: string): SearchCursor {
  if (!rawCursor) {
    return createInitialCursor(query);
  }

  if (rawCursor.length > MAX_CURSOR_LENGTH) {
    throw new InvalidSearchCursorError();
  }

  try {
    const candidate = JSON.parse(
      Buffer.from(rawCursor, "base64url").toString("utf8"),
    ) as Partial<SearchCursor>;

    if (
      candidate.version !== 1 ||
      candidate.query !== query ||
      !candidate.positions ||
      !candidate.exhausted
    ) {
      throw new InvalidSearchCursorError();
    }

    for (const type of RESULT_TYPES) {
      const position = candidate.positions[type];
      if (
        typeof candidate.exhausted[type] !== "boolean" ||
        (position !== null && !isCursorPosition(position)) ||
        (!candidate.exhausted[type] && position === null)
      ) {
        throw new InvalidSearchCursorError();
      }
    }

    return candidate as SearchCursor;
  } catch (error) {
    if (error instanceof InvalidSearchCursorError) {
      throw error;
    }
    throw new InvalidSearchCursorError();
  }
}

function encodeCursor(cursor: SearchCursor) {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

function cursorPredicate(cursor: SearchCursor, type: SearchResultType) {
  if (cursor.exhausted[type]) {
    return Prisma.sql`FALSE`;
  }

  const position = cursor.positions[type];
  if (!position) {
    return Prisma.sql`TRUE`;
  }

  const sortAt = new Date(position.sortAt);
  return Prisma.sql`
    (
      "score" < ${position.score}
      OR (
        "score" = ${position.score}
        AND (
          "sortAt" < ${sortAt}
          OR ("sortAt" = ${sortAt} AND "id" > ${position.id})
        )
      )
    )
  `;
}

function makePosition(row: RankedSearchRow): SearchCursorPosition {
  return {
    score: row.score,
    sortAt: row.sortAt.toISOString(),
    id: row.id,
  };
}

function finalizeCursor(
  query: string,
  previous: SearchCursor,
  rows: Record<SearchResultType, RankedSearchRow[]>,
  limit: number,
) {
  const next = createInitialCursor(query);

  for (const type of RESULT_TYPES) {
    if (previous.exhausted[type]) {
      next.exhausted[type] = true;
      continue;
    }

    const hasMore = rows[type].length > limit;
    next.exhausted[type] = !hasMore;
    next.positions[type] = hasMore ? makePosition(rows[type][limit - 1]) : null;
  }

  return RESULT_TYPES.some((type) => !next.exhausted[type])
    ? encodeCursor(next)
    : null;
}

function emptyPayload(query = ""): SearchResultsPayload {
  return {
    query,
    results: {
      page: [],
      notebook: [],
      group: [],
      attachment: [],
    },
    nextCursor: null,
  };
}

export async function searchWorkspace(
  userId: string,
  rawQuery: string,
  options: SearchWorkspaceOptions = {},
): Promise<SearchResultsPayload> {
  const query = normalizeQuery(rawQuery);
  if (!query) {
    return emptyPayload();
  }

  const limit = normalizeLimit(options.limit);
  const cursor = decodeCursor(options.cursor, query);
  const escapedQuery = escapeLikePattern(query);
  const containsPattern = `%${escapedQuery}%`;
  const prefixPattern = `${escapedQuery}%`;
  const queryLimit = limit + 1;

  const pageCursor = cursorPredicate(cursor, "page");
  const notebookCursor = cursorPredicate(cursor, "notebook");
  const groupCursor = cursorPredicate(cursor, "group");
  const attachmentCursor = cursorPredicate(cursor, "attachment");

  const [pageRows, notebookRows, groupRows, attachmentRows] = await Promise.all([
    prisma.$queryRaw<RankedSearchRow[]>(Prisma.sql`
      WITH "parameters" AS (
        SELECT
          ${query}::text AS "query",
          ${containsPattern}::text AS "containsPattern",
          ${prefixPattern}::text AS "prefixPattern"
      ),
      "candidates" AS (
        SELECT
          p."id",
          'title'::text AS "matchedField",
          (
            CASE
              WHEN normalized."value" = parameters."query" THEN 430
              WHEN normalized."value" LIKE parameters."prefixPattern" ESCAPE '\\' THEN 420
              ELSE 410
            END + similarity(normalized."value", parameters."query") * 5
          )::double precision AS "score"
        FROM "pages" p
        CROSS JOIN "parameters" parameters
        CROSS JOIN LATERAL (
          SELECT notava_normalize_search_text(p."title") AS "value"
        ) normalized
        WHERE p."user_id" = ${userId}
          AND normalized."value" LIKE parameters."containsPattern" ESCAPE '\\'

        UNION ALL

        SELECT
          p."id",
          'bodyText'::text AS "matchedField",
          (
            CASE
              WHEN normalized."value" = parameters."query" THEN 230
              WHEN normalized."value" LIKE parameters."prefixPattern" ESCAPE '\\' THEN 220
              ELSE 210
            END + similarity(normalized."value", parameters."query") * 5
          )::double precision AS "score"
        FROM "pages" p
        CROSS JOIN "parameters" parameters
        CROSS JOIN LATERAL (
          SELECT notava_normalize_search_text(p."body_text") AS "value"
        ) normalized
        WHERE p."user_id" = ${userId}
          AND normalized."value" LIKE parameters."containsPattern" ESCAPE '\\'

        UNION ALL

        SELECT
          pt."page_id" AS "id",
          'tags'::text AS "matchedField",
          (
            CASE
              WHEN normalized."value" = parameters."query" THEN 280
              WHEN normalized."value" LIKE parameters."prefixPattern" ESCAPE '\\' THEN 270
              ELSE 260
            END + similarity(normalized."value", parameters."query") * 5
          )::double precision AS "score"
        FROM "page_tags" pt
        JOIN "pages" p ON p."id" = pt."page_id"
        CROSS JOIN "parameters" parameters
        CROSS JOIN LATERAL (
          SELECT notava_normalize_search_text(pt."value") AS "value"
        ) normalized
        WHERE p."user_id" = ${userId}
          AND normalized."value" LIKE parameters."containsPattern" ESCAPE '\\'
      ),
      "bestMatches" AS (
        SELECT DISTINCT ON (candidate."id")
          candidate."id",
          candidate."matchedField",
          candidate."score"
        FROM "candidates" candidate
        ORDER BY
          candidate."id",
          candidate."score" DESC,
          CASE candidate."matchedField"
            WHEN 'title' THEN 1
            WHEN 'tags' THEN 2
            ELSE 3
          END
      ),
      "ranked" AS (
        SELECT
          p."id",
          p."title",
          concat_ws(' / ', NULLIF(g."name", ''), n."name") AS "subtitle",
          best."matchedField" AS "matchedField",
          best."score" AS "score",
          p."updated_at" AS "sortAt"
        FROM "bestMatches" best
        JOIN "pages" p ON p."id" = best."id"
        JOIN "notebooks" n ON n."id" = p."notebook_id"
        JOIN "notebook_groups" g ON g."id" = n."group_id"
        WHERE p."user_id" = ${userId}
          AND p."archived" = FALSE
          AND p."deleted_at" IS NULL
          AND n."user_id" = ${userId}
          AND n."archived" = FALSE
          AND n."deleted_at" IS NULL
          AND g."user_id" = ${userId}
          AND (g."system_key" IS NULL OR g."system_key" <> ${TRASH_GROUP_SYSTEM_KEY})
      )
      SELECT *
      FROM "ranked"
      WHERE ${pageCursor}
      ORDER BY "score" DESC, "sortAt" DESC, "id" ASC
      LIMIT ${queryLimit}
    `),
    prisma.$queryRaw<RankedSearchRow[]>(Prisma.sql`
      WITH "parameters" AS (
        SELECT
          ${query}::text AS "query",
          ${containsPattern}::text AS "containsPattern",
          ${prefixPattern}::text AS "prefixPattern"
      ),
      "ranked" AS (
        SELECT
          n."id",
          n."name" AS "title",
          COALESCE(g."name", 'بدون مجموعه') AS "subtitle",
          'name'::text AS "matchedField",
          (
            CASE
              WHEN normalized."value" = parameters."query" THEN 430
              WHEN normalized."value" LIKE parameters."prefixPattern" ESCAPE '\\' THEN 420
              ELSE 410
            END + similarity(normalized."value", parameters."query") * 5
          )::double precision AS "score",
          n."updated_at" AS "sortAt"
        FROM "notebooks" n
        JOIN "notebook_groups" g ON g."id" = n."group_id"
        CROSS JOIN "parameters" parameters
        CROSS JOIN LATERAL (
          SELECT notava_normalize_search_text(n."name") AS "value"
        ) normalized
        WHERE n."user_id" = ${userId}
          AND n."archived" = FALSE
          AND n."deleted_at" IS NULL
          AND g."user_id" = ${userId}
          AND (g."system_key" IS NULL OR g."system_key" <> ${TRASH_GROUP_SYSTEM_KEY})
          AND normalized."value" LIKE parameters."containsPattern" ESCAPE '\\'
      )
      SELECT *
      FROM "ranked"
      WHERE ${notebookCursor}
      ORDER BY "score" DESC, "sortAt" DESC, "id" ASC
      LIMIT ${queryLimit}
    `),
    prisma.$queryRaw<RankedGroupRow[]>(Prisma.sql`
      WITH "parameters" AS (
        SELECT
          ${query}::text AS "query",
          ${containsPattern}::text AS "containsPattern",
          ${prefixPattern}::text AS "prefixPattern"
      ),
      "ranked" AS (
        SELECT
          g."id",
          g."name" AS "title",
          CASE
            WHEN target."notebookId" IS NULL
              THEN 'این مجموعه هنوز زیرمجموعه‌ای ندارد'
            WHEN target."pageId" IS NULL
              THEN 'اولین زیرمجموعه این مجموعه باز می‌شود'
            ELSE 'اولین نتیجه در صفحه‌های این مجموعه باز می‌شود'
          END AS "subtitle",
          'name'::text AS "matchedField",
          (
            CASE
              WHEN normalized."value" = parameters."query" THEN 430
              WHEN normalized."value" LIKE parameters."prefixPattern" ESCAPE '\\' THEN 420
              ELSE 410
            END + similarity(normalized."value", parameters."query") * 5
          )::double precision AS "score",
          g."updated_at" AS "sortAt",
          target."notebookId" AS "targetNotebookId",
          target."pageId" AS "targetPageId"
        FROM "notebook_groups" g
        CROSS JOIN "parameters" parameters
        CROSS JOIN LATERAL (
          SELECT notava_normalize_search_text(g."name") AS "value"
        ) normalized
        LEFT JOIN LATERAL (
          SELECT
            n."id" AS "notebookId",
            first_page."id" AS "pageId"
          FROM "notebooks" n
          LEFT JOIN LATERAL (
            SELECT p."id"
            FROM "pages" p
            WHERE p."notebook_id" = n."id"
              AND p."user_id" = ${userId}
              AND p."archived" = FALSE
              AND p."deleted_at" IS NULL
            ORDER BY p."sort_order" ASC, p."updated_at" ASC, p."id" ASC
            LIMIT 1
          ) first_page ON TRUE
          WHERE n."group_id" = g."id"
            AND n."user_id" = ${userId}
            AND n."archived" = FALSE
            AND n."deleted_at" IS NULL
          ORDER BY n."sort_order" ASC, n."created_at" ASC, n."id" ASC
          LIMIT 1
        ) target ON TRUE
        WHERE g."user_id" = ${userId}
          AND (g."system_key" IS NULL OR g."system_key" <> ${TRASH_GROUP_SYSTEM_KEY})
          AND normalized."value" LIKE parameters."containsPattern" ESCAPE '\\'
      )
      SELECT *
      FROM "ranked"
      WHERE ${groupCursor}
      ORDER BY "score" DESC, "sortAt" DESC, "id" ASC
      LIMIT ${queryLimit}
    `),
    prisma.$queryRaw<RankedAttachmentRow[]>(Prisma.sql`
      WITH "parameters" AS (
        SELECT
          ${query}::text AS "query",
          ${containsPattern}::text AS "containsPattern",
          ${prefixPattern}::text AS "prefixPattern"
      ),
      "ranked" AS (
        SELECT
          a."id",
          a."file_name" AS "title",
          p."id" AS "pageId",
          concat_ws(' / ', p."title", n."name") AS "subtitle",
          'fileName'::text AS "matchedField",
          (
            CASE
              WHEN normalized."value" = parameters."query" THEN 210
              WHEN normalized."value" LIKE parameters."prefixPattern" ESCAPE '\\' THEN 200
              ELSE 190
            END + similarity(normalized."value", parameters."query") * 5
          )::double precision AS "score",
          a."created_at" AS "sortAt"
        FROM "attachments" a
        JOIN "pages" p ON p."id" = a."page_id"
        JOIN "notebooks" n ON n."id" = p."notebook_id"
        JOIN "notebook_groups" g ON g."id" = n."group_id"
        CROSS JOIN "parameters" parameters
        CROSS JOIN LATERAL (
          SELECT notava_normalize_search_text(a."file_name") AS "value"
        ) normalized
        WHERE a."user_id" = ${userId}
          AND p."user_id" = ${userId}
          AND p."archived" = FALSE
          AND p."deleted_at" IS NULL
          AND n."user_id" = ${userId}
          AND n."archived" = FALSE
          AND n."deleted_at" IS NULL
          AND g."user_id" = ${userId}
          AND (g."system_key" IS NULL OR g."system_key" <> ${TRASH_GROUP_SYSTEM_KEY})
          AND normalized."value" LIKE parameters."containsPattern" ESCAPE '\\'
      )
      SELECT *
      FROM "ranked"
      WHERE ${attachmentCursor}
      ORDER BY "score" DESC, "sortAt" DESC, "id" ASC
      LIMIT ${queryLimit}
    `),
  ]);

  const allRows: Record<SearchResultType, RankedSearchRow[]> = {
    page: pageRows,
    notebook: notebookRows,
    group: groupRows,
    attachment: attachmentRows,
  };

  return {
    query,
    results: {
      page: pageRows.slice(0, limit).map((row) => ({
        type: "page",
        id: row.id,
        title: row.title,
        subtitle: row.subtitle ?? undefined,
        href: `/pages/${row.id}`,
        matchedField: row.matchedField,
      })),
      notebook: notebookRows.slice(0, limit).map((row) => ({
        type: "notebook",
        id: row.id,
        title: row.title,
        subtitle: row.subtitle ?? undefined,
        href: `/notebooks/${row.id}`,
        matchedField: "name",
      })),
      group: groupRows.slice(0, limit).map((row) => ({
        type: "group",
        id: row.id,
        title: row.title,
        subtitle: row.subtitle ?? undefined,
        href: row.targetPageId
          ? `/pages/${row.targetPageId}`
          : row.targetNotebookId
            ? `/notebooks/${row.targetNotebookId}`
            : "/",
        matchedField: "name",
      })),
      attachment: attachmentRows.slice(0, limit).map((row) => ({
        type: "attachment",
        id: row.id,
        title: row.title,
        subtitle: row.subtitle ?? undefined,
        href: `/pages/${row.pageId}`,
        matchedField: "fileName",
      })),
    },
    nextCursor: finalizeCursor(query, cursor, allRows, limit),
  };
}
