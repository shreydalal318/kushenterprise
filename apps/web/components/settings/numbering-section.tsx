'use client';
import { useEffect, useState } from 'react';
import { Check } from 'lucide-react';
import { financialYear, formatDocNumber } from '@kush/core';
import { Button } from '@/components/ui/button';
import { Alert, Card, CardBody, CardHeader } from '@/components/ui/card';
import { errorMessage, fieldErrors } from '@/lib/errors';
import { trpc, type RouterOutputs } from '@/lib/trpc';

type Row = RouterOutputs['settings']['numberSeries']['series'][number];

export function NumberingSection() {
  const current = financialYear();
  const nextFy = (() => { const y = Number(current.slice(0, 4)) + 1; return `${y}-${String((y + 1) % 100).padStart(2, '0')}`; })();
  const [fy, setFy] = useState(current);
  const q = trpc.settings.numberSeries.useQuery({ financialYear: fy });

  return (
    <Card>
      <CardHeader
        title="Document numbering"
        description="Numbers restart every financial year (April–March). The year is inserted automatically after the prefix."
        actions={
          <select aria-label="Financial year" value={fy} onChange={(e) => setFy(e.target.value)} className="h-9 rounded-lg border border-line bg-white px-3 text-sm">
            <option value={current}>FY {current} (current)</option>
            <option value={nextFy}>FY {nextFy} (next)</option>
          </select>
        }
      />
      <CardBody className="overflow-x-auto p-0">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="bg-canvas text-left text-xs uppercase tracking-wide text-muted">
            <tr><th className="px-5 py-2 font-medium">Document</th><th className="px-2 py-2 font-medium">Prefix</th><th className="px-2 py-2 font-medium">Next no.</th><th className="px-2 py-2 font-medium">Digits</th><th className="px-2 py-2 font-medium">Next number will be</th><th className="px-5 py-2" /></tr>
          </thead>
          <tbody>
            {q.data?.series.map((r) => <SeriesRow key={`${fy}-${r.docType}`} row={r} fy={fy} />)}
          </tbody>
        </table>
      </CardBody>
    </Card>
  );
}

function SeriesRow({ row, fy }: { row: Row; fy: string }) {
  const utils = trpc.useUtils();
  const [v, setV] = useState({ prefix: row.prefix, nextNumber: row.nextNumber, padding: row.padding });
  useEffect(() => setV({ prefix: row.prefix, nextNumber: row.nextNumber, padding: row.padding }), [row.prefix, row.nextNumber, row.padding]);
  const dirty = v.prefix !== row.prefix || v.nextNumber !== row.nextNumber || v.padding !== row.padding;
  const save = trpc.settings.updateNumberSeries.useMutation({ onSuccess: () => utils.settings.numberSeries.invalidate() });
  const fe = fieldErrors(save.error);
  const input = 'h-9 rounded-md border border-line px-2 text-sm aria-[invalid=true]:border-danger';
  return (
    <>
      <tr className="border-t border-line">
        <td className="px-5 py-2 font-medium">{row.label}</td>
        <td className="px-2 py-2"><input aria-label={`${row.label} prefix`} aria-invalid={!!fe.prefix} className={`${input} w-28`} value={v.prefix} onChange={(e) => setV({ ...v, prefix: e.target.value })} /></td>
        <td className="px-2 py-2"><input aria-label={`${row.label} next number`} aria-invalid={!!fe.nextNumber} type="number" min={1} className={`${input} w-24`} value={v.nextNumber} onChange={(e) => setV({ ...v, nextNumber: Number(e.target.value) })} /></td>
        <td className="px-2 py-2"><input aria-label={`${row.label} digits`} type="number" min={1} max={8} className={`${input} w-16`} value={v.padding} onChange={(e) => setV({ ...v, padding: Number(e.target.value) })} /></td>
        <td className="whitespace-nowrap px-2 py-2 font-mono text-xs text-navy">{formatDocNumber(v.prefix, fy, v.nextNumber || 1, v.padding || 4)}</td>
        <td className="px-5 py-2 text-right">
          {save.isSuccess && !dirty ? <Check className="ml-auto size-4 text-ok" aria-label="Saved" /> : (
            <Button size="sm" variant="secondary" disabled={!dirty} loading={save.isPending} onClick={() => save.mutate({ docType: row.docType, financialYear: fy, ...v })}>Save</Button>
          )}
        </td>
      </tr>
      {save.error && (
        <tr><td colSpan={6} className="px-5 pb-2"><Alert>{Object.values(fe)[0] ?? errorMessage(save.error)}</Alert></td></tr>
      )}
    </>
  );
}
