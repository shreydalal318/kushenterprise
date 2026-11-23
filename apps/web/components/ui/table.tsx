import type { ReactNode, ThHTMLAttributes, TdHTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

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
export function EmptyRow({ cols, children }: { cols: number; children: ReactNode }) {
  return <tr><td colSpan={cols} className="px-5 py-10 text-center text-sm text-muted">{children}</td></tr>;
}
