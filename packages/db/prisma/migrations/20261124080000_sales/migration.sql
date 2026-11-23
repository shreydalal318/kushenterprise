-- Phase 4: sales (printable credit notes, proforma tax type, invoice terms)
-- AlterTable
ALTER TABLE "CreditNote" ADD COLUMN     "buyerSnapshot" JSONB NOT NULL DEFAULT '{}',
ADD COLUMN     "cgstTotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN     "igstTotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN     "placeOfSupply" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "roundOff" DECIMAL(6,2) NOT NULL DEFAULT 0,
ADD COLUMN     "sgstTotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN     "supplierSnapshot" JSONB NOT NULL DEFAULT '{}',
ADD COLUMN     "taxType" "TaxType" NOT NULL DEFAULT 'INTRA_STATE';

-- AlterTable
ALTER TABLE "CreditNoteLine" ADD COLUMN     "batchNo" TEXT,
ADD COLUMN     "cgstAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN     "description" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "discPct" DECIMAL(5,2) NOT NULL DEFAULT 0,
ADD COLUMN     "expiryDate" DATE,
ADD COLUMN     "hsnCode" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "igstAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN     "invoiceLineId" TEXT,
ADD COLUMN     "powerLabel" TEXT,
ADD COLUMN     "sgstAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN     "sl" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "unit" TEXT NOT NULL DEFAULT 'pcs';

-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN     "terms" TEXT;

-- AlterTable
ALTER TABLE "Proforma" ADD COLUMN     "supplierSnapshot" JSONB NOT NULL DEFAULT '{}',
ADD COLUMN     "taxType" "TaxType" NOT NULL DEFAULT 'INTRA_STATE';

