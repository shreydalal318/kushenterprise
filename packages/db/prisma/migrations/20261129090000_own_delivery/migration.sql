-- Own delivery staff, pickup, proof of delivery on dispatches
-- CreateEnum
CREATE TYPE "DispatchMethod" AS ENUM ('OWN_DELIVERY', 'COURIER', 'TRANSPORT', 'PICKUP');

-- AlterTable
ALTER TABLE "Dispatch" ADD COLUMN     "deliveredAt" TIMESTAMP(3),
ADD COLUMN     "deliveryNote" TEXT,
ADD COLUMN     "deliveryPersonId" TEXT,
ADD COLUMN     "deliveryPersonMobile" TEXT,
ADD COLUMN     "deliveryPersonName" TEXT,
ADD COLUMN     "method" "DispatchMethod" NOT NULL DEFAULT 'COURIER',
ADD COLUMN     "receivedBy" TEXT;

-- CreateIndex
CREATE INDEX "Dispatch_deliveryPersonId_deliveredAt_idx" ON "Dispatch"("deliveryPersonId", "deliveredAt");

-- AddForeignKey
ALTER TABLE "Dispatch" ADD CONSTRAINT "Dispatch_deliveryPersonId_fkey" FOREIGN KEY ("deliveryPersonId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

