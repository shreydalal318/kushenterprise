'use client';
import { useState } from 'react';
import { Plus, Trash2, Wand2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge, Card, CardHeader } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';
import { TextField } from '@/components/ui/field';
import { EmptyRow, Table, Td, Th, THead, Tr } from '@/components/ui/table';
import { errorMessage, fieldErrors } from '@/lib/errors';
import { rupees } from '@/lib/format';
import { trpc, type RouterOutputs } from '@/lib/trpc';
import { PowerRangeFields, emptyRange, rangePreview, toRangeInput, type PowerRange } from './power-range-fields';

type Product = RouterOutputs['products']['get'];
type Variant = Product['variants'][number];

export function VariantsCard({ product, editable }: { product: Product; editable: boolean }) {
  const utils = trpc.useUtils();
  const refresh = () => Promise.all([utils.products.get.invalidate({ id: product.id }), utils.products.list.invalidate()]);
  const [genOpen, setGenOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [edit, setEdit] = useState<Variant | null>(null);
  const [filter, setFilter] = useState('');
  const remove = trpc.products.removeVariant.useMutation({ onSuccess: refresh });
  const rows = product.variants.filter((v) => !filter || [v.sku, v.label, v.barcode, v.gtin].some((x) => x?.toLowerCase().includes(filter.toLowerCase())));

  return (
    <Card>
      <CardHeader
        title={`Variants (${product.variants.length})`}
        description={product.isLens ? 'One per power. Each has its own barcode, stock and batches.' : 'Stock-keeping unit for this item.'}
        actions={editable && (
          <div className="flex gap-2">
            {product.isLens && <Button size="sm" variant="secondary" onClick={() => setGenOpen(true)}><Wand2 className="size-4" aria-hidden /> Generate powers</Button>}
            <Button size="sm" variant="secondary" onClick={() => setAddOpen(true)}><Plus className="size-4" aria-hidden /> Add one</Button>
          </div>
        )}
      />
      {product.variants.length > 12 && (
        <div className="border-b border-line px-5 py-2">
          <input aria-label="Filter variants" value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filter by power, SKU or barcode" className="h-9 w-full max-w-xs rounded-lg border border-line px-3 text-sm" />
        </div>
      )}
      {remove.error && <p className="px-5 pt-3 text-sm text-danger">{errorMessage(remove.error)}</p>}
      <div className="max-h-[480px] overflow-y-auto">
        <Table minWidth={680}>
          <THead><tr><Th>{product.isLens ? 'Power' : 'Variant'}</Th><Th>SKU</Th><Th>Our barcode</Th><Th>Manufacturer GTIN</Th><Th>Status</Th>{editable && <Th className="w-24" />}</tr></THead>
          <tbody>
            {rows.length === 0 && <EmptyRow cols={6}>{product.isLens ? 'No powers yet. Use “Generate powers”.' : 'No variants.'}</EmptyRow>}
            {rows.map((v) => (
              <Tr key={v.id}>
                <Td className="font-medium whitespace-nowrap">{v.label ?? 'Standard'}</Td>
                <Td className="font-mono text-xs">{v.sku}</Td>
                <Td className="font-mono text-xs">{v.barcode}</Td>
                <Td className="font-mono text-xs">{v.gtin ?? <span className="text-muted">—</span>}</Td>
                <Td>{v.isActive ? <Badge tone="ok">Active</Badge> : <Badge>Inactive</Badge>}</Td>
                {editable && (
                  <Td className="whitespace-nowrap text-right">
                    <button className="rounded px-2 py-1 text-sm text-teal-700 hover:bg-aqua-50" onClick={() => setEdit(v)}>Edit</button>
                    <button aria-label={`Delete ${v.sku}`} className="rounded p-1.5 text-muted hover:bg-danger-50 hover:text-danger" onClick={() => { if (confirm(`Delete variant ${v.sku}? Variants with stock or documents can only be deactivated.`)) remove.mutate({ id: v.id }); }}><Trash2 className="size-4" /></button>
                  </Td>
                )}
              </Tr>
            ))}
          </tbody>
        </Table>
      </div>
      <GenerateDialog open={genOpen} onClose={() => setGenOpen(false)} product={product} onDone={refresh} />
      <AddDialog open={addOpen} onClose={() => setAddOpen(false)} product={product} onDone={refresh} />
      {edit && <EditDialog variant={edit} canSeeCost={product.canSeeCost} onClose={() => setEdit(null)} onDone={refresh} />}
    </Card>
  );
}

function GenerateDialog({ open, onClose, product, onDone }: { open: boolean; onClose: () => void; product: Product; onDone: () => void }) {
  const [range, setRange] = useState<PowerRange>(emptyRange);
  const gen = trpc.products.generateVariants.useMutation({ onSuccess: () => { onDone(); } });
  const p = rangePreview(range);
  return (
    <Dialog open={open} onClose={() => { gen.reset(); onClose(); }} title="Generate power variants" description={product.name}
      footer={gen.isSuccess
        ? <Button onClick={() => { gen.reset(); onClose(); }}>Done</Button>
        : <><Button variant="secondary" onClick={onClose}>Cancel</Button><Button loading={gen.isPending} disabled={'error' in p} onClick={() => gen.mutate({ productId: product.id, range: toRangeInput(range)! })}>Generate</Button></>}>
      {gen.isSuccess ? (
        <p className="text-sm">Created <strong>{gen.data.created}</strong> new variant(s); {gen.data.skipped} already existed.</p>
      ) : (
        <>
          <PowerRangeFields value={range} onChange={setRange} lensType={product.lensType} />
          {gen.error && <p className="mt-3 text-sm text-danger">{errorMessage(gen.error)}</p>}
        </>
      )}
    </Dialog>
  );
}

function AddDialog({ open, onClose, product, onDone }: { open: boolean; onClose: () => void; product: Product; onDone: () => void }) {
  const [v, setV] = useState({ powerSph: '', cylinder: '', addPower: '', gtin: '' });
  const add = trpc.products.addVariant.useMutation({ onSuccess: () => { onDone(); onClose(); setV({ powerSph: '', cylinder: '', addPower: '', gtin: '' }); } });
  const fe = fieldErrors(add.error);
  const n = (s: string) => (s === '' ? null : Number(s));
  return (
    <Dialog open={open} onClose={onClose} title="Add a variant" size="sm"
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button loading={add.isPending} onClick={() => add.mutate({ productId: product.id, powerSph: n(v.powerSph), cylinder: n(v.cylinder), addPower: n(v.addPower), gtin: v.gtin })}>Add</Button></>}>
      <div className="flex flex-col gap-4">
        {product.isLens && <TextField label="Power (D)" type="number" step="0.25" value={v.powerSph} onChange={(e) => setV({ ...v, powerSph: e.target.value })} error={fe.powerSph} autoFocus />}
        {product.lensType === 'TORIC' && <TextField label="Cylinder (D)" type="number" step="0.25" value={v.cylinder} onChange={(e) => setV({ ...v, cylinder: e.target.value })} error={fe.cylinder} />}
        {product.lensType === 'MULTIFOCAL' && <TextField label="Add power (D)" type="number" step="0.25" value={v.addPower} onChange={(e) => setV({ ...v, addPower: e.target.value })} error={fe.addPower} />}
        <TextField label="Manufacturer GTIN / EAN (optional)" inputMode="numeric" value={v.gtin} onChange={(e) => setV({ ...v, gtin: e.target.value })} error={fe.gtin} />
        {add.error && !Object.keys(fe).length && <p className="text-sm text-danger">{errorMessage(add.error)}</p>}
      </div>
    </Dialog>
  );
}

