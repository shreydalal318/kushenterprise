import { forwardRef, useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

const control =
  'w-full rounded-lg border border-line bg-white px-3 text-sm text-ink placeholder:text-muted/70 focus:border-teal focus:outline-none focus:ring-2 focus:ring-teal/25 disabled:bg-canvas aria-[invalid=true]:border-danger';

interface FieldShellProps { label: string; hint?: ReactNode; error?: string; id: string; children: ReactNode; className?: string }
function FieldShell({ label, hint, error, id, children, className }: FieldShellProps) {
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <label htmlFor={id} className="text-sm font-medium text-ink">{label}</label>
      {children}
      {error ? (
        <p id={`${id}-err`} className="text-xs text-danger" role="alert">{error}</p>
      ) : hint ? (
        <p className="text-xs text-muted">{hint}</p>
      ) : null}
    </div>
  );
}

type Base = { label: string; hint?: ReactNode; error?: string; wrapperClassName?: string };

export const TextField = forwardRef<HTMLInputElement, Base & InputHTMLAttributes<HTMLInputElement>>(function TextField(
  { label, hint, error, wrapperClassName, className, id, ...rest }, ref,
) {
  const auto = useId();
  const fid = id ?? auto;
  return (
    <FieldShell label={label} hint={hint} error={error} id={fid} className={wrapperClassName}>
      <input ref={ref} id={fid} aria-invalid={!!error} aria-describedby={error ? `${fid}-err` : undefined} className={cn(control, 'h-10', className)} {...rest} />
    </FieldShell>
  );
});

export function TextAreaField({ label, hint, error, wrapperClassName, className, id, ...rest }: Base & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const auto = useId();
  const fid = id ?? auto;
  return (
    <FieldShell label={label} hint={hint} error={error} id={fid} className={wrapperClassName}>
      <textarea id={fid} aria-invalid={!!error} className={cn(control, 'min-h-24 py-2', className)} {...rest} />
    </FieldShell>
  );
}

export function SelectField({ label, hint, error, wrapperClassName, className, id, children, ...rest }: Base & SelectHTMLAttributes<HTMLSelectElement>) {
  const auto = useId();
  const fid = id ?? auto;
  return (
    <FieldShell label={label} hint={hint} error={error} id={fid} className={wrapperClassName}>
      <select id={fid} aria-invalid={!!error} className={cn(control, 'h-10 pr-8', className)} {...rest}>{children}</select>
    </FieldShell>
  );
}

export function Checkbox({ label, description, className, ...rest }: { label: ReactNode; description?: ReactNode } & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className={cn('flex cursor-pointer items-start gap-3 rounded-lg p-2 hover:bg-aqua-50', className)}>
      <input type="checkbox" className="mt-0.5 size-4 shrink-0 accent-teal-700" {...rest} />
      <span className="text-sm">
        <span className="font-medium text-ink">{label}</span>
        {description && <span className="block text-xs text-muted">{description}</span>}
      </span>
    </label>
  );
}
