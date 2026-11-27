import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, BadgeCheck, Microscope, PackageSearch, ScanBarcode, ScissorsLineDashed, Syringe, Tag, Truck } from 'lucide-react';
import { env } from '@kush/api/server';
import { DevQuickLogin } from '@/components/common/dev-quick-login';
import { LensArt } from '@/components/site/lens-art';
import { publicApi } from '@/lib/public-api';

export const metadata: Metadata = {
  title: { absolute: 'Kush Enterprise: intraocular lenses, ophthalmic instruments & consumables' },
  description: 'Supplier of IOLs (monofocal, toric, multifocal, EDOF), ophthalmic surgical instruments and consumables to hospitals, eye clinics and surgeons, with batch and serial traceability.',
};

const SUPPLY = [
  { icon: Microscope, title: 'Intraocular lenses', text: 'Monofocal, toric, multifocal and extended depth of focus IOLs, foldable and preloaded, across the full power range.', match: /iol|lens/i },
  { icon: ScissorsLineDashed, title: 'Surgical instruments', text: 'Titanium forceps, choppers, specula, injectors and complete cataract sets that last for years of sterilisation.', match: /instrument/i },
  { icon: Syringe, title: 'Consumables', text: 'Viscoelastics (OVDs), trypan blue, BSS, keratomes, crescent and side-port knives, capsular tension rings.', match: /consumable/i },
];
const TRUST = [
  { icon: BadgeCheck, title: 'Genuine stock', text: 'Sourced from the manufacturers and their authorised distributors, with full documentation.' },
  { icon: ScanBarcode, title: 'Traceable to the patient', text: 'Every lens is recorded by batch, expiry and serial number on your invoice, so a recall is a two-minute check.' },
  { icon: Truck, title: 'Planned around surgery dates', text: 'Tell us the OT date when you order; it is on the order the team packs from.' },
  { icon: Tag, title: 'Your own rates, online', text: 'Registered customers see their agreed prices, order in a few taps and track every order.' },
];

export default async function Home() {
  const api = await publicApi();
  const f = await api.website.filters();
  const catLink = (re: RegExp) => { const c = f.categories.find((x) => re.test(x.name)); return c ? `/products?category=${c.id}` : '/products'; };
  return (
    <>
      <section className="relative overflow-hidden bg-gradient-to-b from-aqua-50 via-white to-white">
        <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-16 sm:py-24 lg:grid-cols-[1.1fr_0.9fr]">
          <div>
            <p className="mb-4 inline-flex items-center gap-2 rounded-full bg-white px-3 py-1 text-xs font-semibold text-teal-700 ring-1 ring-aqua">Ophthalmic supplies for hospitals, clinics &amp; surgeons</p>
            <h1 className="text-4xl font-semibold leading-tight tracking-tight text-navy sm:text-5xl">Lenses, instruments and consumables for every cataract list.</h1>
            <p className="mt-5 max-w-xl text-lg text-muted">Kush Enterprise supplies intraocular lenses, ophthalmic surgical instruments and consumables, delivered with batch and serial traceability you can rely on.</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/products" className="inline-flex h-12 items-center gap-2 rounded-lg bg-teal-700 px-5 font-semibold text-white hover:bg-teal-800">Browse products <ArrowRight className="size-4" aria-hidden /></Link>
              <Link href="/contact" className="inline-flex h-12 items-center rounded-lg border border-line bg-white px-5 font-semibold text-navy hover:bg-aqua-50">Send an enquiry</Link>
            </div>
            <p className="mt-4 text-sm text-muted">Already a customer? <Link href="/login" className="font-semibold text-teal-700 hover:underline">Log in to see your price</Link>.</p>
          </div>
          {env.devQuickLogin ? <DevQuickLogin className="mx-auto w-full max-w-sm" /> : <LensArt className="mx-auto w-full max-w-sm" />}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-16">
        <h2 className="text-2xl font-semibold text-navy sm:text-3xl">What we supply</h2>
        <div className="mt-8 grid gap-5 md:grid-cols-3">
          {SUPPLY.map((s) => (
            <Link key={s.title} href={catLink(s.match)} className="group rounded-2xl border border-line bg-white p-6 transition hover:border-teal hover:shadow-sm">
              <span className="grid size-11 place-items-center rounded-xl bg-aqua-100 text-teal-700"><s.icon className="size-5" aria-hidden /></span>
              <h3 className="mt-4 text-lg font-semibold text-navy">{s.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted">{s.text}</p>
              <span className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-teal-700">View range <ArrowRight className="size-4 transition group-hover:translate-x-0.5" aria-hidden /></span>
            </Link>
          ))}
        </div>
      </section>

      <section className="bg-canvas">
        <div className="mx-auto max-w-6xl px-4 py-16">
          <h2 className="text-2xl font-semibold text-navy sm:text-3xl">Why surgeons and hospitals order from us</h2>
          <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {TRUST.map((t) => (
              <div key={t.title}>
                <t.icon className="size-6 text-teal-700" aria-hidden />
                <h3 className="mt-3 font-semibold text-navy">{t.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-muted">{t.text}</p>
              </div>
            ))}
          </div>
          {f.brands.length > 0 && (
            <div className="mt-12">
              <p className="text-sm font-semibold uppercase tracking-wide text-muted">Brands we carry</p>
              <ul className="mt-3 flex flex-wrap gap-2">{f.brands.map((b) => <li key={b.id}><Link href={`/products?brand=${b.id}`} className="inline-flex rounded-full border border-line bg-white px-4 py-1.5 text-sm font-medium text-navy hover:border-teal">{b.name}</Link></li>)}</ul>
            </div>
          )}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-16">
        <h2 className="text-2xl font-semibold text-navy sm:text-3xl">Ordering is simple</h2>
        <ol className="mt-8 grid gap-5 md:grid-cols-3">
          {[
            ['Ask for an account', 'Send an enquiry with your hospital or clinic details. We set up your account and agreed rates.'],
            ['Order at your rates', 'Log in on the website or the Kush Enterprise app, pick lenses by power, add the surgery date and place the order.'],
            ['Track until delivered', 'See every step from confirmed to delivered, with courier details, and download your GST invoices.'],
          ].map(([t, d], i) => (
            <li key={t} className="rounded-2xl border border-line p-6">
              <span className="grid size-9 place-items-center rounded-full bg-navy text-sm font-bold text-white">{i + 1}</span>
              <h3 className="mt-4 font-semibold text-navy">{t}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-muted">{d}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="bg-navy">
        <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-6 px-4 py-12 md:flex-row md:items-center">
          <div>
            <h2 className="text-2xl font-semibold text-white">Need a lens power or a quote?</h2>
            <p className="mt-1 text-white/70">Tell us what you need and we will call you back.</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link href="/contact" className="inline-flex h-12 items-center gap-2 rounded-lg bg-white px-5 font-semibold text-navy hover:bg-aqua-50"><PackageSearch className="size-4" aria-hidden /> Send an enquiry</Link>
            <Link href="/login" className="inline-flex h-12 items-center rounded-lg border border-white/30 px-5 font-semibold text-white hover:bg-white/10">Customer login</Link>
          </div>
        </div>
      </section>
    </>
  );
}
