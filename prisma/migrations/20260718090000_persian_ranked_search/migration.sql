-- pg_trgm keeps substring search fast and works better than a language-specific
-- dictionary for Persian text, filenames and partially typed words.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Keep normalization identical to lib/search.ts.  The function is immutable so
-- PostgreSQL can use it in expression indexes and for deterministic keyset ranks.
CREATE OR REPLACE FUNCTION notava_normalize_search_text(input text)
RETURNS text
LANGUAGE sql
IMMUTABLE
STRICT
PARALLEL SAFE
AS $$
  SELECT trim(
    regexp_replace(
      replace(
        replace(
          translate(
            translate(
              lower(normalize(input, NFKC)),
              'يىكۀةؤإأٱ',
              'ییکههوااا'
            ),
            'ًٌٍَُِّْٰٕٖٜٟٓٔٗ٘ٙٚٛٝٞۖۗۘۙۚۛۜ۝۞ۣ۟۠ۡۢۤۥۦۧۨ۩۪ۭ۫۬',
            ''
          ),
          chr(8204),
          ' '
        ),
        chr(160),
        ' '
      ),
      '[[:space:]]+',
      ' ',
      'g'
    )
  );
$$;

-- Build the replacement indexes before dropping the former raw-column ones.
-- This costs temporary disk space, but avoids leaving search unindexed if an
-- index build fails partway through the deployment.
CREATE INDEX "pages_title_search_trgm_idx"
  ON "pages" USING GIN (notava_normalize_search_text("title") gin_trgm_ops);
CREATE INDEX "pages_body_text_search_trgm_idx"
  ON "pages" USING GIN (notava_normalize_search_text("body_text") gin_trgm_ops);
CREATE INDEX "notebooks_name_search_trgm_idx"
  ON "notebooks" USING GIN (notava_normalize_search_text("name") gin_trgm_ops);
CREATE INDEX "notebook_groups_name_search_trgm_idx"
  ON "notebook_groups" USING GIN (notava_normalize_search_text("name") gin_trgm_ops);
CREATE INDEX "attachments_file_name_search_trgm_idx"
  ON "attachments" USING GIN (notava_normalize_search_text("file_name") gin_trgm_ops);
CREATE INDEX "page_tags_value_search_trgm_idx"
  ON "page_tags" USING GIN (notava_normalize_search_text("value") gin_trgm_ops);

DROP INDEX IF EXISTS "pages_title_trgm_idx";
DROP INDEX IF EXISTS "pages_body_text_trgm_idx";
DROP INDEX IF EXISTS "notebooks_name_trgm_idx";
DROP INDEX IF EXISTS "notebook_groups_name_trgm_idx";
DROP INDEX IF EXISTS "attachments_file_name_trgm_idx";
DROP INDEX IF EXISTS "page_tags_value_trgm_idx";
