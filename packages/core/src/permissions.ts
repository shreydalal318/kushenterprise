/**
 * Roles & permissions. This file is the single source of truth used by the API (enforcement)
 * and the UI (menus, checkboxes). Keep the keys in sync with the Prisma `Permission` enum —
 * a unit test checks this.
 */

export const ROLES = ['OWNER', 'EMPLOYEE', 'CUSTOMER'] as const;
export type Role = (typeof ROLES)[number];

export const PERMISSIONS = {
  VIEW_ORDERS: { label: 'View orders', group: 'Orders' },
  UPDATE_ORDER_STATUS: { label: 'Update order status', group: 'Orders' },
  CREATE_ORDERS: { label: 'Create orders for customers', group: 'Orders' },
  SCAN_DISPATCH: { label: 'Scan & dispatch', group: 'Orders' },
  CREATE_PROFORMA: { label: 'Create proforma invoices', group: 'Billing' },
  CREATE_TAX_INVOICE: { label: 'Create tax invoices', group: 'Billing' },
  RECORD_PAYMENTS: { label: 'Record payments', group: 'Billing' },
  MANAGE_STOCK: { label: 'Manage stock / GRN', group: 'Inventory' },
  MANAGE_PRODUCTS: { label: 'Manage products & barcodes', group: 'Inventory' },
  CREATE_PURCHASE_ORDERS: { label: 'Create purchase orders', group: 'Purchasing' },
  MANAGE_CUSTOMERS: { label: 'Manage customers', group: 'Customers' },
  VIEW_PRICES_MARGINS: { label: 'View prices / margins (cost, price lists)', group: 'Sensitive' },
  VIEW_ANALYTICS: { label: 'View analytics', group: 'Sensitive' },
  VIEW_ACCOUNTS: { label: 'View accounts & reports', group: 'Accounts' },
  MANAGE_ACCOUNTS: { label: 'Record vouchers, bills & payments', group: 'Accounts' },
} as const satisfies Record<string, { label: string; group: string }>;

export type Permission = keyof typeof PERMISSIONS;
export const ALL_PERMISSIONS = Object.keys(PERMISSIONS) as Permission[];

export const PERMISSION_GROUPS: { group: string; permissions: Permission[] }[] = (() => {
  const map = new Map<string, Permission[]>();
  for (const p of ALL_PERMISSIONS) {
    const g = PERMISSIONS[p].group;
    map.set(g, [...(map.get(g) ?? []), p]);
  }
  return [...map.entries()].map(([group, permissions]) => ({ group, permissions }));
})();

export interface Principal {
  role: Role;
  permissions: readonly string[];
  isActive?: boolean;
}

/** Owner has every permission; employees have exactly what was ticked; customers have none. */
export function can(user: Principal | null | undefined, permission: Permission): boolean {
  if (!user || user.isActive === false) return false;
  if (user.role === 'OWNER') return true;
  if (user.role === 'EMPLOYEE') return user.permissions.includes(permission);
  return false;
}

export const isStaff = (user: Principal | null | undefined): boolean =>
  !!user && user.isActive !== false && (user.role === 'OWNER' || user.role === 'EMPLOYEE');

export const isOwner = (user: Principal | null | undefined): boolean =>
  !!user && user.isActive !== false && user.role === 'OWNER';

/** Drop unknown strings so a stale client can't persist junk permissions. */
export const sanitizePermissions = (perms: readonly string[]): Permission[] =>
  ALL_PERMISSIONS.filter((p) => perms.includes(p));
