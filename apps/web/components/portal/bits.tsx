import { Badge } from '@/components/ui/card';

const STOCK: Record<string, { label: string; tone: 'ok' | 'warn' | 'neutral' }> = {
  AVAILABLE: { label: 'Available', tone: 'ok' }, LIMITED: { label: 'Limited', tone: 'warn' }, ON_REQUEST: { label: 'On request', tone: 'neutral' },
};
export function StockBadge({ stock }: { stock: string }) {
  const s = STOCK[stock] ?? STOCK.ON_REQUEST!;
  return <Badge tone={s.tone}>{s.label}</Badge>;
}
export const STOCK_DOT: Record<string, string> = { AVAILABLE: 'bg-ok', LIMITED: 'bg-warn', ON_REQUEST: 'bg-line' };
export const LENS_TYPE_LABEL: Record<string, string> = { MONOFOCAL: 'Monofocal', TORIC: 'Toric', MULTIFOCAL: 'Multifocal', EDOF: 'EDOF' };
export const fmtPower = (p: number) => `${p > 0 ? '+' : ''}${p.toFixed(2)}`;
