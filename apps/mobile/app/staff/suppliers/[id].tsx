import { useState, type ReactNode } from 'react';
import { Linking, Pressable, Text, View } from 'react-native';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { formatDate, stateByCode } from '@kush/core';
import { readableError } from '@/components/errors';
import { Alert, Badge, Button, Card, H2, LinkButton, Loading, P, Row, Screen } from '@/components/ui';
import { Confirm, FailedScreen, Line, MoreActions, NoAccess, Note, PoBadge, useFlash, type Icon, type MoreAction, LoadingScreen } from '@/components/inventory/common';
import { useCan } from '@/lib/auth';
import { rupees } from '@/lib/format';
import { C } from '@/lib/theme';
import { trpc } from '@/lib/trpc';
import { Done } from '@/components/done';

/** One supplier (web: Suppliers → supplier): contact, terms, products they supply, recent POs and deliveries. */
export default function SupplierDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const can = useCan();
  const utils = trpc.useUtils();
  const allowed = can('CREATE_PURCHASE_ORDERS') || can('MANAGE_STOCK') || can('VIEW_PRICES_MARGINS');
  const buyer = can('CREATE_PURCHASE_ORDERS');
  const seesPos = buyer || can('MANAGE_STOCK');
  const q = trpc.suppliers.get.useQuery({ id: id! }, { enabled: allowed });
  const pos = trpc.purchaseOrders.list.useQuery({ supplierId: id! }, { enabled: allowed && seesPos });
  const receipts = trpc.inventory.receipts.useQuery({ kind: 'GRN', limit: 200 }, { enabled: allowed });
  const active = trpc.suppliers.setActive.useMutation();
  const [flash, setFlash] = useFlash(`supplier:${id}`);
  const [confirmOff, setConfirmOff] = useState(false);
  const [allProducts, setAllProducts] = useState(false);
  if (!allowed) return <NoAccess title="Supplier">Suppliers need the “Create purchase orders”, “Manage stock” or “View prices” permission. Ask the owner.</NoAccess>;
  if (!q.data) return q.error ? <FailedScreen title="Supplier" error={q.error} busy={q.isFetching} onRetry={() => void q.refetch()} /> : <LoadingScreen title="Supplier" />;
  const s = q.data;
  const grns = (receipts.data ?? []).filter((r) => r.supplier?.id === s.id).slice(0, 5);
  const recentPos = (pos.data ?? []).slice(0, 5);
  const openPos = (pos.data ?? []).filter((p) => p.status === 'SENT' || p.status === 'PARTIALLY_RECEIVED').length;
  const products = allProducts ? s.products : s.products.slice(0, 10);
  const setOn = (on: boolean) => active.mutate({ id: s.id, isActive: on }, {
    onSuccess: () => { void utils.suppliers.invalidate(); setConfirmOff(false); setFlash(on ? 'Supplier is active again ✓' : 'Supplier deactivated. They no longer show when making a purchase order.'); },
  });
  const more: MoreAction[] = buyer ? [
    { icon: 'create-outline', title: 'Edit details', onPress: () => router.push(`/staff/suppliers/edit?id=${s.id}`) },
    { icon: 'cube-outline', title: 'Edit products they supply', onPress: () => router.push(`/staff/suppliers/products?id=${s.id}`) },
    s.isActive
      ? { icon: 'close-circle-outline', title: 'Deactivate supplier', danger: true, onPress: () => { active.reset(); setFlash(null); setConfirmOff(true); } }
      : { icon: 'checkmark-circle-outline', title: 'Activate supplier', onPress: () => setOn(true) },
  ] : [];
  const address = [s.addressLine1, s.addressLine2, [s.city, s.pincode].filter(Boolean).join(' '), stateByCode(s.stateCode)?.name].filter(Boolean).join(', ');

  return (
    <Screen footer={buyer && (s.isActive || confirmOff || active.error) && (
      <>
        {active.error && <Alert>{readableError(active.error)}</Alert>}
        {confirmOff
          ? <Confirm question={`Deactivate ${s.name}? You can’t make purchase orders to them until you activate them again.`} yes="Yes, deactivate" busy={active.isPending} onYes={() => setOn(false)} onNo={() => setConfirmOff(false)} />
          : s.isActive && <Button title="New purchase order" icon={<Ionicons name="cart-outline" size={20} color={C.white} />} onPress={() => router.push(`/staff/purchase-orders/new?supplier=${s.id}`)} />}
      </>
    )}>
      <Stack.Screen options={{ title: s.code }} />
      <Done message={flash} onShown={() => setFlash(null)} />
      <Card>
        <Row style={{ alignItems: 'flex-start' }}>
          <Text style={{ flex: 1, fontSize: 20, fontWeight: '700', color: C.navy }}>{s.name}</Text>
          {!s.isActive && <Badge label="Inactive" tone="danger" />}
        </Row>
        <Note>{s.code}{s.gstin ? ` · GSTIN ${s.gstin}` : ' · no GSTIN'}</Note>
        <Line k="Payment terms" v={`${s.paymentTermsDays} days`} />
        <Note>{address}</Note>
      </Card>

      {!!(s.contactPerson || s.mobile || s.email) && (
        <Card>
          <H2>Contact</H2>
          {!!s.contactPerson && <P>{s.contactPerson}</P>}
          {!!s.mobile && <ContactRow icon="call-outline" text={s.mobile} label={`Call ${s.mobile}`} onPress={() => void Linking.openURL(`tel:${s.mobile}`)} />}
          {!!s.email && <ContactRow icon="mail-outline" text={s.email} label={`Email ${s.email}`} onPress={() => void Linking.openURL(`mailto:${s.email}`)} />}
        </Card>
      )}

      {seesPos && (
        <>
          <Row style={{ justifyContent: 'space-between' }}>
            <H2>Purchase orders{openPos ? ` (${openPos} open)` : ''}</H2>
            {(pos.data?.length ?? 0) > 5 && <LinkButton title="See all" onPress={() => router.push(`/staff/purchase-orders?supplier=${s.id}`)} />}
          </Row>
          <Card style={{ gap: 0, paddingVertical: 4 }}>
            {!pos.data && (pos.error ? <Alert>{readableError(pos.error)}</Alert> : <Loading />)}
            {pos.data?.length === 0 && <Note style={{ paddingVertical: 10 }}>No purchase orders yet.</Note>}
            {recentPos.map((p, i) => (
              <ListRow key={p.id} first={!i} label={`Purchase order ${p.number}`} onPress={() => router.push(`/staff/purchase-orders/${p.id}`)}>
                <View style={{ flex: 1 }}>
                  <Row style={{ flexWrap: 'wrap' }}><P style={{ fontWeight: '700' }}>{p.number}</P><PoBadge status={p.status} />{p.late && <Badge label="Late" tone="danger" />}</Row>
                  <Note>{formatDate(p.date)} · received {p.received} of {p.ordered}{p.total != null ? ` · ${rupees(p.total)}` : ''}</Note>
                </View>
              </ListRow>
            ))}
          </Card>
        </>
      )}

      <H2>Goods received</H2>
      <Card style={{ gap: 0, paddingVertical: 4 }}>
        {!receipts.data && (receipts.error ? <Alert>{readableError(receipts.error)}</Alert> : <Loading />)}
        {receipts.data && !grns.length && <Note style={{ paddingVertical: 10 }}>Nothing received from them recently.</Note>}
        {grns.map((g, i) => (
          <ListRow key={g.id} first={!i} label={`Receipt ${g.number}`} onPress={() => router.push(`/staff/stock-reports/receipt/${g.id}`)}>
            <View style={{ flex: 1 }}>
              <P style={{ fontWeight: '700' }}>{g.number}</P>
              <Note>{formatDate(g.date)} · {g.units} unit{g.units === 1 ? '' : 's'}{g.supplierInvoiceNo ? ` · their invoice ${g.supplierInvoiceNo}` : ''}</Note>
            </View>
          </ListRow>
        ))}
      </Card>

      <Row style={{ justifyContent: 'space-between' }}>
        <H2>Products they supply ({s.products.length})</H2>
        {buyer && <LinkButton title="Edit" onPress={() => router.push(`/staff/suppliers/products?id=${s.id}`)} />}
      </Row>
      <Card style={{ gap: 0, paddingVertical: 4 }}>
        {!s.products.length && <Note style={{ paddingVertical: 10 }}>No products linked yet. Linked products are suggested on purchase orders with the last price paid.</Note>}
        {products.map((p, i) => (
          <ListRow key={p.productId} first={!i} label={p.product.name} onPress={() => router.push(`/staff/products/${p.productId}`)}>
            <View style={{ flex: 1 }}>
              <P style={{ fontWeight: '600' }}>{p.product.name}</P>
              <Note>{[p.product.code, p.supplierSku && `their code ${p.supplierSku}`, p.lastPurchaseRate != null && `last paid ${rupees(p.lastPurchaseRate)}`].filter(Boolean).join(' · ')}</Note>
            </View>
          </ListRow>
        ))}
      </Card>
      {!allProducts && s.products.length > 10 && <Button variant="secondary" title={`Show all ${s.products.length} products`} onPress={() => setAllProducts(true)} />}
      <MoreActions actions={more} />
    </Screen>
  );
}

function ContactRow({ icon, text, label, onPress }: { icon: Icon; text: string; label: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="link" accessibilityLabel={label} onPress={onPress} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44, opacity: pressed ? 0.6 : 1 })}>
      <Ionicons name={icon} size={20} color={C.teal700} />
      <Text style={{ fontSize: 16, color: C.teal700, fontWeight: '600' }}>{text}</Text>
    </Pressable>
  );
}

function ListRow({ children, first, label, onPress }: { children: ReactNode; first: boolean; label: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress}
      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 56, paddingVertical: 6, borderTopWidth: first ? 0 : 1, borderTopColor: C.line, opacity: pressed ? 0.6 : 1 })}>
      {children}
      <Ionicons name="chevron-forward" size={18} color={C.muted} />
    </Pressable>
  );
}
