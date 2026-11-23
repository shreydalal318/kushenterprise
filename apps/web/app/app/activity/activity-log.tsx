'use client';
import { useState } from 'react';
import { formatDateTime } from '@kush/core';
import { Button } from '@/components/ui/button';
import { Badge, Card, PageHeader } from '@/components/ui/card';
import { trpc } from '@/lib/trpc';

const ACTIONS = [
  ['', 'All actions'],
  ['auth.', 'Sign-ins & security'],
  ['employee.', 'Employees & permissions'],
  ['settings.', 'Settings & numbering'],
  ['category.', 'Categories'],
] as const;

const tone = (a: string) => (a.includes('failed') || a.includes('locked') || a.includes('deactivate') ? 'danger' : a.startsWith('auth.') ? 'neutral' : 'teal') as 'danger' | 'neutral' | 'teal';

export function ActivityLog() {
  const [action, setAction] = useState('');
  const [actorId, setActorId] = useState('');
  const actors = trpc.activity.actors.useQuery();
  const q = trpc.activity.list.useInfiniteQuery(
    { action: action || undefined, actorId: actorId || undefined, limit: 50 },
    { getNextPageParam: (p) => p.nextCursor ?? undefined },
  );
  const rows = q.data?.pages.flatMap((p) => p.items) ?? [];
  const select = 'h-9 rounded-lg border border-line bg-white px-3 text-sm';

  return (
    <>
      <PageHeader title="Activity log" description="Who did what and when. Entries cannot be edited or deleted." />
      <div className="mb-4 flex flex-wrap gap-2">
        <select aria-label="Filter by action" className={select} value={action} onChange={(e) => setAction(e.target.value)}>
          {ACTIONS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
        <select aria-label="Filter by person" className={select} value={actorId} onChange={(e) => setActorId(e.target.value)}>
          <option value="">Everyone</option>
          {actors.data?.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
      </div>
      <Card className="overflow-hidden">
        <ul className="divide-y divide-line">
          {rows.length === 0 && !q.isLoading && <li className="px-5 py-10 text-center text-sm text-muted">No activity matches these filters.</li>}
          {rows.map((r) => (
            <li key={r.id} className="flex flex-col gap-1 px-5 py-3 sm:flex-row sm:items-center sm:gap-4">
              <time className="w-36 shrink-0 text-xs text-muted" dateTime={new Date(r.createdAt).toISOString()}>{formatDateTime(r.createdAt)}</time>
              <span className="w-40 shrink-0 truncate text-sm font-medium">{r.actor?.name ?? 'System'}</span>
              <Badge tone={tone(r.action)} className="w-fit shrink-0 font-mono">{r.action}</Badge>
              <span className="min-w-0 flex-1 text-sm text-ink">{r.summary}</span>
              {r.ip && <span className="shrink-0 font-mono text-xs text-muted">{r.ip}</span>}
            </li>
          ))}
        </ul>
        {q.hasNextPage && (
          <div className="border-t border-line p-3 text-center">
            <Button variant="secondary" size="sm" loading={q.isFetchingNextPage} onClick={() => q.fetchNextPage()}>Load older</Button>
          </div>
        )}
      </Card>
    </>
  );
}
