-- AlterTable
ALTER TABLE "booking" ADD COLUMN     "actual_km" DOUBLE PRECISION,
ADD COLUMN     "cancellation_reason" TEXT,
ADD COLUMN     "car_model" TEXT,
ADD COLUMN     "extra_charge" DOUBLE PRECISION,
ADD COLUMN     "extra_km" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "user" ADD COLUMN     "is_verified" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "booking_note" (
    "id" SERIAL NOT NULL,
    "booking_id" INTEGER NOT NULL,
    "admin_id" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "booking_note_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fare_adjustment" (
    "id" SERIAL NOT NULL,
    "booking_id" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "description" TEXT,
    "admin_id" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fare_adjustment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_log" (
    "id" SERIAL NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" INTEGER NOT NULL,
    "action" TEXT NOT NULL,
    "old_value" TEXT,
    "new_value" TEXT,
    "admin_id" INTEGER NOT NULL,
    "reason" TEXT,
    "created_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "b2b_booking" (
    "id" SERIAL NOT NULL,
    "company_id" INTEGER NOT NULL,
    "booked_by" INTEGER NOT NULL,
    "pickup_location" TEXT NOT NULL,
    "drop_location" TEXT NOT NULL,
    "scheduled_at" TIMESTAMPTZ(6),
    "distance_km" DOUBLE PRECISION,
    "estimated_fare" DOUBLE PRECISION,
    "total_amount" DOUBLE PRECISION NOT NULL,
    "actual_km" DOUBLE PRECISION,
    "extra_km" DOUBLE PRECISION,
    "extra_charge" DOUBLE PRECISION,
    "status" TEXT NOT NULL DEFAULT 'CONFIRMED',
    "cancellation_reason" TEXT,
    "taxi_assign_status" TEXT NOT NULL DEFAULT 'NOT_ASSIGNED',
    "car_model" TEXT,
    "invoice_id" INTEGER,
    "is_invoiced" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6),

    CONSTRAINT "b2b_booking_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "b2b_assign_taxi" (
    "id" SERIAL NOT NULL,
    "booking_id" INTEGER NOT NULL,
    "driver_name" TEXT NOT NULL,
    "driver_number" TEXT NOT NULL,
    "cab_number" TEXT NOT NULL,
    "cab_name" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "b2b_assign_taxi_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "b2b_invoice" (
    "id" SERIAL NOT NULL,
    "company_id" INTEGER NOT NULL,
    "invoice_number" TEXT NOT NULL,
    "billing_period_start" TIMESTAMPTZ(6) NOT NULL,
    "billing_period_end" TIMESTAMPTZ(6) NOT NULL,
    "total_amount" DOUBLE PRECISION NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "due_date" TIMESTAMPTZ(6) NOT NULL,
    "paid_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "b2b_invoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "b2b_payment" (
    "id" SERIAL NOT NULL,
    "company_id" INTEGER NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "payment_mode" TEXT NOT NULL,
    "reference_no" TEXT,
    "notes" TEXT,
    "paid_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" INTEGER,

    CONSTRAINT "b2b_payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fleet_vehicle" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "seats" INTEGER NOT NULL,
    "base_price_per_km" DOUBLE PRECISION NOT NULL DEFAULT 13.0,
    "base_price_airport" DOUBLE PRECISION NOT NULL DEFAULT 1500.0,
    "category" TEXT NOT NULL,
    "description" TEXT,
    "image_url" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "fleet_vehicle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "b2b_company_fleet" (
    "id" SERIAL NOT NULL,
    "company_id" INTEGER NOT NULL,
    "fleet_vehicle_id" INTEGER NOT NULL,
    "custom_price_per_km" DOUBLE PRECISION NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "b2b_company_fleet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "driver" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "license_no" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "driver_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pricing_settings" (
    "id" SERIAL NOT NULL,
    "min_km_threshold" DOUBLE PRECISION NOT NULL DEFAULT 100.0,
    "min_km_airport_apply" BOOLEAN NOT NULL DEFAULT false,
    "min_km_oneway_apply" BOOLEAN NOT NULL DEFAULT false,
    "min_km_roundtrip_apply" BOOLEAN NOT NULL DEFAULT false,
    "service_airport_enabled" BOOLEAN NOT NULL DEFAULT true,
    "service_oneway_enabled" BOOLEAN NOT NULL DEFAULT true,
    "service_roundtrip_enabled" BOOLEAN NOT NULL DEFAULT true,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "pricing_settings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "booking_note_booking_id_idx" ON "booking_note"("booking_id");

-- CreateIndex
CREATE INDEX "fare_adjustment_booking_id_idx" ON "fare_adjustment"("booking_id");

-- CreateIndex
CREATE INDEX "audit_log_entity_type_entity_id_idx" ON "audit_log"("entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "audit_log_admin_id_idx" ON "audit_log"("admin_id");

-- CreateIndex
CREATE INDEX "b2b_booking_company_id_idx" ON "b2b_booking"("company_id");

-- CreateIndex
CREATE INDEX "b2b_booking_status_idx" ON "b2b_booking"("status");

-- CreateIndex
CREATE INDEX "b2b_booking_invoice_id_idx" ON "b2b_booking"("invoice_id");

-- CreateIndex
CREATE UNIQUE INDEX "b2b_invoice_invoice_number_key" ON "b2b_invoice"("invoice_number");

-- CreateIndex
CREATE INDEX "b2b_invoice_company_id_idx" ON "b2b_invoice"("company_id");

-- CreateIndex
CREATE INDEX "b2b_invoice_status_idx" ON "b2b_invoice"("status");

-- CreateIndex
CREATE INDEX "b2b_payment_company_id_idx" ON "b2b_payment"("company_id");

-- CreateIndex
CREATE INDEX "b2b_company_fleet_company_id_idx" ON "b2b_company_fleet"("company_id");

-- CreateIndex
CREATE UNIQUE INDEX "b2b_company_fleet_company_id_fleet_vehicle_id_key" ON "b2b_company_fleet"("company_id", "fleet_vehicle_id");

-- CreateIndex
CREATE UNIQUE INDEX "driver_phone_key" ON "driver"("phone");

-- CreateIndex
CREATE INDEX "driver_phone_idx" ON "driver"("phone");

-- CreateIndex
CREATE INDEX "booking_status_idx" ON "booking"("status");

-- CreateIndex
CREATE INDEX "booking_taxi_assign_status_idx" ON "booking"("taxi_assign_status");

-- AddForeignKey
ALTER TABLE "b2b_booking" ADD CONSTRAINT "b2b_booking_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "b2b_company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "b2b_booking" ADD CONSTRAINT "b2b_booking_booked_by_fkey" FOREIGN KEY ("booked_by") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "b2b_booking" ADD CONSTRAINT "b2b_booking_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "b2b_invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "b2b_assign_taxi" ADD CONSTRAINT "b2b_assign_taxi_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "b2b_booking"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "b2b_invoice" ADD CONSTRAINT "b2b_invoice_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "b2b_company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "b2b_payment" ADD CONSTRAINT "b2b_payment_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "b2b_company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "b2b_company_fleet" ADD CONSTRAINT "b2b_company_fleet_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "b2b_company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "b2b_company_fleet" ADD CONSTRAINT "b2b_company_fleet_fleet_vehicle_id_fkey" FOREIGN KEY ("fleet_vehicle_id") REFERENCES "fleet_vehicle"("id") ON DELETE CASCADE ON UPDATE CASCADE;
