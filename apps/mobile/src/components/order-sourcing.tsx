import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { formatDate } from '@kush/core';
import { Alert, Button, Card, Field, H2, P, Row, Small } from '@/components/ui';
import { errorText } from '@/lib/format';
import { C } from '@/lib/theme';
import { trpc, type RouterOutputs } from '@/lib/trpc';

type Shortfall = RouterOutputs['orders']['shortfall'];
const PO_LABEL: Record<string, string> = { DRAFT: 'Draft', SENT: 'Sent', PARTIALLY_RECEIVED: 'Partly received', RECEIVED: 'Received', CLOSED: 'Closed', CANCELLED: 'Cancelled' };

/** Stock line under each order item: in stock, short, already on a PO. */
export function StockNote({ line }: { line?: Shortfall['lines'][number] }) {
  if (!line || line.backorder === 0) return null;
  return (
    <Small style={{ color: line.short === 0 ? C.ok : line.toOrder > 0 ? C.danger : C.warn }}>
      In stock {line.available}{line.short > 0 ? ` · short ${line.short}` : ''}{line.onOrder > 0 ? ` · ${line.onOrder} on PO` : ''}
    </Small>
  );
}

/** POs raised for this order, with status and expected date. */
export function LinkedPos({ s }: { s: Shortfall }) {
  const pos = [...new Map(s.lines.flatMap((l) => l.purchaseOrders).map((p) => [p.id, p])).values()];
  if (!pos.length) return null;
  return (
    <>
      <H2>Ordered from supplier</H2>
      <Card>
        {pos.map((p) => (
          <Row key={p.id} style={{ justifyContent: 'space-between' }}>
            <View style={{ flex: 1 }}><P style={{ fontWeight: '600' }}>{p.number}</P><Small>{p.supplier}{p.expectedDate ? ` · expected ${formatDate(p.expectedDate)}` : ''}</Small></View>
            <Small style={{ color: C.teal700, fontWeight: '600' }}>{PO_LABEL[p.status] ?? p.status}</Small>
          </Row>
        ))}
      </Card>
    </>
  );
}

function Check({ label, hint, value, onChange }: { label: string; hint?: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: value }} accessibilityLabel={label} onPress={() => onChange(!value)} style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-start', paddingVertical: 4 }}>
      <Ionicons name={value ? 'checkbox' : 'square-outline'} size={22} color={C.teal700} />
      <View style={{ flex: 1 }}><P>{label}</P>{hint ? <Small>{hint}</Small> : null}</View>
    </Pressable>
  );
}

