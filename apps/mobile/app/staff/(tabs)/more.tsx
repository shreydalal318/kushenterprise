import { Pressable, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import type { Permission } from '@kush/core';
import { Alert, Button, Card, H2, P, Row, Screen, Small } from '@/components/ui';
import { useAuth, useCan } from '@/lib/auth';
import { discard, useOutbox } from '@/lib/outbox';
import { C, R } from '@/lib/theme';
import { trpc } from '@/lib/trpc';

type Icon = keyof typeof Ionicons.glyphMap;
interface Item { label: string; hint: string; icon: Icon; to: string; anyOf?: Permission[]; ownerOnly?: boolean }

/** Everything the website's staff menu has, grouped the same way (apps/web/lib/nav.ts), with the same permissions. */
const SECTIONS: { title: string; items: Item[] }[] = [
  { title: 'Sales', items: [
    { label: 'Deliveries', hint: 'Everything out with our staff or waiting for pickup', icon: 'bicycle-outline', to: '/staff/deliveries', anyOf: ['VIEW_ORDERS'] },
    { label: 'Tax invoices', hint: 'All invoices, PDFs, credit notes, new invoice', icon: 'receipt-outline', to: '/staff/invoices', anyOf: ['CREATE_TAX_INVOICE', 'VIEW_ORDERS', 'RECORD_PAYMENTS'] },
    { label: 'Proforma', hint: 'Quotes for hospitals; turn into an invoice', icon: 'document-text-outline', to: '/staff/proformas', anyOf: ['CREATE_PROFORMA'] },
    { label: 'Payments', hint: 'Record money received; see what is owed', icon: 'wallet-outline', to: '/staff/payments', anyOf: ['RECORD_PAYMENTS'] },
  ] },
  { title: 'Inventory', items: [
    { label: 'Receive goods', hint: 'Add stock that came from a supplier', icon: 'download-outline', to: '/staff/receive', anyOf: ['MANAGE_STOCK'] },
    { label: 'Stock reports', hint: 'Low stock, expiring, receipts, adjustments, returns, value', icon: 'stats-chart-outline', to: '/staff/stock-reports' },
    { label: 'Products', hint: 'Products, powers, prices and barcodes', icon: 'cube-outline', to: '/staff/products' },
    { label: 'Barcode lookup', hint: 'Scan a box to see the product, batch and expiry', icon: 'scan-outline', to: '/staff/scan' },
  ] },
  { title: 'Customers', items: [
    { label: 'Customers', hint: 'Doctors, hospitals, clinics; statements and logins', icon: 'people-outline', to: '/staff/customers', anyOf: ['MANAGE_CUSTOMERS'] },
    { label: 'Pricing', hint: 'Price lists and special prices', icon: 'pricetags-outline', to: '/staff/pricing', anyOf: ['VIEW_PRICES_MARGINS'] },
    { label: 'Leads', hint: 'Enquiries from the website', icon: 'clipboard-outline', to: '/staff/leads', anyOf: ['MANAGE_CUSTOMERS'] },
  ] },
  { title: 'Purchasing', items: [
    { label: 'Purchase orders', hint: 'Order from suppliers', icon: 'car-outline', to: '/staff/purchase-orders', anyOf: ['CREATE_PURCHASE_ORDERS', 'MANAGE_STOCK'] },
    { label: 'Suppliers', hint: 'Who we buy from', icon: 'business-outline', to: '/staff/suppliers', anyOf: ['CREATE_PURCHASE_ORDERS', 'MANAGE_STOCK', 'VIEW_PRICES_MARGINS'] },
  ] },
  { title: 'Reports', items: [
    { label: 'Sales & reports', hint: 'Sales, margins, GST and Excel reports', icon: 'bar-chart-outline', to: '/staff/reports', anyOf: ['VIEW_ANALYTICS'] },
  ] },
  { title: 'Admin', items: [
    { label: 'Employees', hint: 'Staff logins and what each person can do', icon: 'person-add-outline', to: '/staff/employees', ownerOnly: true },
    { label: 'Activity log', hint: 'Who did what, and when', icon: 'time-outline', to: '/staff/activity', ownerOnly: true },
    { label: 'Settings', hint: 'Company details, invoice and notification settings', icon: 'settings-outline', to: '/staff/settings', ownerOnly: true },
  ] },
];

const sectionTitle = { fontSize: 13, fontWeight: '700' as const, color: C.muted, textTransform: 'uppercase' as const, letterSpacing: 0.6, marginTop: 6 };

function MenuRow({ icon, label, hint, count, onPress }: { icon: Icon; label: string; hint?: string; count?: number; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={count ? `${label}, ${count} new` : label} onPress={onPress}
      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56, paddingHorizontal: 14, paddingVertical: 10, borderRadius: R.lg, borderWidth: 1, borderColor: C.line, backgroundColor: pressed ? C.aqua50 : C.white })}>
      <Ionicons name={icon} size={22} color={C.teal700} />
      <View style={{ flex: 1 }}><Text style={{ fontSize: 16, fontWeight: '600', color: C.ink }}>{label}</Text>{hint ? <Small>{hint}</Small> : null}</View>
      {!!count && <View style={{ minWidth: 24, paddingHorizontal: 7, paddingVertical: 2, borderRadius: 999, backgroundColor: C.teal700 }}><Text style={{ color: C.white, fontWeight: '700', textAlign: 'center' }}>{count}</Text></View>}
      <Ionicons name="chevron-forward" size={18} color={C.muted} />
    </Pressable>
  );
}

