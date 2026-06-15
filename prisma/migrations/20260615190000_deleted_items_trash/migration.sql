ALTER TABLE "notebooks"
ADD COLUMN "deleted_at" TIMESTAMP(3);

ALTER TABLE "pages"
ADD COLUMN "deleted_at" TIMESTAMP(3);

ALTER TABLE "notebook_groups"
ADD COLUMN "system_key" TEXT;

CREATE INDEX "notebooks_user_id_deleted_at_idx"
ON "notebooks"("user_id", "deleted_at");

CREATE INDEX "pages_user_id_deleted_at_idx"
ON "pages"("user_id", "deleted_at");

CREATE INDEX "notebook_groups_user_id_system_key_idx"
ON "notebook_groups"("user_id", "system_key");

CREATE UNIQUE INDEX "notebook_groups_user_id_system_key_key"
ON "notebook_groups"("user_id", "system_key");
