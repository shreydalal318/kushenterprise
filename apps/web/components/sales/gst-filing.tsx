'use client';
import { useState } from 'react';
import { FileJson, QrCode, Truck } from 'lucide-react';
import { formatDate, istDateString } from '@kush/core';
import { Button } from '@/components/ui/button';
import { Alert, Card, CardBody, CardHeader } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';
import { SelectField, TextAreaField, TextField } from '@/components/ui/field';
import { errorMessage, fieldErrors } from '@/lib/errors';
import { rupees } from '@/lib/format';
import { trpc } from '@/lib/trpc';

function download(name: string, data: unknown) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
  const a = document.createElement('a'); a.href = url; a.download = name; a.click(); URL.revokeObjectURL(url);
}
const safe = (n: string) => n.replace(/[^\w.-]+/g, '-');

/** e-invoice (IRN / QR) and e-way bill readiness for one tax invoice. */
export function GstFiling({ invoice }: { invoice: { id: string; number: string; grandTotal: number; status: string; irn: string | null; ackNo: string | null; ackDate: string | null; ewayBillNo: string | null; ewayBillDate: string | null; buyerGstin: string | null } }) {
  const utils = trpc.useUtils();
  const cfg = trpc.integrations.settings.useQuery();
  const [dialog, setDialog] = useState<null | 'irn' | 'eway' | 'ewayNo'>(null);
  const [issues, setIssues] = useState<string[] | null>(null);
  if (invoice.status === 'CANCELLED') return null;
  const b2b = !!invoice.buyerGstin;
  const needsEway = invoice.grandTotal >= (cfg.data?.ewayBill.thresholdValue ?? 50000);
  async function einvoiceJson() {
    const r = await utils.integrations.einvoice.fetch({ kind: 'invoice', id: invoice.id });
    setIssues(r.issues);
    if (!r.issues.length) download(`einvoice-${safe(invoice.number)}.json`, [r.json]);
  }
  return (
    <Card>
      <CardHeader title="e-Invoice & e-way bill" />
      <CardBody className="flex flex-col gap-3 text-sm">
        <div>
          <p className="font-medium text-navy">e-Invoice (IRN)</p>
          {invoice.irn ? (
            <p className="mt-1 break-all text-xs text-muted">IRN {invoice.irn}<br />Ack {invoice.ackNo} · {invoice.ackDate ? formatDate(invoice.ackDate) : ''}. Printed on the PDF with the QR code.</p>
          ) : !b2b ? <p className="mt-1 text-xs text-muted">Not needed: the buyer has no GSTIN (B2C).</p> : (
            <>
              <p className="mt-1 text-xs text-muted">{cfg.data?.eInvoice.enabled ? 'Upload this JSON on the IRP (or through your GSP), then record the IRN here.' : 'Turn on e-invoicing in Settings → Integrations once your turnover requires it.'}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                <Button size="sm" variant="secondary" onClick={() => void einvoiceJson()}><FileJson className="size-4" aria-hidden /> e-Invoice JSON</Button>
                <Button size="sm" variant="secondary" onClick={() => setDialog('irn')}><QrCode className="size-4" aria-hidden /> Record IRN</Button>
              </div>
            </>
          )}
        </div>
        {issues && issues.length > 0 && <Alert tone="warn">Fix these first: {issues.join('; ')}</Alert>}
        <div className="border-t border-line pt-3">
          <p className="font-medium text-navy">E-way bill</p>
          {invoice.ewayBillNo ? <p className="mt-1 text-xs text-muted">No. {invoice.ewayBillNo}{invoice.ewayBillDate ? ` dt. ${formatDate(invoice.ewayBillDate)}` : ''}. Printed on the invoice.</p> : (
            <>
              <p className="mt-1 text-xs text-muted">{needsEway ? `Required: invoice value ${rupees(invoice.grandTotal)} is above ${rupees(cfg.data?.ewayBill.thresholdValue ?? 50000)}.` : 'Usually not required below the threshold, but you can still prepare one.'}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                <Button size="sm" variant="secondary" onClick={() => setDialog('eway')}><Truck className="size-4" aria-hidden /> E-way bill JSON</Button>
                <Button size="sm" variant="secondary" onClick={() => setDialog('ewayNo')}>Record e-way bill no.</Button>
              </div>
            </>
          )}
        </div>
      </CardBody>
      {dialog === 'irn' && <IrnDialog id={invoice.id} onClose={() => setDialog(null)} />}
      {dialog === 'eway' && <EwayDialog invoice={invoice} onClose={() => setDialog(null)} />}
      {dialog === 'ewayNo' && <EwayNoDialog id={invoice.id} onClose={() => setDialog(null)} />}
    </Card>
  );
}

