import Image from 'next/image';
import { ArrowUpRight } from 'lucide-react';
import type { Sector } from '@/lib/types';

export function Sectors({ sectors }: { sectors: Sector[] }) {
  if (sectors.length === 0) return null;

  return (
    <section id="secteurs" className="py-24 md:py-40">
      <div className="mx-auto max-w-7xl px-6">
        <div className="grid gap-10 md:grid-cols-12">
          <div className="md:col-span-4">
            <div className="eyebrow">Nos secteurs</div>
            <h2 className="font-display mt-6 text-4xl font-medium leading-tight tracking-tight md:text-5xl">
              Une maison,
              <br />
              <span className="italic font-normal">plusieurs métiers.</span>
            </h2>
          </div>
          <p
            className="max-w-md text-[15px] leading-relaxed md:col-span-7 md:col-start-6 md:self-end"
            style={{ color: 'rgb(var(--ink-soft))' }}
          >
            Chaque secteur est mené par une spécialiste — pour que chaque détail
            compte.
          </p>
        </div>

        <div className="mt-16 grid gap-px bg-[rgb(var(--line))] md:grid-cols-2">
          {sectors.map((s, i) => (
            <a
              key={s.id}
              href="#prestations"
              className="group relative overflow-hidden bg-[rgb(var(--bg))] p-8 md:p-12 transition-colors hover:bg-[rgb(var(--surface))]"
            >
              {s.cover_image_url && (
                <div className="absolute inset-0 opacity-[0.08] transition-opacity group-hover:opacity-[0.14]">
                  <Image src={s.cover_image_url} alt="" fill sizes="(max-width:768px) 100vw, 50vw" className="object-cover" />
                </div>
              )}
              <div className="relative">
                <div className="flex items-start justify-between">
                  <span className="section-number">
                    {String(i + 1).padStart(2, '0')} —
                  </span>
                  <ArrowUpRight className="h-4 w-4 text-[rgb(var(--muted))] transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
                </div>

                <h3 className="font-display mt-12 text-4xl font-medium tracking-tight md:text-5xl">
                  {s.name}
                </h3>

                {s.description && (
                  <p
                    className="mt-6 max-w-sm text-[14px] leading-relaxed"
                    style={{ color: 'rgb(var(--ink-soft))' }}
                  >
                    {s.description}
                  </p>
                )}
              </div>
            </a>
          ))}
        </div>
      </div>
    </section>
  );
}
