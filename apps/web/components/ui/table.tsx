import type { ReactNode, ThHTMLAttributes, TdHTMLAttributes } from 'react';
import { cn } from '@/lib/cn';
import { errorMessage } from '@/lib/errors';

export function Table({ children, minWidth = 720, className }: { children: ReactNode; minWidth?: number; className?: string }) {
  return (
    <div className={cn('overflow-x-auto', className)}>
      <table className="w-full text-sm" style={{ minWidth }}>{children}</table>
    </div>
  );
}
export const THead = ({ children }: { children: ReactNode }) => (
  <thead className="bg-canvas text-left text-xs uppercase tracking-wide text-muted">{children}</thead>
);
export const Th = ({ className, ...p }: ThHTMLAttributes<HTMLTableCellElement>) => <th className={cn('px-3 py-2.5 font-medium first:pl-5 last:pr-5', className)} {...p} />;
export const Td = ({ className, ...p }: TdHTMLAttributes<HTMLTableCellElement>) => <td className={cn('px-3 py-2.5 first:pl-5 last:pr-5', className)} {...p} />;
export const Tr = ({ className, children, ...p }: { className?: string; children: ReactNode } & React.HTMLAttributes<HTMLTableRowElement>) => (
  <tr className={cn('border-t border-line', className)} {...p}>{children}</tr>
);
/** Placeholder rows while a list loads, so an empty table never reads as "nothing here". Pass the query's error so a failed load says so instead of loading forever. */
export function LoadingRow({ cols, rows = 3, error }: { cols: number; rows?: number; error?: unknown }) {
  if (error) return <tr><td colSpan={cols} role="alert" className="px-5 py-8 text-center text-sm text-danger">{errorMessage(error)}</td></tr>;
  return (
    <>
      {Array.from({ length: rows }, (_, i) => (
        <tr key={i} aria-hidden className="animate-pulse">
          <td colSpan={cols} className="px-5 py-3"><div className="h-4 rounded bg-canvas" style={{ width: `${85 - i * 15}%` }} /></td>
        </tr>
      ))}
      <tr className="sr-only"><td colSpan={cols}>Loading…</td></tr>
    </>
  );
}

export function EmptyRow({ cols, children }: { cols: number; children: ReactNode }) {
  return <tr><td colSpan={cols} className="px-5 py-10 text-center text-sm text-muted">{children}</td></tr>;
}
