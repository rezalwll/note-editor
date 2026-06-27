ALTER TABLE "notebook_groups"
ADD COLUMN "theme_key" TEXT;

ALTER TABLE "notebooks"
ADD COLUMN "theme_key" TEXT;

WITH numbered_groups AS (
  SELECT
    "id",
    CASE MOD(ROW_NUMBER() OVER (
      PARTITION BY "user_id"
      ORDER BY "sort_order" ASC, "created_at" ASC, "id" ASC
    ) - 1, 10)
      WHEN 0 THEN 'iris'
      WHEN 1 THEN 'sky'
      WHEN 2 THEN 'mint'
      WHEN 3 THEN 'rose'
      WHEN 4 THEN 'amber'
      WHEN 5 THEN 'teal'
      WHEN 6 THEN 'coral'
      WHEN 7 THEN 'violet'
      WHEN 8 THEN 'ocean'
      ELSE 'lime'
    END AS theme_key
  FROM "notebook_groups"
  WHERE "theme_key" IS NULL
)
UPDATE "notebook_groups" AS target
SET "theme_key" = numbered_groups.theme_key
FROM numbered_groups
WHERE target."id" = numbered_groups."id";

WITH numbered_notebooks AS (
  SELECT
    "id",
    CASE MOD(ROW_NUMBER() OVER (
      PARTITION BY "user_id", "group_id"
      ORDER BY "sort_order" ASC, "created_at" ASC, "id" ASC
    ) - 1, 10)
      WHEN 0 THEN 'sky'
      WHEN 1 THEN 'amber'
      WHEN 2 THEN 'teal'
      WHEN 3 THEN 'rose'
      WHEN 4 THEN 'ocean'
      WHEN 5 THEN 'lime'
      WHEN 6 THEN 'coral'
      WHEN 7 THEN 'iris'
      WHEN 8 THEN 'mint'
      ELSE 'violet'
    END AS theme_key
  FROM "notebooks"
  WHERE "theme_key" IS NULL
)
UPDATE "notebooks" AS target
SET "theme_key" = numbered_notebooks.theme_key
FROM numbered_notebooks
WHERE target."id" = numbered_notebooks."id";
