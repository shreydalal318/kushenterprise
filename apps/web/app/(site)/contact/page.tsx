import type { Metadata } from 'next';
import { Mail, MapPin, MessageCircle, Phone } from 'lucide-react';
import { EnquiryForm } from '@/components/site/enquiry-form';
import { publicApi } from '@/lib/public-api';

export const metadata: Metadata = { title: 'Contact & enquiry', description: 'Ask about lens powers, instruments, consumables or a customer account. We will call you back.' };

export default async function Contact({ searchParams }: { searchParams: Promise<{ product?: string }> }) {
  const { product } = await searchParams;
  const api = await publicApi();
  const c = await api.website.company();
  const p = product ? await api.website.product({ code: product }).catch(() => null) : null;
  const wa = c.phone ? c.phone.replace(/\D/g, '').replace(/^0/, '').replace(/^(\d{10})$/, '91$1') : null;
  const maps = c.addressLines.length ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([...c.addressLines, c.state].filter(Boolean).join(', '))}` : null;
  return (
    <div className="mx-auto grid max-w-6xl gap-10 px-4 py-12 lg:grid-cols-[1fr_360px]">
      <div>
        <h1 className="text-3xl font-semibold text-navy">Contact &amp; enquiry</h1>
        <p className="mt-2 text-muted">Ask about a lens power, a quote, or opening a customer account. We will call you back.</p>
        <div className="mt-8"><EnquiryForm product={p ? { id: p.id, code: p.code, name: p.name } : null} /></div>
      </div>
      <aside className="flex flex-col gap-4">
        <div className="rounded-2xl border border-line p-5">
          <p className="font-semibold text-navy">{c.name}</p>
          <ul className="mt-3 flex flex-col gap-3 text-sm">
            {c.addressLines.length > 0 && <li className="flex gap-2"><MapPin className="mt-0.5 size-4 shrink-0 text-teal-700" aria-hidden /><span>{c.addressLines.join(', ')}{c.state ? `, ${c.state}` : ''}{maps && <><br /><a href={maps} target="_blank" rel="noreferrer" className="text-teal-700 hover:underline">Open in Google Maps</a></>}</span></li>}
            {c.phone && <li className="flex gap-2"><Phone className="mt-0.5 size-4 shrink-0 text-teal-700" aria-hidden /><a href={`tel:${c.phone.replace(/\s/g, '')}`} className="hover:underline">{c.phone}</a></li>}
            {wa && <li className="flex gap-2"><MessageCircle className="mt-0.5 size-4 shrink-0 text-teal-700" aria-hidden /><a href={`https://wa.me/${wa}`} target="_blank" rel="noreferrer" className="hover:underline">Chat on WhatsApp</a></li>}
            {c.email && <li className="flex gap-2"><Mail className="mt-0.5 size-4 shrink-0 text-teal-700" aria-hidden /><a href={`mailto:${c.email}`} className="hover:underline">{c.email}</a></li>}
            {!c.addressLines.length && !c.phone && !c.email && <li className="text-muted">Use the form and we will get back to you.</li>}
          </ul>
        </div>
        <div className="rounded-2xl bg-aqua-50 p-5 text-sm text-navy">Already a customer? <a href="/login" className="font-semibold underline">Log in</a> to order at your rates and track deliveries.</div>
      </aside>
    </div>
  );
}
