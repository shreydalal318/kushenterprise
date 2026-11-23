'use client';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { SelectField, TextField } from '@/components/ui/field';
import { errorMessage, fieldErrors } from '@/lib/errors';
import { trpc } from '@/lib/trpc';

export function BrandSelect({ value, onChange, error, canCreate }: { value: string | null; onChange: (id: string | null) => void; error?: string; canCreate: boolean }) {
  const utils = trpc.useUtils();
  const brands = trpc.brands.list.useQuery();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [manufacturer, setManufacturer] = useState('');
  const create = trpc.brands.create.useMutation({
    onSuccess: async (b) => { await utils.brands.list.invalidate(); onChange(b.id); setOpen(false); setName(''); setManufacturer(''); },
  });
  const fe = fieldErrors(create.error);
  return (
    <>
      <SelectField label="Brand / manufacturer" value={value ?? ''} error={error}
        onChange={(e) => (e.target.value === '__new' ? setOpen(true) : onChange(e.target.value || null))}>
        <option value="">— None —</option>
        {brands.data?.map((b) => <option key={b.id} value={b.id}>{b.name}{b.manufacturer ? ` (${b.manufacturer})` : ''}</option>)}
        {canCreate && <option value="__new">+ Add a new brand…</option>}
      </SelectField>
      <Dialog open={open} onClose={() => setOpen(false)} title="New brand" size="sm"
        footer={<><Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button><Button loading={create.isPending} onClick={() => create.mutate({ name, manufacturer })}>Add brand</Button></>}>
        <div className="flex flex-col gap-4">
          <TextField label="Brand name" value={name} onChange={(e) => setName(e.target.value)} error={fe.name} autoFocus />
          <TextField label="Manufacturer (optional)" value={manufacturer} onChange={(e) => setManufacturer(e.target.value)} />
          {create.error && !Object.keys(fe).length && <p className="text-sm text-danger">{errorMessage(create.error)}</p>}
        </div>
      </Dialog>
    </>
  );
}
