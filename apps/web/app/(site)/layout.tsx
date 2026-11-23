import Link from 'next/link';
import { Mail, MapPin, Phone } from 'lucide-react';
import { publicApi } from '@/lib/public-api';
import { SiteNav } from '@/components/site/site-nav';

export const dynamic = 'force-dynamic';

export default async function SiteLayout({ children }: { children: React.ReactNode }) {
  const c = await (await publicApi()).website.company();
  return (
    <div className="flex min-h-dvh flex-col bg-white">
      <header className="sticky top-0 z-30 border-b border-line/80 bg-white/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4">
          <Link href="/" aria-label="Kush Enterprise home">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/logo-primary.png" alt="Kush Enterprise" className="h-8 w-auto" />
          </Link>
          <SiteNav />
        </div>
      </header>
      <main className="flex-1">{children}</main>
      <footer className="border-t border-line bg-navy text-white/80">
        <div className="mx-auto grid max-w-6xl gap-8 px-4 py-12 sm:grid-cols-2 lg:grid-cols-4">
          <div className="lg:col-span-2">
            <p className="text-lg font-semibold text-white">{c.name}</p>
            <p className="mt-2 max-w-sm text-sm">Intraocular lenses, ophthalmic surgical instruments and consumables for hospitals, eye clinics and surgeons.</p>
            {(c.gstin || c.drugLicenceNo) && <p className="mt-4 text-xs text-white/60">{c.gstin && <>GSTIN {c.gstin}</>}{c.gstin && c.drugLicenceNo && ' · '}{c.drugLicenceNo && <>Drug licence {c.drugLicenceNo}</>}</p>}
          </div>
          <div>
            <p className="text-sm font-semibold text-white">Explore</p>
            <ul className="mt-3 flex flex-col gap-2 text-sm">
              <li><Link className="hover:text-white" href="/products">Products</Link></li>
              <li><Link className="hover:text-white" href="/about">About us</Link></li>
              <li><Link className="hover:text-white" href="/contact">Contact &amp; enquiry</Link></li>
              <li><Link className="hover:text-white" href="/login">Customer login</Link></li>
            </ul>
          </div>
          <div>
            <p className="text-sm font-semibold text-white">Reach us</p>
            <ul className="mt-3 flex flex-col gap-2 text-sm">
              {c.addressLines.length > 0 && <li className="flex gap-2"><MapPin className="mt-0.5 size-4 shrink-0" aria-hidden /><span>{c.addressLines.join(', ')}{c.state ? `, ${c.state}` : ''}</span></li>}
              {c.phone && <li className="flex gap-2"><Phone className="mt-0.5 size-4 shrink-0" aria-hidden /><a className="hover:text-white" href={`tel:${c.phone.replace(/\s/g, '')}`}>{c.phone}</a></li>}
              {c.email && <li className="flex gap-2"><Mail className="mt-0.5 size-4 shrink-0" aria-hidden /><a className="hover:text-white" href={`mailto:${c.email}`}>{c.email}</a></li>}
              {!c.addressLines.length && !c.phone && !c.email && <li><Link className="hover:text-white" href="/contact">Send us an enquiry →</Link></li>}
            </ul>
          </div>
        </div>
        <div className="border-t border-white/10 py-4 text-center text-xs text-white/50">© {new Date().getFullYear()} {c.name}. Product information is for healthcare professionals.</div>
      </footer>
    </div>
  );
}
