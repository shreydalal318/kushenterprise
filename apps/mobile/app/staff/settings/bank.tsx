import { useState } from 'react';
import { Action, Confirm, fieldErrors, Input, Line, Note } from '@/components/admin/bits';
import { SaveBar, useForm, WithSettings, type Settings } from '@/components/admin/settings-bits';
import { Alert, Card, H2, Screen } from '@/components/ui';
import { trpc } from '@/lib/trpc';

export default function BankSettings() {
  return <WithSettings title="Bank, UPI and signature">{(s) => <BankForm s={s} />}</WithSettings>;
}

/** Shown in the invoice footer; the UPI ID also makes the "Scan to pay" QR code. */
function BankForm({ s }: { s: Settings }) {
  const utils = trpc.useUtils();
  const [flash, setFlash] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);
  const f = useForm({ bankName: s.bankName, bankAccountNo: s.bankAccountNo, bankIfsc: s.bankIfsc, bankBranch: s.bankBranch, upiId: s.upiId ?? '' });
  const save = trpc.settings.updateBank.useMutation({ onSuccess: (d) => { utils.settings.get.setData(undefined, d); f.saved(); setFlash('Bank details saved ✓'); } });
  const clear = trpc.settings.clearSignature.useMutation({ onSuccess: (d) => { utils.settings.get.setData(undefined, d); setConfirm(false); setFlash('Signature removed. Invoices now print without it.'); } });
  const fe = fieldErrors(save.error);
  const v = f.v;
  const set = (k: keyof typeof v) => (x: string) => { setFlash(null); f.set(k, x); };
  return (
    <Screen footer={confirm ? (
      <Confirm question="Remove the signature / stamp?" detail="New invoices print without it until you upload one again on the website." yes="Yes, remove it" no="No, keep it"
        busy={clear.isPending} error={clear.error} onYes={() => clear.mutate()} onNo={() => { clear.reset(); setConfirm(false); }} />
    ) : <SaveBar error={save.error} saving={save.isPending} dirty={f.dirty} onSave={() => save.mutate(v)} />}>
      {!!flash && <Alert tone="ok">{flash}</Alert>}
      <Note>Shown at the bottom of invoices. The UPI ID also makes the “Scan to pay” QR code.</Note>
      <Card>
        <H2>Bank and UPI</H2>
        <Input label="Bank name" value={v.bankName} onChangeText={set('bankName')} error={fe.bankName} maxLength={100} />
        <Input label="Account number" keyboardType="number-pad" value={v.bankAccountNo} onChangeText={set('bankAccountNo')} error={fe.bankAccountNo} maxLength={40} />
        <Input label="IFSC" autoCapitalize="characters" value={v.bankIfsc} onChangeText={set('bankIfsc')} error={fe.bankIfsc} maxLength={20} />
        <Input label="Branch" value={v.bankBranch} onChangeText={set('bankBranch')} error={fe.bankBranch} maxLength={100} />
        <Input label="UPI ID (optional)" autoCapitalize="none" placeholder="kushenterprise@bank" value={v.upiId} onChangeText={set('upiId')} error={fe.upiId} maxLength={100} />
      </Card>
      <Card>
        <H2>Signature / stamp</H2>
        <Line k="On invoices" v={s.signatureFileId ? 'Yes, an image is set' : 'No image yet'} />
        <Note>To upload or change the image, use the website (Settings → Bank, UPI & signature).</Note>
        {!!s.signatureFileId && <Action icon="trash-outline" title="Remove the signature" danger onPress={() => { setFlash(null); setConfirm(true); }} />}
      </Card>
    </Screen>
  );
}
