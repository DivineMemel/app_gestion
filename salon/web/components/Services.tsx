'use client';
import { useMemo, useState } from 'react';
import type { Sector, Service } from '@/lib/types';

function fmtPrice(xof: number) {
  return new Intl.NumberFormat('fr-FR').format(xof);
}

export function Services({
  sectors,
  services,
}: {
  sectors: Sector[];
  services: Service[];
}) {
  // On ne garde que les secteurs qui ont au moins un service.
  const tabs = useMemo(
    () => sectors.filter((sec) => services.some((s) => s.sector_id === sec.id)),
    [sectors, services],
  );
  const [active, setActive] = useState<string>(tabs[0]?.id ?? '');

  const activeId = tabs.some((t) => t.id === active) ? active : tabs[0]?.id ?? '';
  const items = services.filter((s) => s.sector_id === activeId);

  if (services.length === 0) return null;

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

          {tabs.length > 1 && (
            <div className="md:col-span-5 md:self-end">
              <div className="flex flex-wrap items-center gap-1">
                {tabs.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => setActive(t.id)}
                    className={`px-5 py-2.5 text-[11px] uppercase tracking-[0.24em] transition-all ${
                      activeId === t.id
                        ? 'bg-[rgb(var(--ink))] text-[rgb(var(--bg))]'
                        : 'border border-[rgb(var(--line-strong))] text-[rgb(var(--ink-soft))] hover:border-[rgb(var(--ink))]'
                    }`}
                  >
                    {t.name}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <ul className="mt-16 divide-y" style={{ borderColor: 'rgb(var(--line))' }}>
          {items.map((it, i) => (
            <li
              key={it.id}
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
                {it.description && (
                  <p
                    className="mt-1 text-[13px] leading-relaxed"
                    style={{ color: 'rgb(var(--muted))' }}
                  >
                    {it.description}
                  </p>
                )}
              </div>
              <div
                className="col-span-6 col-start-3 mt-2 text-[11px] uppercase tracking-[0.2em] md:col-span-3 md:col-start-7 md:mt-0"
                style={{ color: 'rgb(var(--muted))' }}
              >
                {it.duration_min} min
              </div>
              <div className="col-span-6 col-start-9 mt-2 text-right md:col-span-3 md:col-start-10 md:mt-0">
                <span className="font-display text-xl tabular-nums">
                  {fmtPrice(it.price_xof)}
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

        <p className="mt-12 text-[12px]" style={{ color: 'rgb(var(--muted))' }}>
          Tarifs indicatifs · sur diagnostic, certains services peuvent varier
          selon la longueur ou la complexité.
        </p>
      </div>
    </section>
  );
}
