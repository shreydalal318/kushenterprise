import { useEffect, useState } from 'react';
import { Check, fieldErrors, Input, Note, Waiting } from '@/components/admin/bits';
import { OwnerOnly, SaveBar } from '@/components/admin/settings-bits';
import { Alert, Card, H2, Screen } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { trpc, type RouterOutputs } from '@/lib/trpc';

type Cfg = RouterOutputs['integrations']['settings'];
const LEDGERS: [keyof Cfg['tally'], string, string?][] = [
  ['salesLedger', 'Sales ledger', '{rate} becomes the GST rate, e.g. “Sales @ 12%”'],
  ['interstateSalesLedger', 'Sales to other states ledger'],
  ['salesReturnLedger', 'Sales returns ledger'],
  ['cgstLedger', 'Output CGST ledger', '{half} is half the GST rate'],
  ['sgstLedger', 'Output SGST ledger'],
  ['igstLedger', 'Output IGST ledger'],
  ['roundOffLedger', 'Round off ledger'],
  ['bankLedger', 'Bank ledger (money received)'],
  ['cashLedger', 'Cash ledger (money received)'],
  ['customerGroup', 'Customer group', 'Usually “Sundry Debtors”'],
];

/** Tally ledger names and the e-invoice / e-way bill switches (website: Settings → Tally & e-filing). */
export default function Integrations() {
  const { me } = useAuth();
  const utils = trpc.useUtils();
  const q = trpc.integrations.settings.useQuery(undefined, { enabled: me?.role === 'OWNER' });
  const [v, setV] = useState<Cfg | null>(null);
  const [threshold, setThreshold] = useState('');
  const [dirty, setDirty] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);
  useEffect(() => { if (q.data && !v) { setV(q.data); setThreshold(String(q.data.ewayBill.thresholdValue)); } }, [q.data, v]);
  const save = trpc.integrations.updateSettings.useMutation({ onSuccess: () => { void utils.integrations.settings.invalidate(); setDirty(false); setFlash('Tally and e-filing settings saved ✓'); } });
  const fe = fieldErrors(save.error);
  const set = (patch: Partial<Cfg>) => { if (!v) return; setV({ ...v, ...patch }); setDirty(true); setFlash(null); };
  return (
    <OwnerOnly title="Tally and e-filing">
      {!v ? <Screen><Waiting q={q} /></Screen> : (
        <Screen footer={<SaveBar error={save.error} saving={save.isPending} dirty={dirty} onSave={() => save.mutate({ ...v, ewayBill: { thresholdValue: Number(threshold) || 0 } })} />}>
          {!!flash && <Alert tone="ok">{flash}</Alert>}
          <Note>Ledger names must match your Tally company exactly. The Tally files are under Sales & reports → Downloads.</Note>
          <Card>
            <H2>Tally Prime</H2>
            <Input label="Company name in Tally (optional)" hint="Leave empty to import into whichever company is open in Tally." value={v.tally.companyName} onChangeText={(x) => set({ tally: { ...v.tally, companyName: x } })} maxLength={120} />
            {LEDGERS.map(([k, label, hint]) => (
              <Input key={k} label={label} hint={hint} value={v.tally[k]} onChangeText={(x) => set({ tally: { ...v.tally, [k]: x } })} error={fe[`tally.${k}`]} maxLength={80} />
            ))}
          </Card>
          <Card>
            <H2>GST e-filing</H2>
            <Check label="e-Invoicing applies to us" hint="Shows the e-invoice steps on every B2B invoice (when turnover is above the government limit)." value={v.eInvoice.enabled} onChange={(x) => set({ eInvoice: { enabled: x } })} />
            <Input label="E-way bill needed above (invoice value in ₹)" keyboardType="number-pad" value={threshold} onChangeText={(x) => { setThreshold(x); setDirty(true); setFlash(null); }} error={fe['ewayBill.thresholdValue']} maxLength={10} />
          </Card>
          <Note>The files are in the official formats for upload on the IRP (e-invoice) and the e-way bill portal. Making IRNs straight from here needs a GSP account.</Note>
        </Screen>
      )}
    </OwnerOnly>
  );
}
