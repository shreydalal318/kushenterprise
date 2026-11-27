import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, Lock, MessageSquare } from 'lucide-react';
import { fmtPower, LENS_TYPE_LABEL } from '@/components/site/bits';
import { publicApi, siteUrl } from '@/lib/public-api';

async function load(code: string) {
  try { return await (await publicApi()).website.product({ code: decodeURIComponent(code) }); } catch { return null; }
}

export async function generateMetadata({ params }: { params: Promise<{ code: string }> }): Promise<Metadata> {
  const p = await load((await params).code);
  if (!p) return { title: 'Product not found' };
  const desc = p.description ?? `${p.name}${p.lensType ? `, ${LENS_TYPE_LABEL[p.lensType]} IOL` : ''}${p.powers.length ? `, powers ${fmtPower(p.powers[0]!)} to ${fmtPower(p.powers.at(-1)!)} D` : ''}. Available from Kush Enterprise.`;
  return { title: p.name, description: desc, openGraph: { title: p.name, description: desc, images: p.images[0] ? [`/api/files/${p.images[0]}`] : undefined } };
}

/** Group consecutive powers into ranges: +10.00 to +30.00 (0.50 D steps). */
function ranges(powers: number[]) {
  if (powers.length < 3) return powers.map(fmtPower).join(', ');
  const out: string[] = [];
  let start = 0;
  for (let i = 1; i <= powers.length; i++) {
    const step = powers[start + 1]! - powers[start]!;
    if (i === powers.length || Math.abs(powers[i]! - powers[i - 1]! - step) > 0.001 || i - start > 200) {
      out.push(i - start >= 3 ? `${fmtPower(powers[start]!)} to ${fmtPower(powers[i - 1]!)} D in ${step.toFixed(2)} D steps` : powers.slice(start, i).map(fmtPower).join(', '));
      start = i;
    }
  }
  return out.join('; ');
}

export default async function ProductPage({ params }: { params: Promise<{ code: string }> }) {
  const p = await load((await params).code);
  if (!p) notFound();
  const attrs = [
    ['Category', p.category], ['Brand', p.brand], ['Lens type', p.lensType && LENS_TYPE_LABEL[p.lensType]], ['Material', p.material],
    ['A-constant', p.aConstant], ['Optic diameter', p.opticSizeMm && `${p.opticSizeMm} mm`], ['Overall length', p.overallLenMm && `${p.overallLenMm} mm`],
    ['Preloaded', p.preloaded == null ? null : p.preloaded ? 'Yes' : 'No'], ['Powers available', p.powers.length ? ranges(p.powers) : null],
    ['Cylinder options', p.cylinders.length ? p.cylinders.map((c) => `${c.toFixed(2)} D`).join(', ') : null], ['Add power', p.addPowers.length ? p.addPowers.map((a) => `+${a.toFixed(2)} D`).join(', ') : null],
  ].filter(([, v]) => v != null && v !== '');
  const jsonLd = { '@context': 'https://schema.org', '@type': 'Product', name: p.name, sku: p.code, category: p.category, ...(p.brand ? { brand: { '@type': 'Brand', name: p.brand } } : {}), ...(p.description ? { description: p.description } : {}), ...(p.images[0] ? { image: `${siteUrl()}/api/files/${p.images[0]}` } : {}) };
  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }} />
      <Link href="/products" className="inline-flex items-center gap-1 text-sm text-teal-700 hover:underline"><ArrowLeft className="size-4" aria-hidden /> All products</Link>
      <div className="mt-6 max-w-3xl">
        <div>
          <p className="text-sm text-muted">{[p.brand, p.category, p.code].filter(Boolean).join(' · ')}</p>
          <h1 className="mt-1 text-3xl font-semibold leading-tight text-navy">{p.name}</h1>
          {p.description && <p className="mt-4 leading-relaxed text-ink/80">{p.description}</p>}
          <div className="mt-6 flex flex-wrap gap-3">
            <Link href={`/contact?product=${encodeURIComponent(p.code)}`} className="inline-flex h-12 items-center gap-2 rounded-lg bg-teal-700 px-5 font-semibold text-white hover:bg-teal-800"><MessageSquare className="size-4" aria-hidden /> Enquire</Link>
            <Link href={`/login?next=${encodeURIComponent(`/portal/products/${p.id}`)}`} className="inline-flex h-12 items-center gap-2 rounded-lg border border-line px-5 font-semibold text-navy hover:bg-aqua-50"><Lock className="size-4" aria-hidden /> Login to order</Link>
          </div>
          <dl className="mt-8 divide-y divide-line rounded-2xl border border-line">
            {attrs.map(([k, v]) => <div key={k as string} className="grid grid-cols-[150px_1fr] gap-4 px-4 py-3 text-sm"><dt className="text-muted">{k}</dt><dd className="text-ink">{v}</dd></div>)}
          </dl>
          <p className="mt-4 text-xs text-muted">Information for healthcare professionals. Please refer to the manufacturer&apos;s instructions for use.</p>
        </div>
      </div>
    </div>
  );
}
