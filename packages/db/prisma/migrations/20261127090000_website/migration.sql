-- Phase 8: website enquiries (lead follow-up fields)
-- AlterTable
ALTER TABLE "Lead" ADD COLUMN     "handledById" TEXT,
ADD COLUMN     "ip" TEXT,
ADD COLUMN     "notes" TEXT,
ADD COLUMN     "sourcePath" TEXT,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateIndex
CREATE INDEX "Lead_status_createdAt_idx" ON "Lead"("status", "createdAt");

-- CreateIndex
CREATE INDEX "Lead_ip_createdAt_idx" ON "Lead"("ip", "createdAt");

