-- Add taxi_assign_status to booking table and create assign_taxi table

ALTER TABLE "booking"
ADD COLUMN IF NOT EXISTS "taxi_assign_status" VARCHAR(50) NOT NULL DEFAULT 'NOT_ASSIGNED';

CREATE TABLE IF NOT EXISTS "assign_taxi" (
  "id" SERIAL PRIMARY KEY,
  "booking_id" INTEGER NOT NULL REFERENCES "booking"("id") ON DELETE CASCADE,
  "driver_name" VARCHAR(255) NOT NULL,
  "driver_number" VARCHAR(50) NOT NULL,
  "cab_number" VARCHAR(100) NOT NULL,
  "cab_name" VARCHAR(255) NOT NULL,
  "created_at" TIMESTAMPTZ DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ DEFAULT NOW()
);


