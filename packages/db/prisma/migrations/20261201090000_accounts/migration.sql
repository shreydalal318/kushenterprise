-- Accounts: ledgers, vouchers (double entry), purchase bills, supplier payments; debit note values on
-- supplier returns; the cash/bank ledger on customer receipts; books start date. Data is backfilled by
-- syncAccounts (seed / app start), not here, because posting rules live in the app.
-- CreateEnum
CREATE TYPE "VoucherType" AS ENUM ('SALES', 'CREDIT_NOTE', 'RECEIPT', 'PURCHASE', 'DEBIT_NOTE', 'PAYMENT', 'CONTRA', 'JOURNAL');

-- AlterEnum (new values are not used in this migration, so one transaction is fine)
ALTER TYPE "DocType" ADD VALUE 'PURCHASE_BILL';
ALTER TYPE "DocType" ADD VALUE 'PAYMENT_VOUCHER';
ALTER TYPE "DocType" ADD VALUE 'CONTRA_VOUCHER';
ALTER TYPE "DocType" ADD VALUE 'JOURNAL_VOUCHER';

-- AlterEnum (new values are not used in this migration, so one transaction is fine)
ALTER TYPE "Permission" ADD VALUE 'VIEW_ACCOUNTS';
ALTER TYPE "Permission" ADD VALUE 'MANAGE_ACCOUNTS';

-- AlterTable
ALTER TABLE "CompanySettings" ADD COLUMN     "booksFrom" DATE;

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "ledgerId" TEXT;

-- AlterTable
ALTER TABLE "SupplierReturn" ADD COLUMN     "cgstTotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN     "grandTotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN     "igstTotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN     "roundOff" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN     "sgstTotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN     "taxTotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN     "taxType" "TaxType" NOT NULL DEFAULT 'INTRA_STATE',
ADD COLUMN     "taxableTotal" DECIMAL(14,2) NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "Ledger" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "group" TEXT NOT NULL,
    "systemKey" TEXT,
    "customerId" TEXT,
    "supplierId" TEXT,
    "openingBalance" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "bankAccountNo" TEXT,
    "bankIfsc" TEXT,
    "note" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Ledger_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Voucher" (
    "id" TEXT NOT NULL,
    "type" "VoucherType" NOT NULL,
    "number" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "narration" TEXT,
    "sourceType" TEXT,
    "sourceId" TEXT,
    "partyLedgerId" TEXT,
    "amount" DECIMAL(14,2) NOT NULL,
    "cancelled" BOOLEAN NOT NULL DEFAULT false,
    "cancelReason" TEXT,
    "cancelledAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Voucher_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VoucherEntry" (
    "id" TEXT NOT NULL,
    "voucherId" TEXT NOT NULL,
    "ledgerId" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "billRef" TEXT,
    "sl" INTEGER NOT NULL,

    CONSTRAINT "VoucherEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchaseBill" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "billNo" TEXT NOT NULL,
    "billDate" DATE NOT NULL,
    "dueDate" DATE NOT NULL,
    "grnId" TEXT,
    "taxType" "TaxType" NOT NULL,
    "taxableTotal" DECIMAL(14,2) NOT NULL,
    "cgstTotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "sgstTotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "igstTotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "roundOff" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "grandTotal" DECIMAL(14,2) NOT NULL,
    "amountPaid" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "status" "InvoiceStatus" NOT NULL DEFAULT 'ISSUED',
    "cancelReason" TEXT,
    "cancelledAt" TIMESTAMP(3),
    "note" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PurchaseBill_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchaseBillLine" (
    "id" TEXT NOT NULL,
    "billId" TEXT NOT NULL,
    "sl" INTEGER NOT NULL,
    "variantId" TEXT,
    "ledgerId" TEXT,
    "description" TEXT NOT NULL,
    "hsnCode" TEXT,
    "qty" DECIMAL(14,3),
    "unit" TEXT,
    "rate" DECIMAL(14,2) NOT NULL,
    "discPct" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "amount" DECIMAL(14,2) NOT NULL,
    "gstRate" DECIMAL(5,2) NOT NULL,
    "cgstAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "sgstAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "igstAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,

    CONSTRAINT "PurchaseBillLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupplierPayment" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "mode" "PaymentMode" NOT NULL,
    "ledgerId" TEXT NOT NULL,
    "reference" TEXT,
    "note" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupplierPayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupplierPaymentAllocation" (
    "paymentId" TEXT NOT NULL,
    "billId" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,

    CONSTRAINT "SupplierPaymentAllocation_pkey" PRIMARY KEY ("paymentId","billId")
);

