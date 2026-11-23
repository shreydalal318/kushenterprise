import '@fontsource-variable/inter';
import './globals.css';
import type { Metadata, Viewport } from 'next';
import { Providers } from '@/lib/providers';

export const metadata: Metadata = {
  title: { default: 'Kush Enterprise', template: '%s · Kush Enterprise' },
  description: 'Ophthalmic lenses (IOLs) and medical instruments for hospitals, clinics and doctors.',
  applicationName: 'Kush Enterprise',
};

export const viewport: Viewport = { themeColor: '#1b3a5c', width: 'device-width', initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-IN">
      <body className="min-h-dvh antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
