import type { Metadata, Viewport } from 'next';
import './globals.css';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Gestion Eric',
  description: 'Tri intelligent des messages WhatsApp',
  manifest: '/manifest.json',
  appleWebApp: { capable: true, statusBarStyle: 'default', title: 'Gestion Eric' },
};

export const viewport: Viewport = {
  themeColor: '#0f172a',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body className="min-h-dvh">
        <div className="mx-auto max-w-2xl pb-24">
          <header className="sticky top-0 z-10 bg-slate-50/90 dark:bg-slate-950/90 backdrop-blur border-b border-slate-200 dark:border-slate-800">
            <div className="flex items-center justify-between px-4 py-3">
              <Link href="/" className="font-semibold text-lg">
                Gestion Eric
              </Link>
              <Link
                href="/setup"
                className="text-xs text-slate-500 hover:text-slate-900 dark:hover:text-slate-100"
              >
                Connexion WhatsApp
              </Link>
            </div>
          </header>
          <main className="px-4 py-4">{children}</main>
        </div>
        <nav className="fixed bottom-0 inset-x-0 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
          <div className="mx-auto max-w-2xl grid grid-cols-3 text-center text-sm">
            <Link href="/" className="py-3 hover:bg-slate-100 dark:hover:bg-slate-800">
              Inbox
            </Link>
            <Link
              href="/calendar"
              className="py-3 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              Agenda
            </Link>
            <Link
              href="/categories"
              className="py-3 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              Catégories
            </Link>
          </div>
        </nav>
      </body>
    </html>
  );
}