function IrnDialog({ id, onClose }: { id: string; onClose: () => void }) {
  const utils = trpc.useUtils();
  const [v, setV] = useState({ irn: '', ackNo: '', ackDate: istDateString(), signedQr: '' });
  const m = trpc.integrations.recordIrn.useMutation({ onSuccess: async () => { await utils.invoices.invalidate(); onClose(); } });
  const fe = fieldErrors(m.error);
  return (
    <Dialog open onClose={onClose} title="Record IRN" description="Copy these from the IRP / GSP response. They print on the invoice." size="md"
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button loading={m.isPending} onClick={() => m.mutate({ kind: 'invoice', id, ...v })}>Save</Button></>}>
      <div className="flex flex-col gap-3">
        <TextField label="IRN (64 characters)" value={v.irn} onChange={(e) => setV({ ...v, irn: e.target.value })} error={fe.irn} className="font-mono text-xs" />
        <div className="grid grid-cols-2 gap-3"><TextField label="Ack No." value={v.ackNo} onChange={(e) => setV({ ...v, ackNo: e.target.value })} error={fe.ackNo} /><TextField label="Ack date" type="date" value={v.ackDate} onChange={(e) => setV({ ...v, ackDate: e.target.value })} /></div>
        <TextAreaField label="Signed QR code (text)" rows={4} value={v.signedQr} onChange={(e) => setV({ ...v, signedQr: e.target.value })} error={fe.signedQr} className="font-mono text-xs" />
        {m.error && !Object.keys(fe).length && <Alert>{errorMessage(m.error)}</Alert>}
      </div>
    </Dialog>
  );
}

function EwayDialog({ invoice, onClose }: { invoice: { id: string; number: string }; onClose: () => void }) {
  const utils = trpc.useUtils();
  const [v, setV] = useState({ transMode: '1', distanceKm: '', transporterId: '', transporterName: '', vehicleNo: '', transDocNo: '', transDocDate: '' });
  const [issues, setIssues] = useState<string[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  async function go() {
    setErr(null);
    try {
      const r = await utils.integrations.eway.fetch({ invoiceId: invoice.id, transMode: Number(v.transMode) as 1, distanceKm: Number(v.distanceKm), transporterId: v.transporterId || null, transporterName: v.transporterName || null, vehicleNo: v.vehicleNo || null, transDocNo: v.transDocNo || null, transDocDate: v.transDocDate || null });
      setIssues(r.issues);
      if (!r.issues.length) { download(`ewaybill-${safe(invoice.number)}.json`, r.json); onClose(); }
    } catch (e) { setErr(errorMessage(e as never)); }
  }
  return (
    <Dialog open onClose={onClose} title="E-way bill JSON" description="Upload this on ewaybillgst.gov.in (Generate → Bulk), then record the number here." size="md"
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={() => void go()}>Download JSON</Button></>}>
      <div className="grid gap-3 sm:grid-cols-2">
        <SelectField label="Mode" value={v.transMode} onChange={(e) => setV({ ...v, transMode: e.target.value })}><option value="1">Road</option><option value="2">Rail</option><option value="3">Air</option><option value="4">Ship</option></SelectField>
        <TextField label="Distance (km)" type="number" min={1} value={v.distanceKm} onChange={(e) => setV({ ...v, distanceKm: e.target.value })} />
        <TextField label="Transporter ID / GSTIN (optional)" value={v.transporterId} onChange={(e) => setV({ ...v, transporterId: e.target.value.toUpperCase() })} />
        <TextField label="Transporter name (optional)" value={v.transporterName} onChange={(e) => setV({ ...v, transporterName: e.target.value })} />
        <TextField label="Vehicle no. (optional)" placeholder="GJ01AB1234" value={v.vehicleNo} onChange={(e) => setV({ ...v, vehicleNo: e.target.value.toUpperCase() })} />
        <TextField label="LR / docket no. (optional)" value={v.transDocNo} onChange={(e) => setV({ ...v, transDocNo: e.target.value })} />
        {issues && issues.length > 0 && <div className="sm:col-span-2"><Alert tone="warn">Fix these first: {issues.join('; ')}</Alert></div>}
        {err && <div className="sm:col-span-2"><Alert>{err}</Alert></div>}
      </div>
    </Dialog>
  );
}

function EwayNoDialog({ id, onClose }: { id: string; onClose: () => void }) {
  const utils = trpc.useUtils();
  const [v, setV] = useState({ ewayBillNo: '', ewayBillDate: istDateString() });
  const m = trpc.integrations.recordEway.useMutation({ onSuccess: async () => { await utils.invoices.invalidate(); onClose(); } });
  const fe = fieldErrors(m.error);
  return (
    <Dialog open onClose={onClose} title="Record e-way bill" size="sm"
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button loading={m.isPending} onClick={() => m.mutate({ invoiceId: id, ...v })}>Save</Button></>}>
      <div className="flex flex-col gap-3">
        <TextField label="E-way bill no. (12 digits)" inputMode="numeric" value={v.ewayBillNo} onChange={(e) => setV({ ...v, ewayBillNo: e.target.value })} error={fe.ewayBillNo} />
        <TextField label="Date" type="date" value={v.ewayBillDate} onChange={(e) => setV({ ...v, ewayBillDate: e.target.value })} />
        {m.error && !Object.keys(fe).length && <Alert>{errorMessage(m.error)}</Alert>}
      </div>
    </Dialog>
  );
}
