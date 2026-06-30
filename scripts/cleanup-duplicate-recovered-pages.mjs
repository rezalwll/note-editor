import "dotenv/config";

import pg from "pg";

const { Pool } = pg;
const apply = process.argv.includes("--apply");
const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  console.error("DATABASE_URL is required.");
  process.exit(1);
}

const pool = new Pool({ connectionString: databaseUrl });

const equivalentRecoveredSql = `
  DELETE FROM pages recovered
  WHERE recovered.title LIKE '% (Recovered)'
    AND NOT EXISTS (
      SELECT 1
      FROM attachments attachment
      WHERE attachment.page_id = recovered.id
    )
    AND EXISTS (
      SELECT 1
      FROM pages canonical
      WHERE canonical.id <> recovered.id
        AND canonical.user_id = recovered.user_id
        AND canonical.notebook_id = recovered.notebook_id
        AND canonical.title = regexp_replace(recovered.title, ' \\(Recovered\\)$', '')
        AND canonical.body_html = recovered.body_html
        AND canonical.body_text = recovered.body_text
        AND canonical.archived = recovered.archived
        AND (
          canonical.deleted_at IS NOT DISTINCT FROM recovered.deleted_at
        )
    )
  RETURNING id, title, notebook_id AS "notebookId", created_at AS "createdAt";
`;

const duplicateRecoveredSql = `
  WITH ranked AS (
    SELECT
      recovered.id,
      row_number() OVER (
        PARTITION BY
          recovered.user_id,
          recovered.notebook_id,
          recovered.title,
          recovered.body_html,
          recovered.body_text,
          recovered.archived,
          recovered.deleted_at
        ORDER BY recovered.created_at ASC, recovered.id ASC
      ) AS duplicate_rank
    FROM pages recovered
    WHERE recovered.title LIKE '% (Recovered)'
      AND NOT EXISTS (
        SELECT 1
        FROM attachments attachment
        WHERE attachment.page_id = recovered.id
      )
  )
  DELETE FROM pages recovered
  USING ranked
  WHERE recovered.id = ranked.id
    AND ranked.duplicate_rank > 1
  RETURNING recovered.id, recovered.title, recovered.notebook_id AS "notebookId", recovered.created_at AS "createdAt";
`;

function summarize(label, rows) {
  console.log(`${label}: ${rows.length}`);

  for (const row of rows.slice(0, 20)) {
    console.log(`- ${row.id} | ${row.title} | ${row.notebookId} | ${row.createdAt.toISOString()}`);
  }

  if (rows.length > 20) {
    console.log(`... ${rows.length - 20} more`);
  }
}

let client;

try {
  client = await pool.connect();
  await client.query("BEGIN");

  const equivalentRecovered = await client.query(equivalentRecoveredSql);
  const duplicateRecovered = await client.query(duplicateRecoveredSql);

  summarize("Recovered pages matching canonical pages", equivalentRecovered.rows);
  summarize("Duplicate recovered pages", duplicateRecovered.rows);

  if (apply) {
    await client.query("COMMIT");
    console.log("Cleanup applied.");
  } else {
    await client.query("ROLLBACK");
    console.log("Dry run only. Re-run with --apply to delete these rows.");
  }
} catch (error) {
  if (client) {
    await client.query("ROLLBACK");
  }
  console.error("Cleanup failed.", error);
  process.exitCode = 1;
} finally {
  client?.release();
  await pool.end();
}
