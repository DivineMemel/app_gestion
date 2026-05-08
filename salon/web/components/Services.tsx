'use client';
import { useState } from 'react';

type ServiceItem = {
  name: string;
  desc: string;
  price: number;
  duration: number;
};

const COIFFURE: ServiceItem[] = [
  { name: 'Coupe & coiffage', desc: 'Coupe sur-mesure, brushing inclus.', price: 8000, duration: 60 },
  { name: 'Couleur & mèches', desc: 'Coloration permanente, balayage, ombré.', price: 25000, duration: 120 },
  { name: 'Tresses & braids', desc: 'Tresses africaines, box braids, twists.', price: 18000, duration: 180 },
  { name: 'Soin profond', desc: 'Masque, kératine, soin reconstructeur.', price: 12000, duration: 60 },
  { name: 'Lissage', desc: 'Brésilien, japonais, sur diagnostic.', price: 35000, duration: 150 },
  { name: 'Mariage & événement', desc: "Coiffure de cérémonie sur-mesure.", price: 45000, duration: 120 },
];

const ONGLERIE: ServiceItem[] = [
  { name: 'Manucure classique', desc: 'Limage, soin cuticules, pose vernis.', price: 6000, duration: 45 },
  { name: 'Manucure semi-permanent', desc: 'Tenue 2 à 3 semaines.', price: 10000, duration: 60 },
  { name: 'Pose américaine', desc: 'Capsules + résine, formes au choix.', price: 18000, duration: 120 },
  { name: 'Remplissage', desc: 'Entretien de la pose, recommandé toutes les 3 sem.', price: 12000, duration: 90 },
  { name: 'Pédicure', desc: 'Soin complet pieds + vernis.', price: 9000, duration: 60 },
  { name: 'Nail art', desc: "Décor sur-mesure, supplément à la pose.", price: 3000, duration: 20 },
];

const TABS = [
  { key: 'coiffure', label: 'Coiffure', items: COIFFURE },
  { key: 'onglerie', label: 'Onglerie', items: ONGLERIE },
] as const;

function fmtPrice(xof: number) {
  return new Intl.NumberFormat('fr-FR').format(xof);
}

export function Services() {
  const [active, setActive] = useState<(typeof TABS)[number]['key']>('coiffure');
  const items = TABS.find((t) => t.key === active)!.items;

  return (
    <section id="prestations" className="py-24 md:py-40">
      <div className="mx-auto max-w-7xl px-6">
        <div className="grid gap-10 md:grid-cols-12">
          <div className="md:col-span-7">
            <div className="eyebrow">Prestations</div>
            <h2 className="font-display mt-6 text-4xl font-medium leading-tight tracking-tight md:text-6xl">
              Le détail,
              <br />
              <span className="italic font-normal">jusqu&rsquo;au bout des ongles.</span>
            </h2>
          </div>

          {/* Tabs */}
          <div className="md:col-span-5 md:self-end">
            <div className="flex flex-wrap items-center gap-1">
              {TABS.map((t) => (
                <button
                  key={t.key}
                  onClick={() => setActive(t.key)}
                  className={`px-5 py-2.5 text-[11px] uppercase tracking-[0.24em] transition-all ${
                    active === t.key
                      ? 'bg-[rgb(var(--ink))] text-[rgb(var(--bg))]'
                      : 'border border-[rgb(var(--line-strong))] text-[rgb(var(--ink-soft))] hover:border-[rgb(var(--ink))]'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Liste éditoriale */}
        <ul className="mt-16 divide-y" style={{ borderColor: 'rgb(var(--line))' }}>
          {items.map((it, i) => (
            <li
              key={it.name}
              className="grid grid-cols-12 items-baseline gap-6 border-t py-7 md:py-9"
              style={{ borderColor: 'rgb(var(--line))' }}
            >
              <span className="section-number col-span-2 md:col-span-1">
                {String(i + 1).padStart(2, '0')}
              </span>
              <div className="col-span-10 md:col-span-5">
                <h3 className="font-display text-2xl font-medium tracking-tight md:text-3xl">
                  {it.name}
                </h3>
                <p
                  className="mt-1 text-[13px] leading-relaxed"
                  style={{ color: 'rgb(var(--muted))' }}
                >
                  {it.desc}
                </p>
              </div>
              <div
                className="col-span-6 col-start-3 mt-2 text-[11px] uppercase tracking-[0.2em] md:col-span-3 md:col-start-7 md:mt-0"
                style={{ color: 'rgb(var(--muted))' }}
              >
                {it.duration} min
              </div>
              <div className="col-span-6 col-start-9 mt-2 text-right md:col-span-3 md:col-start-10 md:mt-0">
                <span className="font-display text-xl tabular-nums">
                  {fmtPrice(it.price)}
                </span>{' '}
                <span
                  className="text-[10px] uppercase tracking-[0.24em]"
                  style={{ color: 'rgb(var(--muted))' }}
                >
                  FCFA
                </span>
              </div>
            </li>
          ))}
        </ul>

        <p
          className="mt-12 text-[12px]"
          style={{ color: 'rgb(var(--muted))' }}
        >
          Tarifs indicatifs · sur diagnostic, certains services peuvent varier
          selon la longueur ou la complexité.
        </p>
      </div>
    </section>
  );
}
