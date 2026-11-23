import type { Metadata } from 'next';
import Link from 'next/link';
import { publicApi } from '@/lib/public-api';

export const metadata: Metadata = { title: 'About us', description: 'Kush Enterprise supplies intraocular lenses, ophthalmic surgical instruments and consumables to hospitals, eye clinics and surgeons.' };

export default async function About() {
  const c = await (await publicApi()).website.company();
  return (
    <div className="mx-auto max-w-3xl px-4 py-12">
      <h1 className="text-3xl font-semibold text-navy">About {c.name}</h1>
      <div className="mt-6 space-y-4 leading-relaxed text-ink/85">
        <p>{c.name} supplies intraocular lenses, ophthalmic surgical instruments and surgical consumables to hospitals, eye clinics and individual surgeons.</p>
        <p>We keep a wide range of lens powers in stock, store every batch with its expiry date, and record the serial number of each lens on the invoice. That means you always know exactly which lens went to which patient, and a manufacturer recall can be answered in minutes.</p>
        <p>Registered customers order online or through our app at their own agreed rates, add the surgery date, and follow the order until it is delivered. GST invoices, statements and payment history are always one click away.</p>
      </div>
      <h2 className="mt-10 text-xl font-semibold text-navy">Registrations</h2>
      <dl className="mt-4 divide-y divide-line rounded-2xl border border-line text-sm">
        <div className="grid grid-cols-[180px_1fr] gap-4 px-4 py-3"><dt className="text-muted">GSTIN</dt><dd>{c.gstin ?? 'Available on request'}</dd></div>
        <div className="grid grid-cols-[180px_1fr] gap-4 px-4 py-3"><dt className="text-muted">Drug licence</dt><dd>{c.drugLicenceNo ?? 'Available on request'}</dd></div>
        {c.addressLines.length > 0 && <div className="grid grid-cols-[180px_1fr] gap-4 px-4 py-3"><dt className="text-muted">Address</dt><dd>{c.addressLines.join(', ')}{c.state ? `, ${c.state}` : ''}</dd></div>}
      </dl>
      <div className="mt-10 flex flex-wrap gap-3">
        <Link href="/products" className="inline-flex h-11 items-center rounded-lg bg-teal-700 px-5 font-semibold text-white hover:bg-teal-800">See our products</Link>
        <Link href="/contact" className="inline-flex h-11 items-center rounded-lg border border-line px-5 font-semibold text-navy hover:bg-aqua-50">Contact us</Link>
      </div>
    </div>
  );
}