-- CreateIndex
CREATE UNIQUE INDEX "Ledger_name_key" ON "Ledger"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Ledger_systemKey_key" ON "Ledger"("systemKey");

-- CreateIndex
CREATE UNIQUE INDEX "Ledger_customerId_key" ON "Ledger"("customerId");

-- CreateIndex
CREATE UNIQUE INDEX "Ledger_supplierId_key" ON "Ledger"("supplierId");

-- CreateIndex
CREATE INDEX "Ledger_group_idx" ON "Ledger"("group");

-- CreateIndex
CREATE INDEX "Voucher_date_idx" ON "Voucher"("date");

-- CreateIndex
CREATE INDEX "Voucher_type_date_idx" ON "Voucher"("type", "date");

-- CreateIndex
CREATE INDEX "Voucher_number_idx" ON "Voucher"("number");

-- CreateIndex
CREATE UNIQUE INDEX "Voucher_sourceType_sourceId_key" ON "Voucher"("sourceType", "sourceId");

-- CreateIndex
CREATE INDEX "VoucherEntry_ledgerId_idx" ON "VoucherEntry"("ledgerId");

-- CreateIndex
CREATE INDEX "VoucherEntry_voucherId_idx" ON "VoucherEntry"("voucherId");

-- CreateIndex
CREATE UNIQUE INDEX "PurchaseBill_number_key" ON "PurchaseBill"("number");

-- CreateIndex
CREATE INDEX "PurchaseBill_billDate_idx" ON "PurchaseBill"("billDate");

-- CreateIndex
CREATE UNIQUE INDEX "PurchaseBill_supplierId_billNo_key" ON "PurchaseBill"("supplierId", "billNo");

-- CreateIndex
CREATE INDEX "PurchaseBillLine_billId_idx" ON "PurchaseBillLine"("billId");

-- CreateIndex
CREATE UNIQUE INDEX "SupplierPayment_number_key" ON "SupplierPayment"("number");

-- CreateIndex
CREATE INDEX "SupplierPayment_supplierId_date_idx" ON "SupplierPayment"("supplierId", "date");

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_ledgerId_fkey" FOREIGN KEY ("ledgerId") REFERENCES "Ledger"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ledger" ADD CONSTRAINT "Ledger_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ledger" ADD CONSTRAINT "Ledger_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Voucher" ADD CONSTRAINT "Voucher_partyLedgerId_fkey" FOREIGN KEY ("partyLedgerId") REFERENCES "Ledger"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VoucherEntry" ADD CONSTRAINT "VoucherEntry_voucherId_fkey" FOREIGN KEY ("voucherId") REFERENCES "Voucher"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VoucherEntry" ADD CONSTRAINT "VoucherEntry_ledgerId_fkey" FOREIGN KEY ("ledgerId") REFERENCES "Ledger"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseBill" ADD CONSTRAINT "PurchaseBill_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseBill" ADD CONSTRAINT "PurchaseBill_grnId_fkey" FOREIGN KEY ("grnId") REFERENCES "Grn"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseBillLine" ADD CONSTRAINT "PurchaseBillLine_billId_fkey" FOREIGN KEY ("billId") REFERENCES "PurchaseBill"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseBillLine" ADD CONSTRAINT "PurchaseBillLine_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseBillLine" ADD CONSTRAINT "PurchaseBillLine_ledgerId_fkey" FOREIGN KEY ("ledgerId") REFERENCES "Ledger"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierPayment" ADD CONSTRAINT "SupplierPayment_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierPayment" ADD CONSTRAINT "SupplierPayment_ledgerId_fkey" FOREIGN KEY ("ledgerId") REFERENCES "Ledger"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierPaymentAllocation" ADD CONSTRAINT "SupplierPaymentAllocation_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "SupplierPayment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierPaymentAllocation" ADD CONSTRAINT "SupplierPaymentAllocation_billId_fkey" FOREIGN KEY ("billId") REFERENCES "PurchaseBill"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

