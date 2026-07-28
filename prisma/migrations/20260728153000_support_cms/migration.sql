ALTER TABLE "users"
ADD COLUMN "is_admin" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "last_seen_at" TIMESTAMP(3),
ADD COLUMN "total_page_views" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "total_active_seconds" INTEGER NOT NULL DEFAULT 0;

WITH "first_user" AS (
  SELECT "id"
  FROM "users"
  ORDER BY "created_at" ASC
  LIMIT 1
)
UPDATE "users"
SET "is_admin" = true
WHERE "id" IN (SELECT "id" FROM "first_user");

CREATE TABLE "support_tickets" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "subject" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'OPEN',
  "priority" TEXT NOT NULL DEFAULT 'NORMAL',
  "last_message_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "support_tickets_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "support_ticket_messages" (
  "id" TEXT NOT NULL,
  "ticket_id" TEXT NOT NULL,
  "author_id" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "is_staff" BOOLEAN NOT NULL DEFAULT false,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "support_ticket_messages_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "user_usage_daily" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "day" DATE NOT NULL,
  "page_views" INTEGER NOT NULL DEFAULT 0,
  "active_seconds" INTEGER NOT NULL DEFAULT 0,
  "last_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "user_usage_daily_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "route_usage_daily" (
  "id" TEXT NOT NULL,
  "day" DATE NOT NULL,
  "path" TEXT NOT NULL,
  "page_views" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "route_usage_daily_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "support_tickets_user_id_last_message_at_idx"
ON "support_tickets"("user_id", "last_message_at");

CREATE INDEX "support_tickets_status_last_message_at_idx"
ON "support_tickets"("status", "last_message_at");

CREATE INDEX "support_ticket_messages_ticket_id_created_at_idx"
ON "support_ticket_messages"("ticket_id", "created_at");

CREATE UNIQUE INDEX "user_usage_daily_user_id_day_key"
ON "user_usage_daily"("user_id", "day");

CREATE INDEX "user_usage_daily_day_idx"
ON "user_usage_daily"("day");

CREATE UNIQUE INDEX "route_usage_daily_day_path_key"
ON "route_usage_daily"("day", "path");

CREATE INDEX "route_usage_daily_day_idx"
ON "route_usage_daily"("day");

ALTER TABLE "support_tickets"
ADD CONSTRAINT "support_tickets_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "users"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "support_ticket_messages"
ADD CONSTRAINT "support_ticket_messages_ticket_id_fkey"
FOREIGN KEY ("ticket_id") REFERENCES "support_tickets"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "support_ticket_messages"
ADD CONSTRAINT "support_ticket_messages_author_id_fkey"
FOREIGN KEY ("author_id") REFERENCES "users"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "user_usage_daily"
ADD CONSTRAINT "user_usage_daily_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "users"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
