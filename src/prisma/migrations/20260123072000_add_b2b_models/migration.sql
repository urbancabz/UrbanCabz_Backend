-- AlterTable
ALTER TABLE "user" ADD COLUMN "is_first_login" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "b2b_company" (
    "id" SERIAL NOT NULL,
    "company_name" TEXT NOT NULL,
    "company_email" TEXT NOT NULL,
    "company_phone" TEXT NOT NULL,
    "address" TEXT,
    "city" TEXT,
    "state" TEXT,
    "pincode" TEXT,
    "gst_number" TEXT,
    "created_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6),

    CONSTRAINT "b2b_company_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "b2b_request" (
    "id" SERIAL NOT NULL,
    "company_id" INTEGER,
    "contact_name" TEXT NOT NULL,
    "contact_email" TEXT NOT NULL,
    "contact_phone" TEXT NOT NULL,
    "company_name" TEXT NOT NULL,
    "message" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "admin_notes" TEXT,
    "reviewed_by" INTEGER,
    "reviewed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6),

    CONSTRAINT "b2b_request_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "b2b_user" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "company_id" INTEGER NOT NULL,
    "position" TEXT,
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "b2b_user_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "b2b_company_company_email_key" ON "b2b_company"("company_email");

-- CreateIndex
CREATE INDEX "b2b_request_status_idx" ON "b2b_request"("status");

-- CreateIndex
CREATE INDEX "b2b_request_contact_email_idx" ON "b2b_request"("contact_email");

-- CreateIndex
CREATE INDEX "b2b_user_company_id_idx" ON "b2b_user"("company_id");

-- CreateIndex
CREATE UNIQUE INDEX "b2b_user_user_id_company_id_key" ON "b2b_user"("user_id", "company_id");

-- AddForeignKey
ALTER TABLE "b2b_request" ADD CONSTRAINT "b2b_request_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "b2b_company"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "b2b_user" ADD CONSTRAINT "b2b_user_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "b2b_user" ADD CONSTRAINT "b2b_user_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "b2b_company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
