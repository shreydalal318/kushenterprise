'use client';
import { useRef, useState } from 'react';
import { Upload, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Alert, Card, CardBody, CardHeader } from '@/components/ui/card';
import { TextField } from '@/components/ui/field';
import { fieldErrors } from '@/lib/errors';
import { trpc } from '@/lib/trpc';
import { SectionForm, useFormState } from './section-form';
import type { Settings } from './types';

export function BankSection({ s }: { s: Settings }) {
  const utils = trpc.useUtils();
  const f = useFormState({ bankName: s.bankName, bankAccountNo: s.bankAccountNo, bankIfsc: s.bankIfsc, bankBranch: s.bankBranch, upiId: s.upiId ?? '' });
  const save = trpc.settings.updateBank.useMutation({ onSuccess: (d) => { utils.settings.get.setData(undefined, d); f.setDirty(false); } });
  const fe = fieldErrors(save.error);
  const v = f.values!;
  return (
    <div className="flex flex-col gap-6">
      <SectionForm
        title="Bank & UPI"
        description="Shown in the invoice footer. The UPI ID also generates the 'Scan to pay' QR code."
        onSubmit={() => save.mutate(v)} saving={save.isPending} saved={save.isSuccess} dirty={f.dirty} error={save.error}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField label="Bank name" value={v.bankName} onChange={(e) => f.set('bankName', e.target.value)} error={fe.bankName} />
          <TextField label="Account number" value={v.bankAccountNo} onChange={(e) => f.set('bankAccountNo', e.target.value)} error={fe.bankAccountNo} />
          <TextField label="IFSC" className="uppercase" value={v.bankIfsc} onChange={(e) => f.set('bankIfsc', e.target.value)} error={fe.bankIfsc} />
          <TextField label="Branch" value={v.bankBranch} onChange={(e) => f.set('bankBranch', e.target.value)} error={fe.bankBranch} />
          <TextField label="UPI ID (optional)" placeholder="kushenterprise@bank" value={v.upiId} onChange={(e) => f.set('upiId', e.target.value)} error={fe.upiId} />
        </div>
      </SectionForm>
      <SignatureCard fileId={s.signatureFileId} />
    </div>
  );
}

function SignatureCard({ fileId }: { fileId: string | null }) {
  const utils = trpc.useUtils();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const clear = trpc.settings.clearSignature.useMutation({ onSuccess: (d) => utils.settings.get.setData(undefined, d) });

  async function upload(file: File) {
    setBusy(true); setError(null);
    const body = new FormData();
    body.append('file', file);
    const res = await fetch('/api/settings/signature', { method: 'POST', body });
    const json = (await res.json().catch(() => ({}))) as { error?: string };
    setBusy(false);
    if (!res.ok) return setError(json.error ?? 'Upload failed');
    await utils.settings.get.invalidate();
  }

  return (
    <Card>
      <CardHeader title="Signature / stamp" description='Printed above "Authorised Signatory". PNG with a transparent background works best (max 1 MB).' />
      <CardBody className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <div className="grid h-24 w-56 place-items-center rounded-lg border border-dashed border-line bg-canvas">
          {fileId ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={`/api/files/${fileId}`} alt="Current signature" className="max-h-20 max-w-52 object-contain" />
          ) : (
            <span className="text-xs text-muted">No image yet</span>
          )}
        </div>
        <div className="flex flex-col gap-2">
          <input ref={input} type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" aria-label="Signature image"
            onChange={(e) => { const file = e.target.files?.[0]; if (file) void upload(file); e.target.value = ''; }} />
          <div className="flex gap-2">
            <Button type="button" variant="secondary" loading={busy} onClick={() => input.current?.click()}><Upload className="size-4" aria-hidden /> {fileId ? 'Replace' : 'Upload'}</Button>
            {fileId && <Button type="button" variant="danger" loading={clear.isPending} onClick={() => clear.mutate()}><Trash2 className="size-4" aria-hidden /> Remove</Button>}
          </div>
          {error && <Alert>{error}</Alert>}
        </div>
      </CardBody>
    </Card>
  );
}
