import { useState } from 'react';
import { Text, View } from 'react-native';
import { ButtonRow, Confirm, Input, Note, SmallButton, Waiting } from '@/components/admin/bits';
import { OwnerOnly } from '@/components/admin/settings-bits';
import { Alert, Button, Card, Screen } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { errorText } from '@/lib/format';
import { C } from '@/lib/theme';
import { trpc } from '@/lib/trpc';
import { Done } from '@/components/done';

/** Product categories group the catalogue and the reports. One in use can be renamed but not deleted. */
export default function Categories() {
  const { me } = useAuth();
  const utils = trpc.useUtils();
  const list = trpc.settings.categories.useQuery(undefined, { enabled: me?.role === 'OWNER' });
  const [name, setName] = useState('');
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const refresh = () => utils.settings.categories.invalidate();
  const create = trpc.settings.createCategory.useMutation({ onSuccess: (c) => { setName(''); void refresh(); setFlash(`Category “${c.name}” added ✓`); } });
  const rename = trpc.settings.renameCategory.useMutation({ onSuccess: (c) => { setEditing(null); void refresh(); setFlash(`Renamed to “${c.name}” ✓`); } });
  const del = trpc.settings.deleteCategory.useMutation({ onSuccess: () => { setDeleting(null); void refresh(); setFlash('Category deleted.'); } });
  const clear = () => { setFlash(null); create.reset(); rename.reset(); del.reset(); };
  return (
    <OwnerOnly title="Product categories">
      <Screen footer={
        <>
          {create.error && <Alert>{errorText(create.error)}</Alert>}
          <Input label="New category" value={name} onChangeText={(x) => { clear(); setName(x); }} placeholder="e.g. Viscoelastics" maxLength={80} />
          <Button title="Add category" loading={create.isPending} disabled={name.trim().length < 2} onPress={() => create.mutate({ name })} />
        </>
      }>
        <Done message={flash} onShown={() => setFlash(null)} />
        <Note>Categories group the catalogue and the reports. A category with products in it can be renamed but not deleted.</Note>
        {!list.data && <Waiting q={list} />}
        {list.data?.length === 0 && <Note>No categories yet.</Note>}
        {list.data?.map((c) => (
          <Card key={c.id}>
            {editing?.id === c.id ? (
              <>
                <Input label="Category name" value={editing.name} onChangeText={(x) => setEditing({ ...editing, name: x })} maxLength={80} autoFocus />
                {rename.error && <Alert>{errorText(rename.error)}</Alert>}
                <ButtonRow>
                  <SmallButton icon="save-outline" title="Save name" busy={rename.isPending} disabled={editing.name.trim().length < 2} onPress={() => rename.mutate(editing)} />
                  <SmallButton title="Cancel" onPress={() => { rename.reset(); setEditing(null); }} />
                </ButtonRow>
              </>
            ) : deleting === c.id ? (
              <Confirm question={`Delete “${c.name}”?`} detail="This can’t be undone." yes="Yes, delete it" no="No, keep it" busy={del.isPending} error={del.error}
                onYes={() => del.mutate({ id: c.id })} onNo={() => { del.reset(); setDeleting(null); }} />
            ) : (
              <>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Text style={{ flex: 1, fontSize: 16, fontWeight: '700', color: C.ink }}>{c.name}</Text>
                  <Note>{`${c._count.products} product${c._count.products === 1 ? '' : 's'}`}</Note>
                </View>
                <ButtonRow>
                  <SmallButton icon="create-outline" title="Rename" label={`Rename ${c.name}`} onPress={() => { clear(); setDeleting(null); setEditing({ id: c.id, name: c.name }); }} />
                  {c._count.products === 0 && <SmallButton icon="trash-outline" title="Delete" label={`Delete ${c.name}`} onPress={() => { clear(); setEditing(null); setDeleting(c.id); }} />}
                </ButtonRow>
              </>
            )}
          </Card>
        ))}
      </Screen>
    </OwnerOnly>
  );
}
