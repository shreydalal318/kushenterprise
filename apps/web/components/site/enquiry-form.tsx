'use client';
import { useState } from 'react';
import { usePathname } from 'next/navigation';
import { CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/card';
import { SelectField, TextAreaField, TextField } from '@/components/ui/field';
import { errorMessage, fieldErrors } from '@/lib/errors';
import { trpc } from '@/lib/trpc';

export function EnquiryForm({ product }: { product: { id: string; code: string; name: string } | null }) {
  const path = usePathname();
  const [v, setV] = useState({ name: '', organisation: '', type: '', mobile: '', email: '', city: '', message: product ? `I would like to know about ${product.name} (${product.code}).` : '', website: '' });
  const m = trpc.website.enquire.useMutation();
  const fe = fieldErrors(m.error);
  if (m.isSuccess) return (
    <div className="rounded-2xl border border-ok/30 bg-ok-50 p-8 text-center">
      <CheckCircle2 className="mx-auto size-10 text-ok" aria-hidden />
      <p className="mt-3 text-lg font-semibold text-navy">Thank you, {v.name.split(' ')[0] || 'we have your enquiry'}.</p>
      <p className="mt-1 text-muted">Our team will call you on {v.mobile} shortly.</p>
    </div>
  );
  return (
    <form className="grid gap-4 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); m.mutate({ ...v, type: (v.type || null) as never, productIds: product ? [product.id] : [], sourcePath: path }); }}>
      <TextField label="Your name" required value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} error={fe.name} autoComplete="name" />
      <TextField label="Mobile number" required inputMode="tel" value={v.mobile} onChange={(e) => setV({ ...v, mobile: e.target.value })} error={fe.mobile} autoComplete="tel" />
      <TextField label="Hospital / clinic (optional)" value={v.organisation} onChange={(e) => setV({ ...v, organisation: e.target.value })} autoComplete="organization" />
      <SelectField label="You are a…" value={v.type} onChange={(e) => setV({ ...v, type: e.target.value })}><option value="">Select (optional)</option><option value="HOSPITAL">Hospital</option><option value="CLINIC">Eye clinic</option><option value="DOCTOR">Surgeon / doctor</option></SelectField>
      <TextField label="Email (optional)" type="email" value={v.email} onChange={(e) => setV({ ...v, email: e.target.value })} error={fe.email} autoComplete="email" />
      <TextField label="City (optional)" value={v.city} onChange={(e) => setV({ ...v, city: e.target.value })} autoComplete="address-level2" />
      <TextAreaField label="What do you need?" required rows={5} value={v.message} onChange={(e) => setV({ ...v, message: e.target.value })} error={fe.message} wrapperClassName="sm:col-span-2" />
      {/* Honeypot for bots: hidden from people and screen readers. */}
      <div aria-hidden className="absolute -left-[9999px] h-0 w-0 overflow-hidden"><label>Website<input tabIndex={-1} autoComplete="off" value={v.website} onChange={(e) => setV({ ...v, website: e.target.value })} /></label></div>
      {m.error && !Object.keys(fe).length && <div className="sm:col-span-2"><Alert>{errorMessage(m.error)}</Alert></div>}
      <div className="sm:col-span-2"><Button size="lg" type="submit" loading={m.isPending}>Send enquiry</Button><p className="mt-2 text-xs text-muted">We use your details only to reply to this enquiry.</p></div>
    </form>
  );
}
