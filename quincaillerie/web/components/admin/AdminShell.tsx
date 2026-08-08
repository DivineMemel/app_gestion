'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect } from 'react';
import {
  LayoutDashboard,
  ScanBarcode,
  Receipt,
  ShoppingBag,
  FileText,
  Users,
  Package,
  Boxes,
  Truck,
  ClipboardList,
  PackagePlus,
  ClipboardCheck,
  Wallet,
  TrendingUp,
  Settings,
  UserCog,
  ExternalLink,
  LogOut,
} from 'lucide-react';
import { Wordmark } from '@/components/Wordmark';
import { DemoBanner } from '@/components/admin/DemoBanner';
import { MemberProvider } from '@/lib/member';
import { canView, moduleForPath, ROLE_LABELS, type Role } from '@/lib/permissions';

type LucideIcon = typeof Receipt;
type NavItem = { href: string; label: string; icon: LucideIcon; exact?: boolean };

const SECTIONS: { title: string; items: NavItem[] }[] = [
  {
    title: 'Comptoir',
    items: [
      { href: '/admin', label: 'Tableau de bord', icon: LayoutDashboard, exact: true },
      { href: '/admin/caisse', label: 'Caisse', icon: ScanBarcode },
      { href: '/admin/ventes', label: 'Ventes', icon: Receipt },
      { href: '/admin/commandes', label: 'Commandes en ligne', icon: ShoppingBag },
      { href: '/admin/devis', label: 'Devis', icon: FileText },
    ],
  },
  {
    title: 'Clients',
    items: [{ href: '/admin/clients', label: 'Clients & ardoises', icon: Users }],
  },
  {
    title: 'Dépôt',
    items: [
      { href: '/admin/produits', label: 'Produits', icon: Package },
      { href: '/admin/stock', label: 'Stock', icon: Boxes },
      { href: '/admin/appro', label: 'Arrivages', icon: PackagePlus },
      { href: '/admin/inventaire', label: 'Inventaire', icon: ClipboardCheck },
      { href: '/admin/fournisseurs', label: 'Fournisseurs', icon: Truck },
      { href: '/admin/achats', label: 'Commandes fournisseur', icon: ClipboardList },
    ],
  },
  {
    title: 'Finances',
    items: [
      { href: '/admin/depenses', label: 'Dépenses', icon: Wallet },
      { href: '/admin/comptabilite', label: 'Comptabilité', icon: TrendingUp },
    ],
  },
  {
    // Réservé au patron par `canView` — la section disparaît pour les autres.
    title: 'Administration',
    items: [
      { href: '/admin/comptes', label: 'Comptes & rôles', icon: UserCog },
      { href: '/admin/parametres', label: 'Paramètres', icon: Settings },
    ],
  },
];

// Barre du bas sur mobile : les 5 gestes du quotidien, rien d'autre.
const MOBILE: NavItem[] = [
  { href: '/admin', label: 'Bord', icon: LayoutDashboard, exact: true },
  { href: '/admin/caisse', label: 'Caisse', icon: ScanBarcode },
  { href: '/admin/ventes', label: 'Ventes', icon: Receipt },
  { href: '/admin/stock', label: 'Stock', icon: Boxes },
  { href: '/admin/clients', label: 'Clients', icon: Users },
];

