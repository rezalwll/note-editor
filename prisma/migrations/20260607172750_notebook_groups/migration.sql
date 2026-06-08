-- AlterTable
ALTER TABLE "notebooks" ADD COLUMN     "group_id" TEXT;

-- CreateTable
CREATE TABLE "notebook_groups" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notebook_groups_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "notebooks_group_id_archived_idx" ON "notebooks"("group_id", "archived");

-- AddForeignKey
ALTER TABLE "notebooks" ADD CONSTRAINT "notebooks_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "notebook_groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;
