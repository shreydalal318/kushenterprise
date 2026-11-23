'use client';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';
import { errorMessage } from '@/lib/errors';
import { trpc } from '@/lib/trpc';
import { useMe } from '@/lib/use-me';
import { VariantPicker } from './variant-picker';

/** "Map this unknown barcode to a product once": GTINs are saved on the variant, others as aliases. */
export function MapBarcodeDialog({ code, onClose, onMapped }: { code: string; onClose: () => void; onMapped: () => void }) {
  const { can } = useMe();
  const map = trpc.scan.mapAlias.useMutation({ onSuccess: onMapped });
  return (
    <Dialog open onClose={onClose} title="Unknown barcode" description={<span className="font-mono">{code.replace(/\x1d/g, '⟨GS⟩')}</span>} size="lg"
      footer={<Button variant="secondary" onClick={onClose}>Close</Button>}>
      {can('MANAGE_PRODUCTS') ? (
        <div className="flex flex-col gap-3">
          <p className="text-sm">Which item is this? From now on this barcode will be recognised everywhere.</p>
          <VariantPicker buttonLabel="Link barcode" onPick={(v) => map.mutate({ code, variantId: v.variantId })} />
          {map.error && <Alert>{errorMessage(map.error)}</Alert>}
        </div>
      ) : (
        <p className="text-sm text-muted">This code isn&apos;t linked to a product yet. Ask someone who manages products to link it.</p>
      )}
    </Dialog>
  );
}
