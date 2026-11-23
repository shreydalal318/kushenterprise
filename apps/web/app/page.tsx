import Link from 'next/link';

/** Interim home page. The full public website (catalogue, about, enquiry form) ships in Phase 8. */
export default function Home() {
  return (
    <main className="flex min-h-dvh flex-col">
      <header className="border-b border-line bg-white">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/logo-primary.png" alt="Kush Enterprise" className="h-8 w-auto" />
          <Link href="/login" className="inline-flex h-10 items-center rounded-lg bg-teal-700 px-4 text-sm font-semibold text-white hover:bg-teal-800">Customer login</Link>
        </div>
      </header>
      <section className="flex-1 bg-gradient-to-b from-aqua-50 to-white">
        <div className="mx-auto max-w-6xl px-4 py-20 sm:py-28">
          <h1 className="max-w-2xl text-4xl font-semibold tracking-tight text-navy sm:text-5xl">Ophthalmic lenses &amp; surgical instruments, delivered with full traceability.</h1>
          <p className="mt-5 max-w-xl text-lg text-muted">Kush Enterprise supplies intraocular lenses, ophthalmic instruments and consumables to hospitals, clinics and doctors.</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/login" className="inline-flex h-12 items-center rounded-lg bg-teal-700 px-5 font-semibold text-white hover:bg-teal-800">Login to see your price</Link>
          </div>
        </div>
      </section>
      <footer className="border-t border-line bg-white py-6 text-center text-xs text-muted">© {new Date().getFullYear()} Kush Enterprise</footer>
    </main>
  );
}
