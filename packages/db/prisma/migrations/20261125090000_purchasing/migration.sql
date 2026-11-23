-- Phase 5: purchase orders (tax split, snapshots, cancel/short-close, line discount, GRN line → PO line)
-- AlterTable
ALTER TABLE "PurchaseOrder" ADD COLUMN     "cancelReason" TEXT,
ADD COLUMN     "cancelledAt" TIMESTAMP(3),
ADD COLUMN     "cgstTotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN     "closeReason" TEXT,
ADD COLUMN     "closedAt" TIMESTAMP(3),
ADD COLUMN     "companySnapshot" JSONB,
ADD COLUMN     "igstTotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN     "note" TEXT,
ADD COLUMN     "roundOff" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN     "sgstTotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN     "supplierSnapshot" JSONB,
ADD COLUMN     "taxType" "TaxType" NOT NULL DEFAULT 'INTRA_STATE';

-- AlterTable
ALTER TABLE "PurchaseOrderLine" ADD COLUMN     "discPct" DECIMAL(5,2) NOT NULL DEFAULT 0;

-- AddForeignKey
ALTER TABLE "GrnLine" ADD CONSTRAINT "GrnLine_poLineId_fkey" FOREIGN KEY ("poLineId") REFERENCES "PurchaseOrderLine"("id") ON DELETE SET NULL ON UPDATE CASCADE;

