import { can, isOwner, type Permission, type Principal } from '@kush/core';
import {
  Activity, BarChart3, Boxes, ClipboardList, Factory, FileText, LayoutDashboard, Package, PackagePlus, Receipt, ScanLine, Settings, ShoppingCart,
  Tags, Truck, Users, UserCog, Wallet, type LucideIcon,
} from 'lucide-react';

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Phase in which the screen ships; items without a phase are live. */
  phase?: number;
  permission?: Permission;
  /** Visible when the user has any of these permissions. */
  anyOf?: Permission[];
  ownerOnly?: boolean;
}

export const NAV: { section: string; items: NavItem[] }[] = [
  { section: '', items: [{ href: '/app', label: 'Dashboard', icon: LayoutDashboard }] },
  {
    section: 'Sales',
    items: [
      { href: '/app/orders', label: 'Orders', icon: ShoppingCart, permission: 'VIEW_ORDERS' },
      { href: '/app/invoices', label: 'Tax invoices', icon: Receipt, anyOf: ['CREATE_TAX_INVOICE', 'VIEW_ORDERS', 'RECORD_PAYMENTS'] },
      { href: '/app/proforma', label: 'Proforma', icon: FileText, permission: 'CREATE_PROFORMA' },
      { href: '/app/payments', label: 'Payments', icon: Wallet, permission: 'RECORD_PAYMENTS' },
    ],
  },
  {
    section: 'Inventory',
    items: [
      { href: '/app/stock', label: 'Stock', icon: Boxes },
      { href: '/app/scan', label: 'Scan', icon: ScanLine },
      { href: '/app/stock/receive', label: 'Receive goods', icon: PackagePlus, permission: 'MANAGE_STOCK' },
      { href: '/app/products', label: 'Products', icon: Package },
      { href: '/app/suppliers', label: 'Suppliers', icon: Factory, anyOf: ['CREATE_PURCHASE_ORDERS', 'MANAGE_STOCK', 'VIEW_PRICES_MARGINS'] },
      { href: '/app/purchase-orders', label: 'Purchase orders', icon: Truck, anyOf: ['CREATE_PURCHASE_ORDERS', 'MANAGE_STOCK'] },
    ],
  },
  {
    section: 'Customers',
    items: [
      { href: '/app/customers', label: 'Customers', icon: Users, permission: 'MANAGE_CUSTOMERS' },
      { href: '/app/pricing', label: 'Pricing', icon: Tags, permission: 'VIEW_PRICES_MARGINS' },
      { href: '/app/leads', label: 'Leads', icon: ClipboardList, permission: 'MANAGE_CUSTOMERS', phase: 8 },
    ],
  },
  { section: 'Insights', items: [{ href: '/app/analytics', label: 'Analytics', icon: BarChart3, permission: 'VIEW_ANALYTICS', phase: 7 }] },
  {
    section: 'Admin',
    items: [
      { href: '/app/employees', label: 'Employees', icon: UserCog, ownerOnly: true },
      { href: '/app/activity', label: 'Activity log', icon: Activity, ownerOnly: true },
      { href: '/app/settings', label: 'Settings', icon: Settings, ownerOnly: true },
    ],
  },
];

export const allowed = (u: Principal, item: NavItem) =>
  item.ownerOnly ? isOwner(u) : item.permission ? can(u, item.permission) : item.anyOf ? item.anyOf.some((p) => can(u, p)) : true;

/** Nav filtered to what this user may open (the API enforces the same rules). */
export function navFor(u: Principal) {
  return NAV.map((s) => ({ ...s, items: s.items.filter((i) => allowed(u, i)) })).filter((s) => s.items.length);
}
