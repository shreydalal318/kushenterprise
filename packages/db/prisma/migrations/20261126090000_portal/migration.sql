-- Phase 6: customer notification preferences
-- AlterTable
ALTER TABLE "Customer" ADD COLUMN     "notifyChannels" "NotificationChannel"[] DEFAULT ARRAY['IN_APP', 'PUSH']::"NotificationChannel"[];

