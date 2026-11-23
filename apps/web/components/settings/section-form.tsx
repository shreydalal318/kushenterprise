'use client';
import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Alert, Card, CardBody, CardHeader } from '@/components/ui/card';
import { errorMessage, fieldErrors } from '@/lib/errors';

/** Local form state for one settings card, reset whenever fresh server data arrives. */
export function useFormState<T extends object>(initial: T | undefined) {
  const [values, setValues] = useState<T | undefined>(initial);
  const [dirty, setDirty] = useState(false);
  const key = JSON.stringify(initial);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { setValues(initial); setDirty(false); }, [key]);
  const set = <K extends keyof T>(k: K, v: T[K]) => {
    setValues((prev) => (prev ? { ...prev, [k]: v } : prev));
    setDirty(true);
  };
  return { values, set, dirty, setDirty };
}

interface Props {
  title: string;
  description?: ReactNode;
  onSubmit: () => void;
  saving: boolean;
  saved: boolean;
  dirty: boolean;
  error: unknown;
  children: ReactNode;
}

export function SectionForm({ title, description, onSubmit, saving, saved, dirty, error, children }: Props) {
  const fe = fieldErrors(error);
  const msg = errorMessage(error);
  return (
    <Card>
      <form onSubmit={(e: FormEvent) => { e.preventDefault(); onSubmit(); }} noValidate>
        <CardHeader title={title} description={description} />
        <CardBody className="flex flex-col gap-4">
          {children}
          {msg && Object.keys(fe).length === 0 && <Alert>{msg}</Alert>}
          {msg && Object.keys(fe).length > 0 && <Alert>Please correct the highlighted fields.</Alert>}
        </CardBody>
        <div className="flex items-center justify-end gap-3 border-t border-line px-5 py-3">
          {saved && !dirty && <span className="flex items-center gap-1 text-sm text-ok"><Check className="size-4" aria-hidden /> Saved</span>}
          <Button type="submit" loading={saving} disabled={!dirty}>Save changes</Button>
        </div>
      </form>
    </Card>
  );
}
