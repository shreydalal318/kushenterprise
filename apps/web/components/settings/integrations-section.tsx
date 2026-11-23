'use client';
import { useEffect, useState } from 'react';
import { Alert } from '@/components/ui/card';
import { Checkbox, TextField } from '@/components/ui/field';
import { trpc, type RouterOutputs } from '@/lib/trpc';
import { SectionForm } from './section-form';

type Cfg = RouterOutputs['integrations']['settings'];
const LEDGERS: [keyof Cfg['tally'], string, string?][] = [
  ['salesLedger', 'Sales ledger', '{rate} becomes the GST rate, e.g. "Sales @ 12%"'],
  ['interstateSalesLedger', 'Inter-state sales ledger'],
  ['salesReturnLedger', 'Sales returns ledger'],
  ['cgstLedger', 'Output CGST ledger', '{half} is half the GST rate'],
  ['sgstLedger', 'Output SGST ledger'],
  ['igstLedger', 'Output IGST ledger'],
  ['roundOffLedger', 'Round off ledger'],
  ['bankLedger', 'Bank ledger (receipts)'],
  ['cashLedger', 'Cash ledger (receipts)'],
  ['customerGroup', 'Customer group', 'Usually "Sundry Debtors"'],
];

export function IntegrationsSection() {
  const utils = trpc.useUtils();
  const q = trpc.integrations.settings.useQuery();
  const [v, setV] = useState<Cfg | null>(null);
  const [dirty, setDirty] = useState(false);
  useEffect(() => { if (q.data && !v) setV(q.data); }, [q.data, v]);
  const save = trpc.integrations.updateSettings.useMutation({ onSuccess: () => { void utils.integrations.settings.invalidate(); setDirty(false); } });
  if (!v) return null;
  const set = (patch: Partial<Cfg>) => { setV({ ...v, ...patch }); setDirty(true); };
  return (
    <SectionForm title="Tally, e-invoice & e-way bill" description="Ledger names must match your Tally company exactly. Export from Analytics → Reports & Excel."
      onSubmit={() => save.mutate(v)} saving={save.isPending} saved={save.isSuccess} dirty={dirty} error={save.error}>
      <fieldset className="grid gap-3 sm:grid-cols-2">
        <legend className="mb-1 text-sm font-medium">Tally Prime</legend>
        <TextField label="Company name in Tally (optional)" hint="Leave blank to import into the company open in Tally" value={v.tally.companyName} onChange={(e) => set({ tally: { ...v.tally, companyName: e.target.value } })} wrapperClassName="sm:col-span-2" />
        {LEDGERS.map(([k, label, hint]) => <TextField key={k} label={label} hint={hint} value={v.tally[k]} onChange={(e) => set({ tally: { ...v.tally, [k]: e.target.value } })} />)}
      </fieldset>
      <fieldset className="flex flex-col gap-3">
        <legend className="mb-1 text-sm font-medium">GST e-filing</legend>
        <Checkbox label="e-Invoicing applies to us" description="Shows the e-invoice steps on every B2B invoice (aggregate turnover above the government limit)." checked={v.eInvoice.enabled} onChange={(e) => set({ eInvoice: { enabled: e.target.checked } })} />
        <TextField label="E-way bill needed above (₹ invoice value)" type="number" min={0} value={String(v.ewayBill.thresholdValue)} onChange={(e) => set({ ewayBill: { thresholdValue: Number(e.target.value) || 0 } })} wrapperClassName="max-w-xs" />
      </fieldset>
      <Alert tone="info">The JSON files are in the official formats for upload on the IRP (e-invoice) and ewaybillgst.gov.in (e-way bill). Generating IRNs and e-way bills directly from here needs a GSP account and its credentials.</Alert>
    </SectionForm>
  );
}
