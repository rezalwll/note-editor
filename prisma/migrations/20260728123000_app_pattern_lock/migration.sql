ALTER TABLE "users"
ADD COLUMN "app_lock_pattern_hash" TEXT,
ADD COLUMN "app_lock_version" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "app_lock_failed_attempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "app_lock_blocked_until" TIMESTAMP(3);

CREATE TABLE "app_lock_reset_codes" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "code_hash" TEXT NOT NULL,
  "expires_at" TIMESTAMP(3) NOT NULL,
  "last_sent_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "failed_attempts" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "app_lock_reset_codes_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "app_lock_reset_codes_user_id_key"
ON "app_lock_reset_codes"("user_id");

CREATE INDEX "app_lock_reset_codes_expires_at_idx"
ON "app_lock_reset_codes"("expires_at");

ALTER TABLE "app_lock_reset_codes"
ADD CONSTRAINT "app_lock_reset_codes_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "users"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
