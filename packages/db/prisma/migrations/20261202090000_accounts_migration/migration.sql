-- Tally migration (bill-wise opening bills), period lock, bank reconciliation.
ALTER TABLE "Invoice" ADD COLUMN "isOpening" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "PurchaseBill" ADD COLUMN "isOpening" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "CompanySettings" ADD COLUMN "booksLockedUntil" DATE;
ALTER TABLE "VoucherEntry" ADD COLUMN "reconciledOn" DATE;
