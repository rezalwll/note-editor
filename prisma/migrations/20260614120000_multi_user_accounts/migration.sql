ALTER TABLE "users"
ADD COLUMN "username" TEXT,
ADD COLUMN "display_name" TEXT;

UPDATE "users"
SET
  "username" = COALESCE("username", 'owner'),
  "display_name" = COALESCE("display_name", 'Owner');

ALTER TABLE "users"
ALTER COLUMN "username" SET NOT NULL,
ALTER COLUMN "display_name" SET NOT NULL;

CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

ALTER TABLE "notebook_groups"
ADD COLUMN "user_id" TEXT;

ALTER TABLE "notebooks"
ADD COLUMN "user_id" TEXT;

ALTER TABLE "pages"
ADD COLUMN "user_id" TEXT;

ALTER TABLE "attachments"
ADD COLUMN "user_id" TEXT;

UPDATE "notebook_groups"
SET "user_id" = (SELECT "id" FROM "users" ORDER BY "created_at" ASC LIMIT 1)
WHERE "user_id" IS NULL;

UPDATE "notebooks"
SET "user_id" = (SELECT "id" FROM "users" ORDER BY "created_at" ASC LIMIT 1)
WHERE "user_id" IS NULL;

UPDATE "pages"
SET "user_id" = (SELECT "id" FROM "users" ORDER BY "created_at" ASC LIMIT 1)
WHERE "user_id" IS NULL;

UPDATE "attachments"
SET "user_id" = (SELECT "id" FROM "users" ORDER BY "created_at" ASC LIMIT 1)
WHERE "user_id" IS NULL;

ALTER TABLE "notebook_groups"
ALTER COLUMN "user_id" SET NOT NULL;

ALTER TABLE "notebooks"
ALTER COLUMN "user_id" SET NOT NULL;

ALTER TABLE "pages"
ALTER COLUMN "user_id" SET NOT NULL;

ALTER TABLE "attachments"
ALTER COLUMN "user_id" SET NOT NULL;

CREATE INDEX "notebook_groups_user_id_updated_at_idx" ON "notebook_groups"("user_id", "updated_at");
CREATE INDEX "notebooks_user_id_group_id_archived_idx" ON "notebooks"("user_id", "group_id", "archived");
CREATE INDEX "notebooks_user_id_updated_at_idx" ON "notebooks"("user_id", "updated_at");
CREATE INDEX "pages_user_id_notebook_id_archived_idx" ON "pages"("user_id", "notebook_id", "archived");
CREATE INDEX "pages_user_id_updated_at_idx" ON "pages"("user_id", "updated_at");
CREATE INDEX "attachments_user_id_page_id_idx" ON "attachments"("user_id", "page_id");

ALTER TABLE "notebook_groups"
ADD CONSTRAINT "notebook_groups_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "notebooks"
ADD CONSTRAINT "notebooks_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "pages"
ADD CONSTRAINT "pages_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "attachments"
ADD CONSTRAINT "attachments_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
