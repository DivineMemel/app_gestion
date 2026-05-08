import { Calendar, Users, Receipt, Package, Wallet, TrendingUp } from 'lucide-react';

const STATS = [
  { label: "RDV aujourd'hui", value: '—', icon: Calendar, href: '/admin/agenda' },
  { label: 'Clientes actives', value: '—', icon: Users, href: '/admin/clients' },
  { label: 'Ventes du jour', value: '— FCFA', icon: Receipt, href: '/admin/ventes' },
  { label: 'Stock à reconstituer', value: '—', icon: Package, href: '/admin/stock' },
];

const FINANCE = [
  { label: 'Chiffre du mois', value: '— FCFA', delta: '—', icon: TrendingUp },
  { label: 'Dépenses du mois', value: '— FCFA', delta: '—', icon: Wallet },
  { label: 'Bénéfice net', value: '— FCFA', delta: '—', icon: Receipt },
];

export default function AdminDashboard() {
  return (
    <div className="space-y-12 stagger">
      {/* Header */}
      <header className="flex flex-wrap items-baseline justify-between gap-4 border-b pb-8" style={{ borderColor: 'rgb(var(--line))' }}>
        <div>
          <div className="eyebrow">Tableau de bord</div>
          <h1 className="font-display mt-3 text-4xl font-medium tracking-tight md:text-5xl">
            Bonjour.
          </h1>
        </div>
        <div className="text-[11px] uppercase tracking-[0.24em]" style={{ color: 'rgb(var(--muted))' }}>
          {new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: '2-digit', month: 'long' })}
        </div>
      </header>

      {/* Stats du jour */}
      <section>
        <div className="eyebrow mb-6">Activité du jour</div>
        <div className="grid gap-px bg-[rgb(var(--line))] sm:grid-cols-2 lg:grid-cols-4">
          {STATS.map((s) => {
            const Icon = s.icon;
            return (
              <a
                key={s.label}
                href={s.href}
                className="bg-[rgb(var(--bg))] p-6 transition-colors hover:bg-[rgb(var(--surface))]"
              >
                <div className="flex items-start justify-between">
                  <Icon className="h-4 w-4" strokeWidth={1.5} />
                  <span className="section-number">→</span>
                </div>
                <div className="font-display mt-8 text-3xl font-medium tracking-tight tabular-nums">
                  {s.value}
                </div>
                <div className="mt-1 text-[11px] uppercase tracking-[0.18em]" style={{ color: 'rgb(var(--muted))' }}>
                  {s.label}
                </div>
              </a>
            );
          })}
        </div>
      </section>

      {/* Finance — vue rapide */}
      <section>
        <div className="flex items-baseline justify-between mb-6">
          <div className="eyebrow">Finances · ce mois-ci</div>
          <a
            href="/admin/comptabilite"
            className="text-[11px] uppercase tracking-[0.24em] underline-anim"
          >
            Détail compta
          </a>
        </div>
        <div className="grid gap-px bg-[rgb(var(--line))] sm:grid-cols-3">
          {FINANCE.map((f) => {
            const Icon = f.icon;
            return (
              <div key={f.label} className="bg-[rgb(var(--bg))] p-6">
                <div className="flex items-start justify-between">
                  <Icon className="h-4 w-4" strokeWidth={1.5} />
                  <span className="text-[10px] uppercase tracking-[0.18em]" style={{ color: 'rgb(var(--muted))' }}>
                    {f.delta}
                  </span>
                </div>
                <div className="font-display mt-8 text-3xl font-medium tracking-tight tabular-nums">
                  {f.value}
                </div>
                <div className="mt-1 text-[11px] uppercase tracking-[0.18em]" style={{ color: 'rgb(var(--muted))' }}>
                  {f.label}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Onboarding */}
      <section className="surface px-8 py-10 md:px-12">
        <div className="eyebrow">Démarrer</div>
        <h2 className="font-display mt-4 text-2xl font-medium tracking-tight md:text-3xl">
          Bienvenue dans l&rsquo;atelier.
        </h2>
        <p
          className="mt-3 max-w-2xl text-[14px] leading-relaxed"
          style={{ color: 'rgb(var(--ink-soft))' }}
        >
          Ce tableau de bord regroupe l&rsquo;essentiel : agenda, clientes, ventes,
          stock et finances. Les pages se construisent une à une — l&rsquo;ossature
          (multi-secteur, journey CRM, comptabilité) est déjà en place.
        </p>
        <div className="hairline my-8" />
        <div className="flex flex-wrap items-center gap-3 text-[11px] uppercase tracking-[0.18em]" style={{ color: 'rgb(var(--muted))' }}>
          <span>À venir</span>
          <span>·</span>
          <span>Booking en ligne</span>
          <span>·</span>
          <span>Auth admin</span>
          <span>·</span>
          <span>POS</span>
          <span>·</span>
          <span>Timeline cliente</span>
        </div>
      </section>
    </div>
  );
}
