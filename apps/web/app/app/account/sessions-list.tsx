'use client';
import { Monitor, Smartphone } from 'lucide-react';
import { formatDateTime } from '@kush/core';
import { Badge } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { trpc } from '@/lib/trpc';

const device = (ua: string | null) => {
  if (!ua) return 'Unknown device';
  const os = /Android/.test(ua) ? 'Android' : /iPhone|iPad/.test(ua) ? 'iOS' : /Windows/.test(ua) ? 'Windows' : /Mac OS/.test(ua) ? 'macOS' : /Linux/.test(ua) ? 'Linux' : 'Device';
  const br = /Edg\//.test(ua) ? 'Edge' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : '';
  return [br, os].filter(Boolean).join(' on ');
};

export function SessionsList() {
  const utils = trpc.useUtils();
  const q = trpc.auth.mySessions.useQuery();
  const revoke = trpc.auth.revokeSession.useMutation({ onSuccess: () => utils.auth.mySessions.invalidate() });
  return (
    <ul className="divide-y divide-line">
      {q.data?.map((s) => (
        <li key={s.id} className="flex items-center gap-3 py-3">
          {s.client === 'mobile' ? <Smartphone className="size-5 text-muted" aria-hidden /> : <Monitor className="size-5 text-muted" aria-hidden />}
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{device(s.userAgent)} {s.current && <Badge tone="teal" className="ml-1">This device</Badge>}</p>
            <p className="text-xs text-muted">Last active {formatDateTime(s.lastUsedAt)}{s.ip ? ` · ${s.ip}` : ''}</p>
          </div>
          {!s.current && <Button size="sm" variant="secondary" loading={revoke.isPending && revoke.variables?.id === s.id} onClick={() => revoke.mutate({ id: s.id })}>Sign out</Button>}
        </li>
      ))}
    </ul>
  );
}
