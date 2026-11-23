import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <section className={cn('rounded-[var(--radius-card)] border border-line bg-white', className)}>{children}</section>;
}

export function CardHeader({ title, description, actions }: { title: ReactNode; description?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-5 py-4">
      <div>
        <h2 className="text-base font-semibold text-ink">{title}</h2>
        {description && <p className="mt-0.5 text-sm text-muted">{description}</p>}
      </div>
      {actions}
    </div>
  );
}

export const CardBody = ({ className, children }: { className?: string; children: ReactNode }) => (
  <div className={cn('px-5 py-4', className)}>{children}</div>
);

export function PageHeader({ title, description, actions }: { title: string; description?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-navy">{title}</h1>
        {description && <p className="mt-1 text-sm text-muted">{description}</p>}
      </div>
      {actions}
    </div>
  );
}

const tones = {
  neutral: 'bg-canvas text-muted border-line',
  teal: 'bg-aqua-100 text-teal-800 border-aqua',
  ok: 'bg-ok-50 text-ok border-ok/20',
  warn: 'bg-warn-50 text-warn border-warn/20',
  danger: 'bg-danger-50 text-danger border-danger/20',
  navy: 'bg-navy text-white border-navy',
} as const;

export function Badge({ tone = 'neutral', children, className }: { tone?: keyof typeof tones; children: ReactNode; className?: string }) {
  return <span className={cn('inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium', tones[tone], className)}>{children}</span>;
}

export function Alert({ tone = 'danger', children }: { tone?: 'danger' | 'ok' | 'warn' | 'info'; children: ReactNode }) {
  const t = { danger: tones.danger, ok: tones.ok, warn: tones.warn, info: tones.teal }[tone];
  return <div role={tone === 'danger' ? 'alert' : 'status'} className={cn('rounded-lg border px-3 py-2 text-sm', t)}>{children}</div>;
}
