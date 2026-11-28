import { MyDeliveries } from '@/components/deliveries';
import { Orders } from '@/components/orders';
import { OwnerHome } from '@/components/owner-home';
import { useAuth, useCan } from '@/lib/auth';

/**
 * The first tab. The owner gets Home (today's numbers, what is pending, stock, money) with Orders as the
 * next tab; employees start on Orders; delivery-only staff (no orders) on what they have to deliver.
 */
export default function StaffHome() {
  const { me } = useAuth();
  const can = useCan();
  if (!can('VIEW_ORDERS')) return <MyDeliveries />;
  return me?.role === 'OWNER' ? <OwnerHome /> : <Orders />;
}
