-- Phase 2: masters (products, suppliers, customers, pricing)

-- One rate per product per customer / per price list (history is in PriceChangeLog)
DROP INDEX "CustomerPrice_customerId_productId_validFrom_key";
DROP INDEX "PriceListItem_priceListId_productId_validFrom_key";

-- Price validity is a calendar date (inclusive), not a timestamp
ALTER TABLE "CustomerPrice" ADD COLUMN "note" TEXT,
ALTER COLUMN "validFrom" SET DATA TYPE DATE,
ALTER COLUMN "validTo" SET DATA TYPE DATE;

ALTER TABLE "PriceChangeLog" ALTER COLUMN "validFrom" SET DATA TYPE DATE,
ALTER COLUMN "validTo" SET DATA TYPE DATE;

ALTER TABLE "PriceListItem" ALTER COLUMN "validFrom" SET DATA TYPE DATE,
ALTER COLUMN "validTo" SET DATA TYPE DATE;

-- Product / supplier codes: add nullable, backfill any existing rows, then enforce
ALTER TABLE "Product" ADD COLUMN "code" TEXT;
UPDATE "Product" SET "code" = 'P-' || "id" WHERE "code" IS NULL;
ALTER TABLE "Product" ALTER COLUMN "code" SET NOT NULL;

ALTER TABLE "Supplier" ADD COLUMN "code" TEXT;
UPDATE "Supplier" SET "code" = 'S-' || "id" WHERE "code" IS NULL;
ALTER TABLE "Supplier" ALTER COLUMN "code" SET NOT NULL;

-- Global counters (barcodes, customer and supplier codes)
CREATE TABLE "Counter" (
    "key" TEXT NOT NULL,
    "value" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "Counter_pkey" PRIMARY KEY ("key")
);

CREATE UNIQUE INDEX "CustomerPrice_customerId_productId_key" ON "CustomerPrice"("customerId", "productId");
CREATE UNIQUE INDEX "PriceListItem_priceListId_productId_key" ON "PriceListItem"("priceListId", "productId");
CREATE UNIQUE INDEX "Product_code_key" ON "Product"("code");
CREATE UNIQUE INDEX "Supplier_code_key" ON "Supplier"("code");
