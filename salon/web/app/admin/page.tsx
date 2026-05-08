import { Calendar, Users, Receipt, Package, ArrowUpRight } from 'lucide-react';

const STATS = [
  { label: "RDV aujourd'hui", value: '—', icon: Calendar, href: '/admin/agenda', accent: '#c8932a' },
  { label: 'Clientes actives', value: '—', icon: Users, href: '/admin/clients', accent: '#d6a937' },
  { label: 'Ventes du jour', value: '—', icon: Receipt, href: '/admin/ventes', accent: '#a87623' },
  { label: 'Stock alerte', value: '—', icon: Package, href: '/admin/stock', accent: '#7e561f' },
];

export default function AdminDashboard() {
  return (
    <div className="space-y-8 stagger">
      <header>
        <h1 className="font-display text-3xl font-medium tracking-tight">
          Tableau de bord
        </h1>
        <p className="text-sm text-muted">
          Vue d'ensemble de l'activité du salon en temps réel.
        </p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {STATS.map((s) => {
          const Icon = s.icon;
          return (
            <a
              key={s.label}
              href={s.href}
              className="card-3d group p-5 lift"
            >
              <div className="flex items-start justify-between">
                <div
                  className="grid h-10 w-10 place-items-center rounded-xl text-white"
                  style={{
                    background: `linear-gradient(135deg, ${s.accent}, ${s.accent}cc)`,
                    boxShadow: `0 6px 16px -4px ${s.accent}80`,
                  }}
                >
                  <Icon className="h-4 w-4" />
                </div>
                <ArrowUpRight className="h-4 w-4 text-muted transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
              </div>
              <div className="mt-4 font-display text-3xl font-semibold tracking-tight">
                {s.value}
              </div>
              <div className="text-xs text-muted">{s.label}</div>
            </a>
          );
        })}
      </div>

      <div className="card-3d p-8 text-center">
        <h2 className="font-display text-2xl font-medium tracking-tight">
          Bienvenue dans ton admin
        </h2>
        <p className="mx-auto mt-2 max-w-md text-sm text-muted">
          Ici tu pourras gérer tes RDV, clients, ventes et stock. Les pages
          arrivent une par une — la base est posée, place à l'itération.
        </p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-2 text-xs text-muted">
          <span className="chip surface-2">À venir : agenda</span>
          <span className="chip surface-2">À venir : clients</span>
          <span className="chip surface-2">À venir : POS</span>
          <span className="chip surface-2">À venir : stock</span>
        </div>
      </div>
    </div>
  );
}
