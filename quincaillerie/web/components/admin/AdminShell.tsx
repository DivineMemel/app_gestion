'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
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
  ScrollText,
  ExternalLink,
  LogOut,
  Menu,
  X,
} from 'lucide-react';
import { Wordmark } from '@/components/Wordmark';
import { DemoBanner } from '@/components/admin/DemoBanner';
import { MemberProvider } from '@/lib/member';
import { canView, moduleForPath, roleLabels, type Role } from '@/lib/permissions';

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
      { href: '/admin/journal', label: 'Journal', icon: ScrollText },
      { href: '/admin/parametres', label: 'Paramètres', icon: Settings },
    ],
  },
];

/**
 * Barre du bas sur mobile : les gestes du quotidien, dans l'ordre d'usage.
 *
 * Elle n'a jamais montré que ceux-là, et le reste du menu n'existait que dans
 * la colonne de gauche — masquée sous 768 px. Sur un téléphone tenu debout, la
 * moitié de l'application était donc inatteignable : il fallait basculer en
 * paysage pour voir Produits, Devis, Comptabilité ou même se déconnecter.
 *
 * D'où la règle : cette liste est un RACCOURCI, pas le menu. Les quatre
 * premières entrées visibles par le rôle tiennent dans la barre, la cinquième
 * cellule ouvre le menu complet, qui reprend exactement les mêmes sections que
 * la colonne de gauche.
 */
const MOBILE: NavItem[] = [
  { href: '/admin', label: 'Bord', icon: LayoutDashboard, exact: true },
  { href: '/admin/caisse', label: 'Caisse', icon: ScanBarcode },
  { href: '/admin/ventes', label: 'Ventes', icon: Receipt },
  { href: '/admin/stock', label: 'Stock', icon: Boxes },
  { href: '/admin/clients', label: 'Clients', icon: Users },
];

/** Au-delà de cinq cellules, les libellés deviennent illisibles sur un 320 px. */
const RACCOURCIS_MOBILE = 4;

