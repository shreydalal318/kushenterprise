'use client';
import { useState } from 'react';
import { Pencil, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Alert, Badge, Card, CardBody, CardHeader } from '@/components/ui/card';
import { errorMessage } from '@/lib/errors';
import { trpc } from '@/lib/trpc';

export function CategoriesSection() {
  const utils = trpc.useUtils();
  const list = trpc.settings.categories.useQuery();
  const [name, setName] = useState('');
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null);
  const done = () => utils.settings.categories.invalidate();
  const create = trpc.settings.createCategory.useMutation({ onSuccess: () => { setName(''); void done(); } });
  const rename = trpc.settings.renameCategory.useMutation({ onSuccess: () => { setEditing(null); void done(); } });
  const del = trpc.settings.deleteCategory.useMutation({ onSuccess: done });
  const err = create.error ?? rename.error ?? del.error;

  return (
    <Card>
      <CardHeader title="Product categories" description="Used to group the catalogue and reports. A category in use can be renamed but not deleted." />
      <CardBody className="flex flex-col gap-4">
        <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (name.trim()) create.mutate({ name }); }}>
          <input aria-label="New category name" value={name} onChange={(e) => setName(e.target.value)} placeholder="New category" className="h-10 flex-1 rounded-lg border border-line px-3 text-sm sm:max-w-xs" />
          <Button type="submit" loading={create.isPending}>Add</Button>
        </form>
        {err && <Alert>{errorMessage(err)}</Alert>}
        <ul className="divide-y divide-line rounded-lg border border-line">
          {list.data?.map((c) => (
            <li key={c.id} className="flex items-center gap-3 px-4 py-2.5">
              {editing?.id === c.id ? (
                <form className="flex flex-1 gap-2" onSubmit={(e) => { e.preventDefault(); rename.mutate(editing); }}>
                  <input aria-label="Category name" autoFocus value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} className="h-9 flex-1 rounded-md border border-line px-2 text-sm" />
                  <Button size="sm" type="submit" loading={rename.isPending}>Save</Button>
                  <Button size="sm" type="button" variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
                </form>
              ) : (
                <>
                  <span className="flex-1 text-sm font-medium">{c.name}</span>
                  <Badge>{c._count.products} products</Badge>
                  <button aria-label={`Rename ${c.name}`} className="rounded p-1.5 text-muted hover:bg-aqua-50 hover:text-ink" onClick={() => setEditing({ id: c.id, name: c.name })}><Pencil className="size-4" /></button>
                  <button aria-label={`Delete ${c.name}`} disabled={c._count.products > 0} className="rounded p-1.5 text-muted hover:bg-danger-50 hover:text-danger disabled:opacity-30 disabled:hover:bg-transparent"
                    onClick={() => { if (confirm(`Delete category "${c.name}"?`)) del.mutate({ id: c.id }); }}><Trash2 className="size-4" /></button>
                </>
              )}
            </li>
          ))}
        </ul>
      </CardBody>
    </Card>
  );
}
