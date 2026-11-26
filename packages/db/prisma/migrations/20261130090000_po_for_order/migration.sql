-- Purchase order lines raised for a specific customer order
-- AlterTable
ALTER TABLE "PurchaseOrderLine" ADD COLUMN     "salesOrderId" TEXT;

-- CreateIndex
CREATE INDEX "PurchaseOrderLine_salesOrderId_idx" ON "PurchaseOrderLine"("salesOrderId");

-- AddForeignKey
ALTER TABLE "PurchaseOrderLine" ADD CONSTRAINT "PurchaseOrderLine_salesOrderId_fkey" FOREIGN KEY ("salesOrderId") REFERENCES "SalesOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

