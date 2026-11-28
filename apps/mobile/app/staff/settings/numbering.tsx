import { useEffect, useState } from 'react';
import { Text } from 'react-native';
import { financialYear, formatDocNumber } from '@kush/core';
import { fieldErrors, Input, Note, Pills, SmallButton, Waiting } from '@/components/admin/bits';
import { OwnerOnly } from '@/components/admin/settings-bits';
import { Alert, Card, H2, Screen } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { errorText } from '@/lib/format';
import { C } from '@/lib/theme';
import { trpc, type RouterOutputs } from '@/lib/trpc';
import { Done } from '@/components/done';

type Row = RouterOutputs['settings']['numberSeries']['series'][number];
const int = (v: string) => (/^\d+$/.test(v.trim()) ? Number(v.trim()) : 0);

/** Document numbers restart every financial year (April–March); the year goes in after the prefix. */
export default function Numbering() {
  const { me } = useAuth();
  const current = financialYear();
  const nextFy = (() => { const y = Number(current.slice(0, 4)) + 1; return `${y}-${String((y + 1) % 100).padStart(2, '0')}`; })();
  const [fy, setFy] = useState(current);
  const q = trpc.settings.numberSeries.useQuery({ financialYear: fy }, { enabled: me?.role === 'OWNER' });
  return (
    <OwnerOnly title="Document numbers">
      <Screen>
        <Note>Numbers restart every financial year (April to March). The year is put in after the prefix by itself.</Note>
        <Pills value={fy} onChange={setFy} options={[[current, `${current} (this year)`], [nextFy, `${nextFy} (next year)`]]} />
        {!q.data ? <Waiting q={q} /> : q.data.series.map((r) => <SeriesCard key={`${fy}-${r.docType}`} row={r} fy={fy} />)}
      </Screen>
    </OwnerOnly>
  );
}

function SeriesCard({ row, fy }: { row: Row; fy: string }) {
  const utils = trpc.useUtils();
  const [v, setV] = useState({ prefix: row.prefix, nextNumber: String(row.nextNumber), padding: String(row.padding) });
  const [done, setDone] = useState(false);
  useEffect(() => setV({ prefix: row.prefix, nextNumber: String(row.nextNumber), padding: String(row.padding) }), [row.prefix, row.nextNumber, row.padding]);
  const save = trpc.settings.updateNumberSeries.useMutation({ onSuccess: () => { setDone(true); void utils.settings.numberSeries.invalidate(); } });
  const fe = fieldErrors(save.error);
  const dirty = v.prefix !== row.prefix || int(v.nextNumber) !== row.nextNumber || int(v.padding) !== row.padding;
  const set = (k: keyof typeof v) => (x: string) => { setDone(false); save.reset(); setV({ ...v, [k]: x }); };
  const bad = !v.prefix.trim() || int(v.nextNumber) < 1 || int(v.padding) < 1 || int(v.padding) > 8;
  return (
    <Card>
      <H2>{row.label}</H2>
      <Input label="Prefix" autoCapitalize="characters" value={v.prefix} onChangeText={set('prefix')} error={fe.prefix} maxLength={20} />
      <Input label="Next number" keyboardType="number-pad" value={v.nextNumber} onChangeText={set('nextNumber')} error={fe.nextNumber} maxLength={6} />
      <Input label="Digits" keyboardType="number-pad" value={v.padding} onChangeText={set('padding')} error={fe.padding} hint="How many digits, with zeros in front (4 makes 0001)." maxLength={1} />
      <Note>The next one will be</Note>
      <Text style={{ fontSize: 17, fontWeight: '700', color: C.navy }}>{formatDocNumber(v.prefix || '…', fy, int(v.nextNumber) || 1, Math.min(8, int(v.padding) || 4))}</Text>
      <Done message={done && !dirty ? `${row.label} numbering saved ✓` : null} />
      {save.error && <Alert>{errorText(save.error)}</Alert>}
      {dirty && <SmallButton icon="save-outline" title={`Save ${row.label.toLowerCase()} numbering`} busy={save.isPending} disabled={bad}
        onPress={() => save.mutate({ docType: row.docType, financialYear: fy, prefix: v.prefix.trim(), nextNumber: int(v.nextNumber), padding: int(v.padding) })} />}
    </Card>
  );
}
