'use client';
import { PERMISSION_GROUPS, PERMISSIONS, type Permission } from '@kush/core';
import { Checkbox } from '@/components/ui/field';

const PRESETS: { label: string; perms: Permission[] }[] = [
  { label: 'Counter / billing', perms: ['VIEW_ORDERS', 'CREATE_ORDERS', 'CREATE_PROFORMA', 'CREATE_TAX_INVOICE', 'RECORD_PAYMENTS'] },
  { label: 'Store / dispatch', perms: ['VIEW_ORDERS', 'UPDATE_ORDER_STATUS', 'SCAN_DISPATCH', 'MANAGE_STOCK'] },
  { label: 'Sales rep', perms: ['VIEW_ORDERS', 'CREATE_ORDERS', 'MANAGE_CUSTOMERS'] },
];

export function PermissionPicker({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const toggle = (p: Permission) => onChange(value.includes(p) ? value.filter((x) => x !== p) : [...value, p]);
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-muted">Quick start:</span>
        {PRESETS.map((p) => (
          <button key={p.label} type="button" onClick={() => onChange([...new Set([...value, ...p.perms])])} className="rounded-full border border-line px-3 py-1 hover:border-teal hover:bg-aqua-50">+ {p.label}</button>
        ))}
        {value.length > 0 && <button type="button" onClick={() => onChange([])} className="px-2 py-1 text-muted hover:text-danger">Clear all</button>}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {PERMISSION_GROUPS.map((g) => (
          <fieldset key={g.group} className="rounded-lg border border-line p-2">
            <legend className="px-2 text-xs font-semibold uppercase tracking-wide text-muted">{g.group}</legend>
            {g.permissions.map((p) => (
              <Checkbox key={p} label={PERMISSIONS[p].label} checked={value.includes(p)} onChange={() => toggle(p)}
                description={p === 'VIEW_PRICES_MARGINS' ? 'Purchase cost, margins and every customer’s price' : undefined} />
            ))}
          </fieldset>
        ))}
      </div>
    </div>
  );
}
