-- DropForeignKey
ALTER TABLE "assign_taxi" DROP CONSTRAINT "assign_taxi_booking_id_fkey";

-- AlterTable
ALTER TABLE "PasswordResetOtp" ALTER COLUMN "created_at" DROP NOT NULL;

-- AlterTable
ALTER TABLE "assign_taxi" ALTER COLUMN "driver_name" SET DATA TYPE TEXT,
ALTER COLUMN "driver_number" SET DATA TYPE TEXT,
ALTER COLUMN "cab_number" SET DATA TYPE TEXT,
ALTER COLUMN "cab_name" SET DATA TYPE TEXT,
ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "booking" ALTER COLUMN "taxi_assign_status" SET DATA TYPE TEXT;

-- AlterTable
ALTER TABLE "payment" ADD COLUMN     "remaining_amount" DOUBLE PRECISION DEFAULT 0;

-- AddForeignKey
ALTER TABLE "assign_taxi" ADD CONSTRAINT "assign_taxi_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "booking"("id") ON DELETE CASCADE ON UPDATE CASCADE;
