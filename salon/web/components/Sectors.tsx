import { Scissors, Sparkles, ArrowUpRight } from 'lucide-react';

const SECTORS = [
  {
    n: '01',
    Icon: Scissors,
    name: 'Coiffure',
    tag: 'Coupes · Couleur · Tresses · Soins',
    text:
      "Une équipe formée aux gestes signature : coupes structurées, colorations sur-mesure, soins en profondeur, tresses africaines.",
  },
  {
    n: '02',
    Icon: Sparkles,
    name: 'Onglerie',
    tag: 'Manucure · Pédicure · Pose · Entretiens',
    text:
      "Pour des mains et pieds impeccables : manucure classique, semi-permanent, pose américaine, nail art discret.",
  },
];

export function Sectors() {
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
            MUSE l&rsquo;atelier réunit les expertises sous un même toit. Chaque
            secteur est mené par une spécialiste — pour que chaque détail compte.
          </p>
        </div>

        <div className="mt-16 grid gap-px bg-[rgb(var(--line))] md:grid-cols-2">
          {SECTORS.map((s) => {
            const Icon = s.Icon;
            return (
              <a
                key={s.n}
                href="#prestations"
                className="group relative bg-[rgb(var(--bg))] p-8 md:p-12 transition-colors hover:bg-[rgb(var(--surface))]"
              >
                <div className="flex items-start justify-between">
                  <span className="section-number">{s.n} —</span>
                  <ArrowUpRight
                    className="h-4 w-4 text-[rgb(var(--muted))] transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5"
                  />
                </div>

                <Icon className="mt-12 h-7 w-7" strokeWidth={1.25} />

                <h3 className="font-display mt-6 text-4xl font-medium tracking-tight md:text-5xl">
                  {s.name}
                </h3>
                <div
                  className="mt-2 text-[11px] uppercase tracking-[0.18em]"
                  style={{ color: 'rgb(var(--muted))' }}
                >
                  {s.tag}
                </div>

                <p
                  className="mt-6 max-w-sm text-[14px] leading-relaxed"
                  style={{ color: 'rgb(var(--ink-soft))' }}
                >
                  {s.text}
                </p>
              </a>
            );
          })}
        </div>
      </div>
    </section>
  );
}
