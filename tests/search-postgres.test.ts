import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const runDatabaseChecks =
  process.env.CI === "true" && Boolean(process.env.DATABASE_URL);

describe.runIf(runDatabaseChecks)("PostgreSQL search migration", () => {
  const client = new Client({ connectionString: process.env.DATABASE_URL });

  beforeAll(async () => {
    await client.connect();
  });

  afterAll(async () => {
    await client.end();
  });

  it("normalizes Arabic variants, diacritics and Persian spacing", async () => {
    const result = await client.query<{ value: string }>(
      "SELECT notava_normalize_search_text($1) AS value",
      ["  برنامۀ‌نويسي ي ك  "],
    );

    expect(result.rows[0].value).toBe("برنامه نویسی ی ک");
  });

  it("uses the normalized trigram expression index for substring search", async () => {
    await client.query("SET enable_seqscan = off");
    const result = await client.query<{ "QUERY PLAN": string }>(
      `EXPLAIN (COSTS OFF)
       SELECT "id"
       FROM "pages"
       WHERE notava_normalize_search_text("title") LIKE $1`,
      ["%برنامه%"],
    );
    const plan = result.rows.map((row) => row["QUERY PLAN"]).join("\n");

    expect(plan).toMatch(
      /Bitmap Index Scan on pages_title_(?:search_)?trgm_idx/,
    );
  });
});
