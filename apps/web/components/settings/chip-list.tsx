'use client';
import { useState } from 'react';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';

/** Small editable list of values (GST rates, units, alert days). */
export function ChipList({ label, values, onChange, format = String, inputType = 'text', placeholder, parse = (s: string) => s }: {
  label: string;
  values: (string | number)[];
  onChange: (v: (string | number)[]) => void;
  format?: (v: string | number) => string;
  inputType?: 'text' | 'number';
  placeholder?: string;
  parse?: (s: string) => string | number;
}) {
  const [draft, setDraft] = useState('');
  const add = () => {
    const t = draft.trim();
    if (!t) return;
    onChange([...values, parse(t)]);
    setDraft('');
  };
  return (
    <fieldset>
      <legend className="mb-1.5 text-sm font-medium">{label}</legend>
      <ul className="mb-2 flex flex-wrap gap-2">
        {values.map((v, i) => (
          <li key={`${v}-${i}`} className="flex items-center gap-1 rounded-full border border-aqua bg-aqua-50 py-0.5 pl-3 pr-1 text-sm">
            {format(v)}
            <button type="button" aria-label={`Remove ${format(v)}`} className="rounded-full p-0.5 hover:bg-aqua" onClick={() => onChange(values.filter((_, j) => j !== i))}><X className="size-3.5" /></button>
          </li>
        ))}
      </ul>
      <div className="flex gap-2">
        <input aria-label={`Add to ${label}`} type={inputType} value={draft} placeholder={placeholder} onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } }}
          className="h-9 w-40 rounded-lg border border-line px-3 text-sm" />
        <Button type="button" size="sm" variant="secondary" className="h-9" onClick={add}>Add</Button>
      </div>
    </fieldset>
  );
}
