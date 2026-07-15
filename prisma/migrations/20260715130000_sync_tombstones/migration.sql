CREATE TABLE "entity_tombstones" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "deleted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "entity_tombstones_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "entity_tombstones_entity_type_check"
      CHECK ("entity_type" IN ('notebook', 'page'))
);

CREATE UNIQUE INDEX "entity_tombstones_user_id_entity_type_entity_id_key"
    ON "entity_tombstones"("user_id", "entity_type", "entity_id");
CREATE INDEX "entity_tombstones_user_id_deleted_at_id_idx"
    ON "entity_tombstones"("user_id", "deleted_at", "id");

ALTER TABLE "entity_tombstones"
    ADD CONSTRAINT "entity_tombstones_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
