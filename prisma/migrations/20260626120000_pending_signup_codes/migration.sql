CREATE TABLE "pending_signups" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "verification_code_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "last_sent_at" TIMESTAMP(3) NOT NULL,
    "resend_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pending_signups_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "pending_signups_email_key" ON "pending_signups"("email");
CREATE UNIQUE INDEX "pending_signups_username_key" ON "pending_signups"("username");
CREATE INDEX "pending_signups_email_expires_at_idx" ON "pending_signups"("email", "expires_at");
CREATE INDEX "pending_signups_username_expires_at_idx" ON "pending_signups"("username", "expires_at");

DROP TABLE IF EXISTS "email_verification_tokens";
