DELETE FROM "notebooks"
WHERE "group_id" IS NULL;

ALTER TABLE "notebooks"
DROP CONSTRAINT "notebooks_group_id_fkey";

ALTER TABLE "notebooks"
ALTER COLUMN "group_id" SET NOT NULL;

ALTER TABLE "notebooks"
ADD CONSTRAINT "notebooks_group_id_fkey"
FOREIGN KEY ("group_id") REFERENCES "notebook_groups"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
