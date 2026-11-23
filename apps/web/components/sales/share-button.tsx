'use client';
import { useState } from 'react';
import { Copy, Mail, MessageCircle, Share2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';
import { errorMessage } from '@/lib/errors';
import { trpc } from '@/lib/trpc';

type Kind = 'invoice' | 'proforma' | 'credit-note' | 'purchase-order' | 'statement';

/** Share a PDF on WhatsApp or by email with a signed link (valid 15 days); no login needed to open it. */
export function ShareButton({ kind, id, label = 'Share' }: { kind: Kind; id: string; label?: string }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const m = trpc.integrations.shareLink.useMutation();
  const d = m.data;
  const message = d ? `${d.title} from Kush Enterprise:\n${d.url}\n(Link valid for ${d.expiresInDays} days)` : '';
  const wa = d ? `https://wa.me/${(d.contact?.mobile ?? '').replace(/\D/g, '')}?text=${encodeURIComponent(message)}` : '#';
  const mail = d ? `mailto:${d.contact?.email ?? ''}?subject=${encodeURIComponent(d.title)}&body=${encodeURIComponent(`Dear ${d.contact?.name ?? 'Sir/Madam'},\n\nPlease find ${d.title} here:\n${d.url}\n\nThe link is valid for ${d.expiresInDays} days.\n\nRegards,\nKush Enterprise`)}` : '#';
  return (
    <>
      <Button variant="secondary" onClick={() => { setOpen(true); setCopied(false); m.mutate({ kind, id }); }}><Share2 className="size-4" aria-hidden /> {label}</Button>
      {open && (
        <Dialog open onClose={() => setOpen(false)} title={d?.title ?? 'Share'} description="Anyone with this link can open this one PDF for 15 days." size="sm"
          footer={<Button variant="secondary" onClick={() => setOpen(false)}>Done</Button>}>
          {m.error && <Alert>{errorMessage(m.error)}</Alert>}
          {!d && !m.error && <p className="text-sm text-muted">Creating link…</p>}
          {d && (
            <div className="flex flex-col gap-3">
              <div className="flex gap-2">
                <input readOnly aria-label="Share link" value={d.url} className="h-10 min-w-0 flex-1 rounded-lg border border-line bg-canvas px-3 font-mono text-xs" onFocus={(e) => e.target.select()} />
                <Button variant="secondary" onClick={() => void navigator.clipboard?.writeText(d.url).then(() => setCopied(true))}><Copy className="size-4" aria-hidden /> {copied ? 'Copied' : 'Copy'}</Button>
              </div>
              <a href={wa} target="_blank" rel="noreferrer" className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-[#1f7a4d] px-4 font-semibold text-white hover:brightness-110"><MessageCircle className="size-4" aria-hidden /> WhatsApp{d.contact?.mobile ? ` ${d.contact.mobile}` : ''}</a>
              <a href={mail} className="inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-line px-4 font-semibold text-navy hover:bg-aqua-50"><Mail className="size-4" aria-hidden /> Email{d.contact?.email ? ` ${d.contact.email}` : ''}</a>
              {!d.contact?.mobile && <p className="text-xs text-muted">No mobile number saved for {d.contact?.name ?? 'this contact'}: WhatsApp will ask you to pick a chat.</p>}
            </div>
          )}
        </Dialog>
      )}
    </>
  );
}
