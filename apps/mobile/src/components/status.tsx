import { ORDER_STATUS_LABEL, type OrderStatus } from '@kush/core';
import { Badge, Small } from './ui';

const ORDER_TONE: Record<string, 'ok' | 'warn' | 'danger' | 'teal' | 'neutral'> = { PLACED: 'warn', CONFIRMED: 'teal', PACKED: 'teal', DISPATCHED: 'teal', DELIVERED: 'ok', CANCELLED: 'danger', ON_HOLD: 'warn' };
export const OrderStatusBadge = ({ status }: { status: string }) => <Badge label={ORDER_STATUS_LABEL[status as OrderStatus] ?? status} tone={ORDER_TONE[status] ?? 'neutral'} />;
/** Who handles an order. Only an open order with nobody on it is a warning; a closed one simply shows nothing. */
export const HandlerTag = ({ name, open = true }: { name: string | null; open?: boolean }) => (name ? <Small>Handled by {name}</Small> : open ? <Badge label="Not assigned" tone="warn" /> : null);
const STOCK: Record<string, [string, 'ok' | 'warn' | 'neutral']> = { AVAILABLE: ['Available', 'ok'], LIMITED: ['Limited', 'warn'], ON_REQUEST: ['On request', 'neutral'] };
export const StockBadge = ({ stock }: { stock: string }) => <Badge label={(STOCK[stock] ?? STOCK.ON_REQUEST!)[0]} tone={(STOCK[stock] ?? STOCK.ON_REQUEST!)[1]} />;
const PAY: Record<string, [string, 'ok' | 'warn' | 'danger' | 'neutral']> = { PAID: ['Paid', 'ok'], PARTLY_PAID: ['Part paid', 'warn'], UNPAID: ['Unpaid', 'neutral'], OVERDUE: ['Overdue', 'danger'], CANCELLED: ['Cancelled', 'neutral'] };
export const PayBadge = ({ status }: { status: string }) => <Badge label={(PAY[status] ?? [status, 'neutral'])[0]} tone={(PAY[status] ?? [status, 'neutral'])[1] as 'neutral'} />;
export const LENS_TYPE_LABEL: Record<string, string> = { MONOFOCAL: 'Monofocal', TORIC: 'Toric', MULTIFOCAL: 'Multifocal', EDOF: 'EDOF' };
export const fmtPower = (p: number) => `${p > 0 ? '+' : ''}${p.toFixed(2)}`;
