ALTER TABLE "notebook_groups"
ADD COLUMN "sort_order" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "notebooks"
ADD COLUMN "sort_order" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "pages"
ADD COLUMN "sort_order" INTEGER NOT NULL DEFAULT 0;

WITH ordered_groups AS (
  SELECT
    "id",
    ROW_NUMBER() OVER (
      PARTITION BY "user_id"
      ORDER BY
        CASE WHEN "system_key" = 'deleted-items' THEN 1 ELSE 0 END,
        "created_at" ASC,
        "id" ASC
    ) - 1 AS position
  FROM "notebook_groups"
)
UPDATE "notebook_groups" AS target
SET "sort_order" = ordered_groups.position
FROM ordered_groups
WHERE target."id" = ordered_groups."id";

WITH ordered_notebooks AS (
  SELECT
    "id",
    ROW_NUMBER() OVER (
      PARTITION BY "user_id", "group_id"
      ORDER BY "created_at" ASC, "id" ASC
    ) - 1 AS position
  FROM "notebooks"
)
UPDATE "notebooks" AS target
SET "sort_order" = ordered_notebooks.position
FROM ordered_notebooks
WHERE target."id" = ordered_notebooks."id";

WITH ordered_pages AS (
  SELECT
    "id",
    ROW_NUMBER() OVER (
      PARTITION BY "user_id", "notebook_id"
      ORDER BY "sort_order" ASC, "updated_at" ASC, "created_at" ASC, "id" ASC
    ) - 1 AS position
  FROM "pages"
)
UPDATE "pages" AS target
SET "sort_order" = ordered_pages.position
FROM ordered_pages
WHERE target."id" = ordered_pages."id";
