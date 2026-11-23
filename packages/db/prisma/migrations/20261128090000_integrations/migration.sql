-- Phase 9: Tally export settings, e-invoice on credit notes, e-way bill date
-- AlterTable
ALTER TABLE "CompanySettings" ADD COLUMN     "integrationConfig" JSONB;

-- AlterTable
ALTER TABLE "CreditNote" ADD COLUMN     "ackDate" TIMESTAMP(3),
ADD COLUMN     "ackNo" TEXT,
ADD COLUMN     "irn" TEXT,
ADD COLUMN     "signedQr" TEXT;

-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN     "ewayBillDate" TIMESTAMP(3);