export function AdminShell({
  children,
  memberId,
  roles,
  memberName,
  shopName,
}: {
  children: React.ReactNode;
  memberId: string;
  roles: Role[];
  memberName: string;
  shopName: string;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [menuOuvert, setMenuOuvert] = useState(false);

  // Le menu se referme dès qu'on a navigué : sur un téléphone, revenir en
  // arrière pour trouver l'écran demandé derrière un panneau resté ouvert est
  // le genre de détail qui fait croire que l'application a planté.
  useEffect(() => setMenuOuvert(false), [pathname]);

  // Pendant que le panneau couvre l'écran, c'est LUI qui défile, pas la page
  // en dessous.
  useEffect(() => {
    if (!menuOuvert) return;
    const avant = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = avant;
    };
  }, [menuOuvert]);

  const isActive = (href: string, exact?: boolean) =>
    exact ? pathname === href : pathname.startsWith(href);

  const seesHref = (href: string) => {
    const m = moduleForPath(href);
    return m ? canView(roles, m) : true;
  };

  // Garde de route côté client : confort de navigation, pas sécurité — les
  // routes serveur revérifient le rôle à chaque requête.
  useEffect(() => {
    const m = moduleForPath(pathname);
    if (m && !canView(roles, m)) router.replace('/admin');
  }, [pathname, roles, router]);

  const sections = SECTIONS.map((s) => ({
    ...s,
    items: s.items.filter((it) => seesHref(it.href)),
  })).filter((s) => s.items.length > 0);

  const mobileItems = MOBILE.filter((it) => seesHref(it.href));
  // Ce qui déborde de la barre n'est pas perdu : le menu complet le reprend.
  const raccourcis = mobileItems.slice(0, RACCOURCIS_MOBILE);

  async function logout() {
    await fetch('/api/admin/logout', { method: 'POST' });

    // On efface ce qui est personnel — la liste des clients, et la coquille
    // rendue au nom de l'utilisateur — mais PAS le catalogue ni les photos.
    // Les mêmes articles aux mêmes prix sont publics sur la vitrine : les
    // effacer ne protège rien et rendrait la caisse inutilisable le lendemain
    // matin si le réseau est tombé pendant la nuit.
    //
    // La file des ventes n'est jamais touchée : elle contient de l'argent
    // encaissé qui n'est pas encore parti au serveur.
    try {
      navigator.serviceWorker?.controller?.postMessage('purge-session');
      const { purgerDonneesPersonnelles } = await import('@/lib/offline-store');
      await purgerDonneesPersonnelles();
    } catch {
      /* rien de vital : la déconnexion prime */
    }

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
              {roleLabels(roles)} · mon profil
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
              {roleLabels(roles)}
            </Link>
          </div>
        </header>

        <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 pb-24 md:px-8 md:pb-10">
          <MemberProvider value={{ id: memberId, name: memberName, roles }}>
            <DemoBanner />
            {children}
          </MemberProvider>
        </main>

        {/* ---- Menu complet, mobile : mêmes sections que la colonne de gauche ---- */}
        {menuOuvert && (
          <div
            className="fixed inset-0 z-40 flex flex-col md:hidden"
            style={{ background: 'rgb(var(--bg))' }}
            role="dialog"
            aria-modal="true"
            aria-label="Menu"
          >
            <div
              className="flex shrink-0 items-center justify-between border-b px-4 py-2.5"
              style={{ borderColor: 'rgb(var(--line))' }}
            >
              {/* Le logo ramène au tableau de bord ; s'il y est déjà, le
                  changement de route n'a pas lieu et ne refermerait rien. */}
              <div onClick={() => setMenuOuvert(false)}>
                <Wordmark size="sm" href="/admin" name={shopName} />
              </div>
              <button
                onClick={() => setMenuOuvert(false)}
                className="btn-ghost"
                aria-label="Fermer le menu"
              >
                <X className="h-5 w-5" strokeWidth={1.75} />
              </button>
            </div>

            {/* `pb-24` : la barre du bas flotte au-dessus, elle ne doit pas
                masquer la dernière entrée du menu. */}
            <div className="flex-1 overflow-y-auto px-4 pb-24 pt-4">
              <div className="space-y-6">
                {sections.map((section) => (
                  <div key={section.title}>
                    <div
                      className="mb-1.5 text-[10px] font-bold uppercase tracking-wide2"
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
                            onClick={() => setMenuOuvert(false)}
                            // Cible large : ces liens se touchent au pouce,
                            // souvent avec des mains de chantier.
                            className="flex items-center gap-3 px-2 py-3 text-[15px]"
                            style={{
                              color: active ? 'rgb(var(--ink))' : 'rgb(var(--ink-soft))',
                              background: active ? 'rgb(var(--surface-2))' : 'transparent',
                              fontWeight: active ? 600 : 400,
                              borderLeft: active
                                ? '2px solid rgb(var(--accent))'
                                : '2px solid transparent',
                            }}
                          >
                            <Icon className="h-5 w-5 shrink-0" strokeWidth={1.75} />
                            <span className="truncate">{label}</span>
                          </Link>
                        );
                      })}
                    </nav>
                  </div>
                ))}
              </div>

              {/* Profil, vitrine et déconnexion n'existaient que dans la colonne
                  de gauche : sur téléphone, on ne pouvait pas se déconnecter. */}
              <div
                className="mt-6 border-t pt-4"
                style={{ borderColor: 'rgb(var(--line))' }}
              >
                <Link
                  href="/admin/profil"
                  onClick={() => setMenuOuvert(false)}
                  className="block px-2 py-2"
                >
                  <div
                    className="text-[15px] font-semibold"
                    style={{ color: 'rgb(var(--ink))' }}
                  >
                    {memberName}
                  </div>
                  <div
                    className="text-[10px] font-bold uppercase tracking-wide2"
                    style={{ color: 'rgb(var(--accent))' }}
                  >
                    {roleLabels(roles)} · mon profil
                  </div>
                </Link>

                <Link
                  href="/"
                  onClick={() => setMenuOuvert(false)}
                  className="flex items-center gap-3 px-2 py-3 text-[13px]"
                  style={{ color: 'rgb(var(--muted))' }}
                >
                  <ExternalLink className="h-4 w-4" strokeWidth={1.75} />
                  Voir la boutique
                </Link>
                <button
                  onClick={logout}
                  className="flex w-full items-center gap-3 px-2 py-3 text-left text-[13px]"
                  style={{ color: 'rgb(var(--muted))' }}
                >
                  <LogOut className="h-4 w-4" strokeWidth={1.75} />
                  Déconnexion
                </button>
              </div>
            </div>
          </div>
        )}

        <nav
          className="glass fixed inset-x-0 bottom-0 z-50 border-t md:hidden"
          style={{ borderColor: 'rgb(var(--line))' }}
        >
          <div
            className="grid"
            style={{
              gridTemplateColumns: `repeat(${raccourcis.length + 1}, minmax(0, 1fr))`,
            }}
          >
            {raccourcis.map(({ href, label, icon: Icon, exact }) => {
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

            {/* La cellule qui manquait : tout le reste de l'application. */}
            <button
              onClick={() => setMenuOuvert((v) => !v)}
              className="flex flex-col items-center gap-1 py-2"
              aria-expanded={menuOuvert}
              aria-label="Menu complet"
              style={{
                color: menuOuvert ? 'rgb(var(--accent))' : 'rgb(var(--muted))',
              }}
            >
              {menuOuvert ? (
                <X className="h-5 w-5" strokeWidth={1.75} />
              ) : (
                <Menu className="h-5 w-5" strokeWidth={1.75} />
              )}
              <span className="text-[9px] font-semibold uppercase tracking-industrial">
                Menu
              </span>
            </button>
          </div>
        </nav>
      </div>
    </div>
  );
}
