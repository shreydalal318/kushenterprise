'use client';
import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ListPlus, Trash2 } from 'lucide-react';
import { computeGst, istDateString, stateByCode } from '@kush/core';
import { Button } from '@/components/ui/button';
import { Alert, Badge, Card, CardBody, CardHeader } from '@/components/ui/card';
import { SelectField, TextAreaField, TextField } from '@/components/ui/field';
import { EmptyRow, Table, Td, Th, THead, Tr } from '@/components/ui/table';
import { ScanField } from '@/components/scan/scan-field';
import { VariantPicker, type VariantChoice } from '@/components/stock/variant-picker';
import { cn } from '@/lib/cn';
import { errorMessage, fieldErrors } from '@/lib/errors';
import { scanError, scanOk } from '@/lib/feedback';
import { rupees } from '@/lib/format';
import { trpc } from '@/lib/trpc';

interface PoLine { key: string; variantId: string; productId: string; name: string; label: string | null; unit: string; hsn: string; gstRate: number; qty: number; rate: number | null; discPct: number; source?: string }
let seq = 0;
const newKey = () => `l${++seq}`;

/** Create or edit (draft only) a purchase order. Rates default to the last price paid to this supplier. */
export function PoEditor({ poId }: { poId?: string }) {
  const params = useSearchParams();
  const router = useRouter();
  const utils = trpc.useUtils();
  const suppliers = trpc.suppliers.list.useQuery();
  const defaults = trpc.purchaseOrders.defaults.useQuery();
  const existing = trpc.purchaseOrders.get.useQuery({ id: poId ?? '' }, { enabled: !!poId });
  const [head, setHead] = useState({ supplierId: params.get('supplier') ?? '', date: istDateString(), expectedDate: '', terms: '', note: '' });
  const [lines, setLinesState] = useState<PoLine[]>([]);
  const linesRef = useRef<PoLine[]>([]);
  const setLines = (next: PoLine[] | ((ls: PoLine[]) => PoLine[])) => { linesRef.current = typeof next === 'function' ? next(linesRef.current) : next; setLinesState(linesRef.current); };
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const [msg, setMsg] = useState<{ tone: 'ok' | 'danger'; text: string } | null>(null);
  const [showSuggest, setShowSuggest] = useState(params.get('suggest') === '1');
  const loaded = useRef(false);

  useEffect(() => { if (!poId && defaults.data && !head.terms) setHead((h) => ({ ...h, terms: defaults.data!.terms })); }, [defaults.data]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const p = existing.data;
    if (!p || loaded.current) return;
    loaded.current = true;
    setHead({ supplierId: p.supplier.id, date: p.date, expectedDate: p.expectedDate ?? '', terms: p.terms ?? '', note: p.note ?? '' });
    setLines(p.lines.map((l) => ({ key: newKey(), variantId: l.variantId, productId: l.productId, name: l.name, label: l.label, unit: l.unit, hsn: l.hsnCode, gstRate: l.gstRate, qty: l.qtyOrdered, rate: l.rate, discPct: l.discPct })));
  }, [existing.data]);

  const supplier = suppliers.data?.find((s) => s.id === head.supplierId);
  const rates = trpc.purchaseOrders.rates.useQuery({ supplierId: head.supplierId || null, variantIds: lines.map((l) => l.variantId) }, { enabled: lines.length > 0 });
  const rateOf = (l: PoLine) => l.rate ?? rates.data?.[l.variantId]?.rate ?? null;
  const suggestions = trpc.purchaseOrders.suggestions.useQuery({ supplierId: head.supplierId || null }, { enabled: showSuggest });
  const [picked, setPicked] = useState<Record<string, number>>({});

  const totals = useMemo(() => {
    if (!supplier || !lines.length || lines.some((l) => rateOf(l) == null)) return null;
    return computeGst(supplier.stateCode, defaults.data?.stateCode ?? 'XX', lines.map((l) => ({ qty: l.qty, rate: rateOf(l)!, discPct: l.discPct, hsn: l.hsn, gstRate: l.gstRate })));
  }, [lines, rates.data, supplier, defaults.data]); // eslint-disable-line react-hooks/exhaustive-deps

  async function add(v: Pick<VariantChoice, 'variantId' | 'productId' | 'productName' | 'label'>, qty = 1) {
    const p = await utils.products.get.fetch({ id: v.productId });
    const have = linesRef.current.find((l) => l.variantId === v.variantId);
    if (have) setLines((ls) => ls.map((l) => (l.key === have.key ? { ...l, qty: l.qty + qty } : l)));
    else setLines((ls) => [...ls, { key: newKey(), variantId: v.variantId, productId: v.productId, name: v.productName, label: v.label, unit: p.unit, hsn: p.hsnCode, gstRate: p.gstRate, qty, rate: null, discPct: 0 }]);
  }
  const onScan = (code: string) => { queue.current = queue.current.then(async () => {
    const r = await utils.scan.resolve.fetch({ code }, { staleTime: 0 }).catch(() => null);
    if (!r?.found) { scanError(); setMsg({ tone: 'danger', text: `Unknown barcode ${code}` }); return; }
    await add({ variantId: r.variant.id, productId: r.product.id, productName: r.product.name, label: r.variant.label });
    scanOk(); setMsg({ tone: 'ok', text: `${r.product.name} ${r.variant.label ?? ''}` });
  }); };
  const update = (key: string, patch: Partial<PoLine>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  const create = trpc.purchaseOrders.create.useMutation();
  const save = trpc.purchaseOrders.update.useMutation();
  const m = poId ? save : create;
  const fe = fieldErrors(m.error);
  function submit() {
    const body = { ...head, lines: lines.map((l) => ({ variantId: l.variantId, qty: l.qty, rate: l.rate, discPct: l.discPct })) };
    const done = (r: { id: string }) => { void utils.purchaseOrders.invalidate(); router.push(`/app/purchase-orders/${r.id}${poId ? '' : '?new=1'}`); };
    if (poId) save.mutate({ ...body, id: poId }, { onSuccess: done }); else create.mutate(body, { onSuccess: done });
  }

  if (poId && existing.data && existing.data.status !== 'DRAFT') return <Alert>Only a draft purchase order can be edited.</Alert>;
  const units = lines.reduce((t, l) => t + l.qty, 0);
  return (
    <div className="flex flex-col gap-5">
      {defaults.data && !defaults.data.ready && <Alert tone="warn">Set the company state in Settings → Company so GST on the PO can be worked out.</Alert>}
      <Card>
        <CardBody className="grid gap-4 sm:grid-cols-3">
          <SelectField label="Supplier" value={head.supplierId} onChange={(e) => setHead({ ...head, supplierId: e.target.value })} error={fe.supplierId}>
            <option value="">Choose…</option>
            {suppliers.data?.map((s) => <option key={s.id} value={s.id}>{s.name} ({s.code})</option>)}
          </SelectField>
          <TextField label="PO date" type="date" value={head.date} onChange={(e) => setHead({ ...head, date: e.target.value })} error={fe.date} />
          <TextField label="Expected delivery" type="date" value={head.expectedDate} onChange={(e) => setHead({ ...head, expectedDate: e.target.value })} />
          {supplier && <p className="text-sm text-muted sm:col-span-3">GST: <strong className="text-ink">{supplier.stateCode === defaults.data?.stateCode ? 'CGST + SGST' : 'IGST'}</strong> (supplier in {stateByCode(supplier.stateCode)?.name}) · payment terms {supplier.paymentTermsDays} days</p>}
          <TextAreaField label="Terms & conditions" rows={3} value={head.terms} onChange={(e) => setHead({ ...head, terms: e.target.value })} wrapperClassName="sm:col-span-2" />
          <TextField label="Reference / note (printed)" value={head.note} onChange={(e) => setHead({ ...head, note: e.target.value })} />
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Items" description={`${lines.length} line(s), ${units} unit(s)`}
          actions={<Button size="sm" variant="secondary" onClick={() => setShowSuggest(!showSuggest)}><ListPlus className="size-4" aria-hidden /> Items below reorder level</Button>} />
        {showSuggest && (
          <div className="border-b border-line bg-canvas/60">
            <Table minWidth={760}>
              <THead><tr><Th className="w-10" /><Th>Item</Th><Th className="text-right">In stock</Th><Th className="text-right">Reorder at</Th><Th className="text-right">On order</Th><Th className="w-28">Order qty</Th><Th className="text-right">Last rate</Th></tr></THead>
              <tbody>
                {suggestions.isLoading && <EmptyRow cols={7}>Checking stock…</EmptyRow>}
                {suggestions.data?.length === 0 && <EmptyRow cols={7}>Nothing is below its reorder level{head.supplierId ? ' among this supplier’s products' : ''}.</EmptyRow>}
                {suggestions.data?.map((r) => (
                  <Tr key={r.variantId}>
                    <Td><input type="checkbox" aria-label={`Order ${r.productName} ${r.label ?? ''}`} checked={r.variantId in picked} onChange={(e) => { const n = { ...picked }; if (e.target.checked) n[r.variantId] = r.suggestedQty; else delete n[r.variantId]; setPicked(n); }} className="size-4 accent-teal-700" /></Td>
                    <Td><div className="font-medium">{r.productName}</div><div className="text-xs text-muted">{r.label ?? r.sku}{!head.supplierId && r.supplier ? ` · usually from ${r.supplier.name}` : ''}</div></Td>
                    <Td className={cn('num', r.qty === 0 && 'text-danger')}>{r.qty}</Td><Td className="num">{r.reorderLevel}</Td><Td className="num">{r.onOrder || '—'}</Td>
                    <Td><input type="number" min={1} aria-label={`Order quantity for ${r.productName} ${r.label ?? ''}`} value={picked[r.variantId] ?? r.suggestedQty} onChange={(e) => setPicked({ ...picked, [r.variantId]: Math.max(1, Number(e.target.value)) })} className="h-9 w-24 rounded-md border border-line px-2 text-sm" /></Td>
                    <Td className="num text-sm">{rupees(r.rate)}{r.rateSource === 'LAST_PURCHASE' && <div className="text-xs text-muted">last paid</div>}</Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
            {suggestions.data && suggestions.data.length > 0 && (
              <div className="flex justify-end gap-2 px-5 py-3">
                <Button size="sm" variant="secondary" onClick={() => setPicked(Object.fromEntries(suggestions.data!.map((r) => [r.variantId, picked[r.variantId] ?? r.suggestedQty])))}>Tick all</Button>
                <Button size="sm" disabled={!Object.keys(picked).length} onClick={async () => {
                  for (const r of suggestions.data!.filter((x) => x.variantId in picked)) await add({ variantId: r.variantId, productId: r.productId, productName: r.productName, label: r.label }, picked[r.variantId]!);
                  setPicked({}); setShowSuggest(false);
                }}>Add {Object.keys(picked).length} item(s) to the PO</Button>
              </div>
            )}
          </div>
        )}
        <CardBody className="flex flex-col gap-3">
          <ScanField onScan={onScan} keepFocus={false} placeholder="Scan a box to add it, or search below" />
          {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}
          <VariantPicker onPick={(v) => void add(v)} />
        </CardBody>
        {lines.length > 0 && (
          <Table minWidth={900}>
            <THead><tr><Th>Item</Th><Th className="w-24">Qty</Th><Th className="w-32">Rate (₹)</Th><Th className="w-24">Disc %</Th><Th className="text-right">GST</Th><Th className="text-right">Amount</Th><Th className="w-10" /></tr></THead>
            <tbody>
              {lines.map((l, i) => {
                const rate = rateOf(l);
                const src = l.rate == null ? rates.data?.[l.variantId]?.source : null;
                return (
                  <Tr key={l.key}>
                    <Td><div className="font-medium">{l.name}</div><div className="text-xs text-muted">{l.label ?? ''} · HSN {l.hsn}</div></Td>
                    <Td><input aria-label={`Quantity for line ${i + 1}`} type="number" min={1} value={l.qty} onChange={(e) => update(l.key, { qty: Math.max(1, Number(e.target.value)) })} className="h-9 w-20 rounded-md border border-line px-2 text-sm" /></Td>
                    <Td>
                      <input aria-label={`Rate for line ${i + 1}`} type="number" step="0.01" min={0} value={l.rate ?? rate ?? ''} onChange={(e) => update(l.key, { rate: e.target.value === '' ? null : Number(e.target.value) })} className="h-9 w-28 rounded-md border border-line px-2 text-right text-sm" />
                      {src && <div><Badge tone={src === 'LAST_PURCHASE' ? 'teal' : 'neutral'}>{src === 'LAST_PURCHASE' ? 'Last paid' : 'Cost price'}</Badge></div>}
                    </Td>
                    <Td><input aria-label={`Discount for line ${i + 1}`} type="number" min={0} max={100} step="0.5" value={l.discPct} onChange={(e) => update(l.key, { discPct: Math.min(100, Math.max(0, Number(e.target.value))) })} className="h-9 w-20 rounded-md border border-line px-2 text-sm" /></Td>
                    <Td className="num text-sm">{l.gstRate}%</Td>
                    <Td className="num font-semibold">{rate == null ? '—' : rupees(Math.round(l.qty * rate * (1 - l.discPct / 100) * 100) / 100)}</Td>
                    <Td><button aria-label={`Remove line ${i + 1}`} className="rounded p-1.5 text-muted hover:bg-danger-50 hover:text-danger" onClick={() => setLines(lines.filter((x) => x.key !== l.key))}><Trash2 className="size-4" /></button></Td>
                  </Tr>
                );
              })}
            </tbody>
          </Table>
        )}
        {totals && (
          <div className="flex justify-end border-t border-line px-5 py-4">
            <dl className="grid w-72 grid-cols-2 gap-y-1 text-sm">
              <dt className="text-muted">Taxable value</dt><dd className="num">{rupees(totals.taxable)}</dd>
              {totals.taxLines.map((t, i) => <Fragment key={i}><dt className="text-muted">{t.label} @ {t.rate}%</dt><dd className="num">{rupees(t.amount)}</dd></Fragment>)}
              {totals.roundOff !== 0 && <><dt className="text-muted">Round off</dt><dd className="num">{rupees(totals.roundOff)}</dd></>}
              <dt className="border-t border-line pt-1 font-semibold">Total</dt><dd className="num border-t border-line pt-1 text-lg font-semibold">{rupees(totals.total)}</dd>
            </dl>
          </div>
        )}
      </Card>
      {m.error && <Alert>{Object.keys(fe).length && !Object.keys(fe).some((k) => k.startsWith('lines')) ? 'Please correct the highlighted fields.' : errorMessage(m.error)}</Alert>}
      <div className="flex justify-end">
        <Button size="lg" disabled={!head.supplierId || !lines.length} loading={m.isPending} onClick={submit}>{poId ? 'Save changes' : 'Save as draft'}{totals ? ` · ${rupees(totals.total)}` : ''}</Button>
      </div>
    </div>
  );
}
