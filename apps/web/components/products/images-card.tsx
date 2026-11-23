'use client';
import { useRef, useState } from 'react';
import { ImagePlus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { errorMessage } from '@/lib/errors';
import { trpc } from '@/lib/trpc';

export function ImagesCard({ productId, imageIds, editable }: { productId: string; imageIds: string[]; editable: boolean }) {
  const utils = trpc.useUtils();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const setImages = trpc.products.setImages.useMutation({ onSuccess: () => utils.products.get.invalidate({ id: productId }) });

  async function upload(files: FileList) {
    setBusy(true); setError(null);
    const ids = [...imageIds];
    for (const f of [...files].slice(0, 12 - ids.length)) {
      const body = new FormData();
      body.append('file', f);
      const res = await fetch('/api/products/images', { method: 'POST', body });
      const json = (await res.json().catch(() => ({}))) as { fileId?: string; error?: string };
      if (!res.ok || !json.fileId) { setError(json.error ?? 'Upload failed'); break; }
      ids.push(json.fileId);
    }
    if (ids.length !== imageIds.length) await setImages.mutateAsync({ id: productId, imageIds: ids });
    setBusy(false);
  }

  return (
    <Card>
      <CardHeader title="Images" description="Shown in the catalogue and customer app. PNG, JPG or WebP up to 2 MB each." actions={editable && (
        <>
          <input ref={input} type="file" multiple accept="image/png,image/jpeg,image/webp" className="sr-only" aria-label="Product images" onChange={(e) => { if (e.target.files?.length) void upload(e.target.files); e.target.value = ''; }} />
          <Button size="sm" variant="secondary" loading={busy} onClick={() => input.current?.click()}><ImagePlus className="size-4" aria-hidden /> Add images</Button>
        </>
      )} />
      <CardBody>
        {imageIds.length === 0 ? <p className="text-sm text-muted">No images yet.</p> : (
          <ul className="flex flex-wrap gap-3">
            {imageIds.map((id) => (
              <li key={id} className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`/api/files/${id}`} alt="" className="size-28 rounded-lg border border-line object-contain" />
                {editable && <button aria-label="Remove image" className="absolute -right-2 -top-2 rounded-full border border-line bg-white p-1 shadow-sm hover:text-danger" onClick={() => setImages.mutate({ id: productId, imageIds: imageIds.filter((x) => x !== id) })}><X className="size-3.5" /></button>}
              </li>
            ))}
          </ul>
        )}
        {(error || setImages.error) && <p className="mt-2 text-sm text-danger">{error ?? errorMessage(setImages.error)}</p>}
      </CardBody>
    </Card>
  );
}