/** The full menu (same sections as the website), anything waiting to send, notifications and the account. */
export default function More() {
  const { me, signOut } = useAuth();
  const can = useCan();
  const unread = trpc.notifications.unreadCount.useQuery();
  const outbox = useOutbox();
  const owner = me?.role === 'OWNER';
  const visible = (i: Item) => (i.ownerOnly ? owner : !i.anyOf || i.anyOf.some((p) => can(p)));
  return (
    <Screen>
      {outbox.length > 0 && (
        <Card style={{ borderColor: C.warn }}>
          <H2>Waiting to send ({outbox.length})</H2>
          {outbox.map((o) => <View key={o.id}><P>{o.label}</P>{o.error ? <><Alert>{o.error}</Alert><Button variant="secondary" title="Discard" onPress={() => void discard(o.id)} /></> : <Small>Sends by itself when you are back online</Small>}</View>)}
        </Card>
      )}
      <MenuRow icon="notifications-outline" label="Notifications" count={unread.data} onPress={() => router.push('/staff/notifications')} />
      {SECTIONS.map((s) => {
        const items = s.items.filter(visible);
        if (!items.length) return null;
        return (
          <View key={s.title} style={{ gap: 8 }}>
            <Text style={sectionTitle}>{s.title}</Text>
            {items.map((i) => <MenuRow key={i.to} icon={i.icon} label={i.label} hint={i.hint} onPress={() => router.push(i.to as never)} />)}
          </View>
        );
      })}
      <Text style={sectionTitle}>Me</Text>
      <Pressable accessibilityRole="button" onPress={() => router.push('/staff/account')}>
        <Card>
          <Row>
            <Ionicons name="person-circle-outline" size={36} color={C.teal700} />
            <View style={{ flex: 1 }}><P style={{ fontWeight: '700' }}>{me?.name}</P><Small>{owner ? 'Owner' : 'Employee'}{me?.email ? ` · ${me.email}` : ''} · password and devices</Small></View>
            <Ionicons name="chevron-forward" size={18} color={C.muted} />
          </Row>
        </Card>
      </Pressable>
      <Button variant="danger" title="Sign out" onPress={() => void signOut().then(() => router.replace('/login'))} />
    </Screen>
  );
}
