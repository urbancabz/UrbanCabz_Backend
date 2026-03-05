-- CreateTable
CREATE TABLE "PasswordResetOtp" (
    "id" SERIAL PRIMARY KEY,
    "user_id" INTEGER NOT NULL,
    "otp_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ NOT NULL,
    "verified" BOOLEAN NOT NULL DEFAULT FALSE,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- AddForeignKey
ALTER TABLE "PasswordResetOtp"
  ADD CONSTRAINT "PasswordResetOtp_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "user"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- Indexes to speed up lookups and cleanup
CREATE INDEX "PasswordResetOtp_user_id_idx" ON "PasswordResetOtp" ("user_id");
CREATE INDEX "PasswordResetOtp_expires_at_idx" ON "PasswordResetOtp" ("expires_at");