/** Raise POs (one per supplier) for items on this order that are not in stock. */
export function OrderFromSupplier({ s, onClose }: { s: Shortfall; onClose: () => void }) {
  const utils = trpc.useUtils();
  const suppliers = trpc.suppliers.list.useQuery();
  const lines = s.lines.filter((l) => l.backorder > 0);
  const [rows, setRows] = useState(() => Object.fromEntries(lines.map((l) => [l.variantId, { qty: String(l.toOrder || ''), supplierId: l.usualSupplier?.id ?? '' }])));
  const [picking, setPicking] = useState<string | null>(null);
  const [expected, setExpected] = useState('');
  const [send, setSend] = useState(true);
  const [tell, setTell] = useState(true);
  const create = trpc.purchaseOrders.createForOrder.useMutation({ onSuccess: () => { void utils.orders.invalidate(); void utils.purchaseOrders.invalidate(); } });
  const items = lines.map((l) => ({ variantId: l.variantId, qty: Math.floor(Number(rows[l.variantId]?.qty) || 0), supplierId: rows[l.variantId]?.supplierId ?? '' })).filter((i) => i.qty > 0);
  const missing = items.some((i) => !i.supplierId);
  const badDate = !!expected && !/^\d{4}-\d{2}-\d{2}$/.test(expected);
  const set = (v: string, patch: Partial<{ qty: string; supplierId: string }>) => setRows((r) => ({ ...r, [v]: { ...r[v]!, ...patch } }));
  const name = (id: string) => suppliers.data?.find((x) => x.id === id)?.name ?? lines.find((l) => l.usualSupplier?.id === id)?.usualSupplier?.name ?? 'Choose supplier';

  if (create.data) {
    const n = create.data.purchaseOrders.length;
    return (
      <Card>
        <Alert tone="ok">{n === 1 ? 'One PO was' : `${n} POs were`} {send ? 'raised and marked as sent' : 'saved as drafts'}: {create.data.purchaseOrders.map((p) => p.number).join(', ')}.{tell ? ' The customer has been told.' : ''}</Alert>
        <Small>Share the PO PDF with the supplier from the web app. The team is alerted here when the goods are received.</Small>
        <Button title="Done" onPress={onClose} />
      </Card>
    );
  }

  return (
    <Card>
      <H2>Order from supplier</H2>
      <Small>One PO per supplier at the last purchase rate, linked to this order.</Small>
      {lines.map((l) => (
        <View key={l.variantId} style={{ gap: 6, paddingVertical: 6, borderTopWidth: 1, borderTopColor: C.line }}>
          <P style={{ fontWeight: '600' }}>{l.name} <Small>{l.label ?? l.sku}</Small></P>
          <Small>In stock {l.available} · short {l.short}{l.onOrder ? ` · ${l.onOrder} already on PO` : ''}</Small>
          <Field label={`Order qty for ${l.name}`} keyboardType="number-pad" value={rows[l.variantId]?.qty ?? ''} onChangeText={(v) => set(l.variantId, { qty: v.replace(/\D/g, '') })} />
          <Pressable accessibilityRole="button" accessibilityLabel={`Supplier for ${l.name}`} onPress={() => setPicking(picking === l.variantId ? null : l.variantId)}
            style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 10, borderRadius: 10, borderWidth: 1, borderColor: rows[l.variantId]?.supplierId ? C.line : C.warn }}>
            <P>{rows[l.variantId]?.supplierId ? `${name(rows[l.variantId]!.supplierId)}${rows[l.variantId]!.supplierId === l.usualSupplier?.id ? ' (usual)' : ''}` : 'Choose supplier'}</P>
            <Ionicons name={picking === l.variantId ? 'chevron-up' : 'chevron-down'} size={18} color={C.muted} />
          </Pressable>
          {picking === l.variantId && (suppliers.data ?? []).map((sp) => (
            <Pressable key={sp.id} accessibilityRole="radio" accessibilityState={{ selected: rows[l.variantId]?.supplierId === sp.id }} onPress={() => { set(l.variantId, { supplierId: sp.id }); setPicking(null); }} style={{ flexDirection: 'row', gap: 8, alignItems: 'center', paddingVertical: 4 }}>
              <Ionicons name={rows[l.variantId]?.supplierId === sp.id ? 'radio-button-on' : 'radio-button-off'} size={20} color={C.teal700} />
              <P>{sp.name}{sp.id === l.usualSupplier?.id ? ' (usual)' : ''}</P>
            </Pressable>
          ))}
        </View>
      ))}
      <Field label="Expected by (optional, YYYY-MM-DD)" placeholder="2026-12-01" value={expected} onChangeText={setExpected} error={badDate ? 'Use YYYY-MM-DD' : null} />
      <Check label="Mark as sent now" hint="Untick to keep it as a draft." value={send} onChange={setSend} />
      <Check label="Tell the customer" hint={`“Being ordered from the manufacturer${expected && !badDate ? `, expected by ${formatDate(expected)}` : ''}.”`} value={tell} onChange={setTell} />
      {missing && <Alert tone="warn">Choose a supplier for every item you are ordering.</Alert>}
      {create.error && <Alert>{errorText(create.error)}</Alert>}
      <Button title={send ? 'Raise & mark sent' : 'Save as draft'} disabled={!items.length || missing || badDate} loading={create.isPending}
        onPress={() => create.mutate({ orderId: s.orderId, items, expectedDate: expected || null, send, tellCustomer: tell })} />
      <Button variant="secondary" title="Back" onPress={onClose} />
    </Card>
  );
}