function EditDialog({ variant, canSeeCost, onClose, onDone }: { variant: Variant; canSeeCost: boolean; onClose: () => void; onDone: () => void }) {
  const [v, setV] = useState({
    gtin: variant.gtin ?? '', isActive: variant.isActive, reorderLevel: variant.reorderLevel == null ? '' : String(variant.reorderLevel),
    mrp: variant.mrp == null ? '' : String(variant.mrp), purchaseCost: variant.purchaseCost == null ? '' : String(variant.purchaseCost),
  });
  const save = trpc.products.updateVariant.useMutation({ onSuccess: () => { onDone(); onClose(); } });
  const fe = fieldErrors(save.error);
  return (
    <Dialog open onClose={onClose} title={`Edit ${variant.label ?? variant.sku}`} description={<>SKU {variant.sku} · barcode {variant.barcode}</>} size="sm"
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button loading={save.isPending} onClick={() => save.mutate({ id: variant.id, gtin: v.gtin, isActive: v.isActive, reorderLevel: v.reorderLevel, mrp: v.mrp, ...(canSeeCost ? { purchaseCost: v.purchaseCost } : {}) } as never)}>Save</Button></>}>
      <div className="flex flex-col gap-4">
        <TextField label="Manufacturer GTIN / EAN" inputMode="numeric" value={v.gtin} onChange={(e) => setV({ ...v, gtin: e.target.value })} error={fe.gtin} hint="Scanned from the lens box; stored as 14 digits" />
        <TextField label="Reorder level override" type="number" min={0} value={v.reorderLevel} onChange={(e) => setV({ ...v, reorderLevel: e.target.value })} error={fe.reorderLevel} />
        <TextField label="MRP override (₹)" type="number" step="0.01" value={v.mrp} onChange={(e) => setV({ ...v, mrp: e.target.value })} error={fe.mrp} hint={`Blank uses the product MRP`} />
        {canSeeCost && <TextField label="Purchase cost override (₹)" type="number" step="0.01" value={v.purchaseCost} onChange={(e) => setV({ ...v, purchaseCost: e.target.value })} error={fe.purchaseCost} />}
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="size-4 accent-teal-700" checked={v.isActive} onChange={(e) => setV({ ...v, isActive: e.target.checked })} /> Active (can be sold and ordered)</label>
        {save.error && !Object.keys(fe).length && <p className="text-sm text-danger">{errorMessage(save.error)}</p>}
        <p className="text-xs text-muted">Current MRP override: {rupees(variant.mrp)}</p>
      </div>
    </Dialog>
  );
}
