import { Badge } from '@/components/ui/card';

export const PO_STATUS_LABEL: Record<string, string> = {
  DRAFT: 'Draft', SENT: 'Sent', PARTIALLY_RECEIVED: 'Partly received', RECEIVED: 'Received', CLOSED: 'Closed', CANCELLED: 'Cancelled',
};
const TONE: Record<string, 'neutral' | 'teal' | 'warn' | 'ok' | 'danger'> = {
  DRAFT: 'neutral', SENT: 'teal', PARTIALLY_RECEIVED: 'warn', RECEIVED: 'ok', CLOSED: 'neutral', CANCELLED: 'danger',
};
export function PoBadge({ status }: { status: string }) {
  return <Badge tone={TONE[status] ?? 'neutral'}>{PO_STATUS_LABEL[status] ?? status}</Badge>;
}