export function AdminShell({
  children,
  memberId,
  role,
  memberName,
  shopName,
}: {
  children: React.ReactNode;
  memberId: string;
  role: Role;
  memberName: string;
  shopName: string;
}) {
  const pathname = usePathname();
  const router = useRouter();

  const isActive = (href: string, exact?: boolean) =>
    exact ? pathname === href : pathname.startsWith(href);

  const seesHref = (href: string) => {
    const m = moduleForPath(href);
    return m ? canView(role, m) : true;
  };

  // Garde de route côté client : confort de navigation, pas sécurité — les
  // routes serveur revérifient le rôle à chaque requête.
  useEffect(() => {
    const m = moduleForPath(pathname);
    if (m && !canView(role, m)) router.replace('/admin');
  }, [pathname, role, router]);

  const sections = SECTIONS.map((s) => ({
    ...s,
    items: s.items.filter((it) => seesHref(it.href)),
  })).filter((s) => s.items.length > 0);

  const mobileItems = MOBILE.filter((it) => seesHref(it.href));

  async function logout() {
    await fetch('/api/admin/logout', { method: 'POST' });
    router.replace('/admin/login');
    router.refresh();
  }

  return (
    <div className="md:flex md:min-h-dvh">
      <aside
        className="hidden md:flex md:w-60 md:flex-col md:border-r md:px-3 md:py-5"
        style={{ borderColor: 'rgb(var(--line))' }}
      >
        <div className="px-2 pb-1">
          <Wordmark size="sm" href="/admin" name={shopName} />
        </div>

        <div className="mt-7 space-y-6">
          {sections.map((section) => (
            <div key={section.title}>
              <div
                className="mb-1.5 px-2 text-[10px] font-bold uppercase tracking-wide2"
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
                      className={`flex items-center gap-2.5 px-2 py-2 text-[13px] transition-colors ${
                        active ? 'font-semibold' : 'hover:bg-[rgb(var(--surface-2))]'
                      }`}
                      style={{
                        color: active ? 'rgb(var(--ink))' : 'rgb(var(--ink-soft))',
                        background: active ? 'rgb(var(--surface-2))' : 'transparent',
                        borderLeft: active
                          ? '2px solid rgb(var(--accent))'
                          : '2px solid transparent',
                      }}
                    >
                      <Icon className="h-4 w-4 shrink-0" strokeWidth={1.75} />
                      <span className="truncate">{label}</span>
                    </Link>
                  );
                })}
              </nav>
            </div>
          ))}
        </div>

        <div
          className="mt-auto space-y-0.5 border-t px-2 pt-4"
          style={{ borderColor: 'rgb(var(--line))' }}
        >
          {/* Le bloc d'identité mène au profil : c'est là qu'on le cherche. */}
          <Link
            href="/admin/profil"
            className="block pb-2 transition-opacity hover:opacity-70"
          >
            <div className="text-[13px] font-semibold" style={{ color: 'rgb(var(--ink))' }}>
              {memberName}
            </div>
            <div
              className="text-[10px] font-bold uppercase tracking-wide2"
              style={{ color: 'rgb(var(--accent))' }}
            >
              {ROLE_LABELS[role]} · mon profil
            </div>
          </Link>

          <Link
            href="/"
            className="flex items-center gap-2.5 py-1.5 text-[12px]"
            style={{ color: 'rgb(var(--muted))' }}
          >
            <ExternalLink className="h-3.5 w-3.5" strokeWidth={1.75} />
            Voir la boutique
          </Link>
          <button
            onClick={logout}
            className="flex w-full items-center gap-2.5 py-1.5 text-left text-[12px]"
            style={{ color: 'rgb(var(--muted))' }}
          >
            <LogOut className="h-3.5 w-3.5" strokeWidth={1.75} />
            Déconnexion
          </button>
        </div>
      </aside>

      <div className="flex min-h-dvh flex-1 flex-col">
        <header
          className="glass sticky top-0 z-30 border-b md:hidden"
          style={{ borderColor: 'rgb(var(--line))' }}
        >
          <div className="flex items-center justify-between px-4 py-2.5">
            <Wordmark size="sm" href="/admin" name={shopName} />
            <Link
              href="/admin/profil"
              className="text-[10px] font-bold uppercase tracking-wide2"
              style={{ color: 'rgb(var(--accent))' }}
            >
              {ROLE_LABELS[role]}
            </Link>
          </div>
        </header>

        <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 pb-24 md:px-8 md:pb-10">
          <MemberProvider value={{ id: memberId, name: memberName, role }}>
            <DemoBanner />
            {children}
          </MemberProvider>
        </main>

        <nav
          className="glass fixed inset-x-0 bottom-0 z-30 border-t md:hidden"
          style={{ borderColor: 'rgb(var(--line))' }}
        >
          <div
            className="grid"
            style={{
              gridTemplateColumns: `repeat(${mobileItems.length}, minmax(0, 1fr))`,
            }}
          >
            {mobileItems.map(({ href, label, icon: Icon, exact }) => {
              const active = isActive(href, exact);
              return (
                <Link
                  key={href}
                  href={href}
                  className="flex flex-col items-center gap-1 py-2"
                  style={{
                    color: active ? 'rgb(var(--accent))' : 'rgb(var(--muted))',
                  }}
                >
                  <Icon className="h-5 w-5" strokeWidth={1.75} />
                  <span className="text-[9px] font-semibold uppercase tracking-industrial">
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
