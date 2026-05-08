'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  Calendar,
  Users,
  Package,
  Receipt,
  Wallet,
  Tags,
  Settings,
  ExternalLink,
  Layers,
  LogOut,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { Wordmark } from '@/components/Wordmark';

type LucideIcon = typeof Calendar;

type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  exact?: boolean;
};

const NAV_ACTIVITY: NavItem[] = [
  { href: '/admin', label: 'Tableau de bord', icon: LayoutDashboard, exact: true },
  { href: '/admin/agenda', label: 'Agenda', icon: Calendar },
  { href: '/admin/ventes', label: 'Ventes', icon: Receipt },
];

const NAV_RELATIONS: NavItem[] = [
  { href: '/admin/clients', label: 'Clients', icon: Users },
  { href: '/admin/journey', label: 'Parcours client', icon: Layers },
];

const NAV_CATALOG: NavItem[] = [
  { href: '/admin/secteurs', label: 'Secteurs', icon: Tags },
  { href: '/admin/services', label: 'Services', icon: Calendar },
  { href: '/admin/stock', label: 'Stock', icon: Package },
];

const NAV_FINANCE: NavItem[] = [
  { href: '/admin/depenses', label: 'Dépenses', icon: Wallet },
  { href: '/admin/comptabilite', label: 'Comptabilité', icon: Receipt },
];

const SECTIONS = [
  { title: 'Activité', items: NAV_ACTIVITY },
  { title: 'Clients', items: NAV_RELATIONS },
  { title: 'Catalogue', items: NAV_CATALOG },
  { title: 'Finances', items: NAV_FINANCE },
];

const MOBILE: NavItem[] = [
  { href: '/admin', label: 'Bord', icon: LayoutDashboard, exact: true },
  { href: '/admin/agenda', label: 'Agenda', icon: Calendar },
  { href: '/admin/clients', label: 'Clients', icon: Users },
  { href: '/admin/ventes', label: 'Ventes', icon: Receipt },
  { href: '/admin/depenses', label: 'Dépenses', icon: Wallet },
];

export function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const isActive = (href: string, exact?: boolean) =>
    exact ? pathname === href : pathname.startsWith(href);

  async function logout() {
    await fetch('/api/admin/logout', { method: 'POST' });
    router.replace('/admin/login');
    router.refresh();
  }

  return (
    <div className="md:flex md:min-h-dvh">
      <aside
        className="hidden md:flex md:w-64 md:flex-col md:border-r md:px-3 md:py-6"
        style={{ borderColor: 'rgb(var(--line))' }}
      >
        <div className="px-3 pb-2">
          <Wordmark size="sm" href="/admin" />
        </div>

        <div className="mt-8 space-y-7">
          {SECTIONS.map((section) => (
            <div key={section.title}>
              <div
                className="px-3 mb-2 text-[10px] uppercase tracking-[0.24em]"
                style={{ color: 'rgb(var(--muted))' }}
              >
                {section.title}
              </div>
              <nav className="space-y-px">
                {section.items.map(({ href, label, icon: Icon, exact }) => {
                  const active = isActive(href, exact);
                  return (
                    <Link
                      key={href}
                      href={href}
                      className={`flex items-center gap-3 px-3 py-2 text-[13px] transition-colors ${
                        active
                          ? 'font-medium'
                          : 'hover:bg-[rgb(var(--surface-2))]'
                      }`}
                      style={{
                        color: active
                          ? 'rgb(var(--ink))'
                          : 'rgb(var(--ink-soft))',
                        background: active ? 'rgb(var(--surface-2))' : 'transparent',
                      }}
                    >
                      <Icon className="h-4 w-4" strokeWidth={1.5} />
                      <span>{label}</span>
                    </Link>
                  );
                })}
              </nav>
            </div>
          ))}
        </div>

        <div className="mt-auto border-t pt-4 px-3 space-y-1" style={{ borderColor: 'rgb(var(--line))' }}>
          <Link
            href="/admin/parametres"
            className="flex items-center gap-3 px-0 py-2 text-[12px] hover:opacity-100 transition-opacity"
            style={{ color: 'rgb(var(--muted))' }}
          >
            <Settings className="h-3.5 w-3.5" strokeWidth={1.5} />
            Paramètres
          </Link>
          <Link
            href="/"
            className="flex items-center gap-3 px-0 py-2 text-[12px]"
            style={{ color: 'rgb(var(--muted))' }}
          >
            <ExternalLink className="h-3.5 w-3.5" strokeWidth={1.5} />
            Voir le site
          </Link>
          <button
            onClick={logout}
            className="flex items-center gap-3 px-0 py-2 text-[12px] w-full text-left"
            style={{ color: 'rgb(var(--muted))' }}
          >
            <LogOut className="h-3.5 w-3.5" strokeWidth={1.5} />
            Déconnexion
          </button>
        </div>
      </aside>

      <div className="flex min-h-dvh flex-1 flex-col">
        {/* Mobile header */}
        <header
          className="md:hidden sticky top-0 z-30 glass border-b"
          style={{ borderColor: 'rgb(var(--line))' }}
        >
          <div className="flex items-center justify-between px-4 py-3">
            <Wordmark size="sm" href="/admin" />
            <span
              className="text-[10px] uppercase tracking-[0.24em]"
              style={{ color: 'rgb(var(--muted))' }}
            >
              Admin
            </span>
          </div>
        </header>

        <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-8 pb-28 md:pb-12">
          {children}
        </main>

        {/* Mobile bottom nav */}
        <nav
          className="md:hidden fixed bottom-0 inset-x-0 z-30 glass border-t"
          style={{ borderColor: 'rgb(var(--line))' }}
        >
          <div className="grid grid-cols-5">
            {MOBILE.map(({ href, label, icon: Icon, exact }) => {
              const active = isActive(href, exact);
              return (
                <Link
                  key={href}
                  href={href}
                  className="flex flex-col items-center gap-1 py-2.5"
                  style={{
                    color: active ? 'rgb(var(--ink))' : 'rgb(var(--muted))',
                  }}
                >
                  <Icon className="h-4 w-4" strokeWidth={1.5} />
                  <span className="text-[9px] uppercase tracking-[0.16em]">
                    {label}
                  </span>
                </Link>
              );
            })}
          </div>
        </nav>
      </div>
    </div>
  );
}
