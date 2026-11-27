/**
 * Map a web link from a notification (inbox or push) to the matching app screen. Customers only follow
 * portal links and staff only app links, so a push meant for a previous user of the phone opens nothing.
 */
export function appRoute(link: string | null | undefined, customer: boolean, canViewOrders: boolean): string | null {
  if (!link) return null;
  if (customer) {
    const m = link.match(/\/portal\/orders\/([^/?#]+)/);
    if (m) return `/customer/order/${m[1]}`;
    return /\/portal\/(invoices|account)/.test(link) ? '/customer/account' : null;
  }
  // Staff home is the orders list, or for delivery staff without order access, their deliveries.
  if (/\/app\/deliveries/.test(link)) return '/staff';
  const m = link.match(/\/app\/orders\/([^/?#]+)/);
  if (m) return canViewOrders ? `/staff/order/${m[1]}` : '/staff';
  return null;
}
