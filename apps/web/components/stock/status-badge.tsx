import { STOCK_STATUS_LABEL, type StockStatus } from '@kush/core';
import { Badge } from '@/components/ui/card';

const TONE: Record<StockStatus, 'ok' | 'warn' | 'danger' | 'teal'> = { IN_STOCK: 'ok', LOW_STOCK: 'warn', OUT_OF_STOCK: 'danger', EXPIRING_SOON: 'teal' };

export function StockBadge({ status }: { status: StockStatus }) {
  return <Badge tone={TONE[status]}>{STOCK_STATUS_LABEL[status]}</Badge>;
}
