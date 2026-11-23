import { ORDER_STATUS_LABEL, PAYMENT_STATUS_LABEL, type OrderStatus, type PaymentStatus } from '@kush/core';
import { Badge } from '@/components/ui/card';

const P_TONE: Record<PaymentStatus, 'ok' | 'warn' | 'danger' | 'neutral' | 'teal'> = { PAID: 'ok', PARTLY_PAID: 'teal', UNPAID: 'neutral', OVERDUE: 'danger', CANCELLED: 'danger' };
export const PaymentBadge = ({ status }: { status: PaymentStatus }) => <Badge tone={P_TONE[status]}>{PAYMENT_STATUS_LABEL[status]}</Badge>;

const O_TONE: Record<OrderStatus, 'ok' | 'warn' | 'danger' | 'neutral' | 'teal' | 'navy'> = { PLACED: 'warn', CONFIRMED: 'teal', PACKED: 'teal', DISPATCHED: 'navy', DELIVERED: 'ok', CANCELLED: 'danger', ON_HOLD: 'neutral' };
export const OrderBadge = ({ status }: { status: OrderStatus }) => <Badge tone={O_TONE[status]}>{ORDER_STATUS_LABEL[status]}</Badge>;
