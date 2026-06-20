ALTER TABLE "notebooks"
ADD COLUMN "system_key" TEXT;

ALTER TABLE "pages"
ADD COLUMN "original_notebook_id" TEXT;

CREATE UNIQUE INDEX "notebooks_user_id_system_key_key"
ON "notebooks"("user_id", "system_key");

CREATE INDEX "pages_user_id_original_notebook_id_idx"
ON "pages"("user_id", "original_notebook_id");

INSERT INTO "notebook_groups" (
  "id",
  "user_id",
  "name",
  "system_key",
  "created_at",
  "updated_at"
)
SELECT
  'trashgrp_' || substr(md5("users"."id"), 1, 20),
  "users"."id",
  'حذف‌شده‌ها',
  'deleted-items',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "users"
ON CONFLICT ("user_id", "system_key") DO NOTHING;

UPDATE "notebooks" AS "notebook"
SET
  "group_id" = "trash_group"."id",
  "deleted_at" = COALESCE("notebook"."deleted_at", "notebook"."updated_at"),
  "archived" = false
FROM "notebook_groups" AS "trash_group"
WHERE
  "trash_group"."user_id" = "notebook"."user_id"
  AND "trash_group"."system_key" = 'deleted-items'
  AND "notebook"."archived" = true;

UPDATE "pages" AS "page"
SET
  "deleted_at" = COALESCE("page"."deleted_at", "page"."updated_at"),
  "archived" = false
FROM "notebooks" AS "notebook"
WHERE
  "page"."notebook_id" = "notebook"."id"
  AND "notebook"."deleted_at" IS NOT NULL
  AND "notebook"."system_key" IS NULL;

INSERT INTO "notebooks" (
  "id",
  "user_id",
  "group_id",
  "system_key",
  "name",
  "description",
  "archived",
  "deleted_at",
  "created_at",
  "updated_at"
)
SELECT
  'trashpages_' || substr(md5("user"."id"), 1, 20),
  "user"."id",
  "trash_group"."id",
  'deleted-pages',
  'صفحه‌های حذف‌شده',
  NULL,
  false,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "users" AS "user"
JOIN "notebook_groups" AS "trash_group"
  ON "trash_group"."user_id" = "user"."id"
  AND "trash_group"."system_key" = 'deleted-items'
WHERE EXISTS (
  SELECT 1
  FROM "pages" AS "page"
  JOIN "notebooks" AS "source_notebook"
    ON "source_notebook"."id" = "page"."notebook_id"
  WHERE
    "page"."user_id" = "user"."id"
    AND "page"."archived" = true
    AND "source_notebook"."deleted_at" IS NULL
)
ON CONFLICT ("user_id", "system_key") DO NOTHING;

UPDATE "pages" AS "page"
SET
  "original_notebook_id" = "page"."notebook_id",
  "notebook_id" = "trash_notebook"."id",
  "deleted_at" = COALESCE("page"."deleted_at", "page"."updated_at"),
  "archived" = false
FROM "notebooks" AS "source_notebook", "notebooks" AS "trash_notebook"
WHERE
  "source_notebook"."id" = "page"."notebook_id"
  AND "source_notebook"."deleted_at" IS NULL
  AND "page"."archived" = true
  AND "trash_notebook"."user_id" = "page"."user_id"
  AND "trash_notebook"."system_key" = 'deleted-pages';
