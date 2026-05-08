'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  Calendar,
  Users,
  Scissors,
  Package,
  Receipt,
  Settings,
  ExternalLink,
} from 'lucide-react';

const NAV = [
  { href: '/admin', label: 'Tableau de bord', icon: LayoutDashboard, exact: true },
  { href: '/admin/agenda', label: 'Agenda', icon: Calendar },
  { href: '/admin/clients', label: 'Clients', icon: Users },
  { href: '/admin/services', label: 'Services', icon: Scissors },
  { href: '/admin/stock', label: 'Stock', icon: Package },
  { href: '/admin/ventes', label: 'Ventes', icon: Receipt },
  { href: '/admin/parametres', label: 'Paramètres', icon: Settings },
];

export function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="md:flex md:min-h-dvh">
      <aside className="hidden md:flex md:w-64 md:flex-col md:border-r md:border-[rgb(var(--border))] md:px-3 md:py-4">
        <Link href="/admin" className="flex items-center gap-2.5 px-3 py-2">
          <div
            className="grid h-9 w-9 place-items-center rounded-xl text-white"
            style={{
              background: 'linear-gradient(135deg, #c8932a, #d6a937)',
              boxShadow:
                'inset 0 1px 0 rgba(255,245,200,0.4), 0 6px 16px -4px rgba(196,147,42,0.45)',
            }}
          >
            <span className="font-display text-lg font-semibold">S</span>
          </div>
          <div className="leading-tight">
            <div className="font-display text-lg font-semibold">Salon</div>
            <div className="text-[10px] text-muted -mt-0.5">Admin</div>
          </div>
        </Link>

        <nav className="mt-6 space-y-1">
          {NAV.map(({ href, label, icon: Icon, exact }) => {
            const active = exact ? pathname === href : pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                className={`group relative flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm transition-all ${
                  active
                    ? 'text-[rgb(var(--primary-fg))] font-medium'
                    : 'text-muted hover:text-[rgb(var(--fg))] hover:bg-[rgb(var(--surface-2))]'
                }`}
              >
                {active && (
                  <span
                    className="absolute inset-0 rounded-xl"
                    style={{
                      background: 'linear-gradient(135deg, #c8932a, #d6a937)',
                      boxShadow:
                        'inset 0 1px 0 rgba(255,245,200,0.4), 0 6px 16px -4px rgba(196,147,42,0.45)',
                    }}
                  />
                )}
                <Icon className="relative h-4 w-4" />
                <span className="relative">{label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="mt-auto px-3 pt-4">
          <Link
            href="/"
            className="flex items-center gap-2 rounded-xl px-3 py-2 text-xs text-muted hover:text-[rgb(var(--fg))] hover:bg-[rgb(var(--surface-2))]"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            Voir le site public
          </Link>
        </div>
      </aside>

      <div className="flex min-h-dvh flex-1 flex-col">
        <header className="md:hidden sticky top-0 z-30 glass border-b border-[rgb(var(--border))]">
          <div className="flex items-center gap-3 px-4 py-3">
            <Link href="/admin" className="flex items-center gap-2">
              <div
                className="grid h-8 w-8 place-items-center rounded-lg text-white"
                style={{ background: 'linear-gradient(135deg, #c8932a, #d6a937)' }}
              >
                <span className="font-display text-base font-semibold">S</span>
              </div>
              <div className="font-display text-base font-semibold">Salon · Admin</div>
            </Link>
          </div>
        </header>

        <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 pb-24 md:pb-8">
          {children}
        </main>

        <nav className="md:hidden fixed bottom-0 inset-x-0 z-30 glass border-t border-[rgb(var(--border))]">
          <div className="grid grid-cols-5">
            {NAV.slice(0, 5).map(({ href, label, icon: Icon, exact }) => {
              const active = exact ? pathname === href : pathname.startsWith(href);
              return (
                <Link
                  key={href}
                  href={href}
                  className={`flex flex-col items-center gap-0.5 py-2.5 text-[10px] transition-colors ${
                    active ? 'text-[rgb(var(--primary))]' : 'text-muted'
                  }`}
                >
                  <Icon className="h-5 w-5" />
                  <span className="truncate">{label}</span>
                </Link>
              );
            })}
          </div>
        </nav>
      </div>
    </div>
  );
}
