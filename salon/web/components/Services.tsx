import { Scissors, Palette, Sparkles, Crown, Droplet, Wand2 } from 'lucide-react';

const SERVICES = [
  {
    icon: Scissors,
    name: 'Coupe & Coiffure',
    desc: 'Coupes signature adaptées à ta morphologie et ton style.',
    price: 8000,
    duration: 60,
  },
  {
    icon: Palette,
    name: 'Couleur & Mèches',
    desc: 'Coloration permanente, balayage, ombré pour un rendu naturel.',
    price: 25000,
    duration: 120,
  },
  {
    icon: Crown,
    name: 'Tresses & Braids',
    desc: 'Tresses africaines, box braids, twists par nos expertes.',
    price: 18000,
    duration: 180,
  },
  {
    icon: Droplet,
    name: 'Soins capillaires',
    desc: 'Masques, kératine, soins profonds pour cheveux nourris.',
    price: 12000,
    duration: 60,
  },
  {
    icon: Wand2,
    name: 'Lissage & Permanente',
    desc: 'Lissage brésilien, permanente, mise en plis longue durée.',
    price: 35000,
    duration: 150,
  },
  {
    icon: Sparkles,
    name: 'Forfait événement',
    desc: 'Coiffure mariage, soirée, cérémonie. Sur mesure pour ton grand jour.',
    price: 45000,
    duration: 120,
  },
];

function fmtPrice(xof: number) {
  return new Intl.NumberFormat('fr-FR').format(xof) + ' FCFA';
}

export function Services() {
  return (
    <section id="services" className="relative py-20 md:py-32">
      <div className="mx-auto max-w-6xl px-4">
        <div className="mx-auto max-w-2xl text-center">
          <div className="eyebrow justify-center mb-5">Nos services</div>
          <h2 className="font-display text-4xl font-medium tracking-tight md:text-5xl">
            Tout ce dont tes cheveux ont besoin,
            <span className="text-gold italic"> sous un seul toit.</span>
          </h2>
          <p className="mt-4 text-base text-muted">
            Des prestations pensées pour chaque envie, chaque texture, chaque
            occasion.
          </p>
        </div>

        <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3 stagger">
          {SERVICES.map((s) => {
            const Icon = s.icon;
            return (
              <div key={s.name} className="card-3d p-6 lift">
                <div
                  className="mb-4 grid h-12 w-12 place-items-center rounded-2xl text-white"
                  style={{
                    background: 'linear-gradient(135deg, #a87623, #d6a937)',
                    boxShadow: '0 6px 18px -4px rgba(196, 147, 42, 0.5)',
                  }}
                >
                  <Icon className="h-5 w-5" />
                </div>
                <h3 className="font-display text-2xl font-medium tracking-tight">
                  {s.name}
                </h3>
                <p className="mt-2 text-sm text-muted leading-relaxed">{s.desc}</p>
                <div className="mt-5 flex items-center justify-between border-t border-[rgb(var(--border))] pt-4">
                  <span className="text-[11px] uppercase tracking-wider text-muted">
                    À partir de
                  </span>
                  <div className="text-right">
                    <div className="font-display text-xl font-semibold text-gold">
                      {fmtPrice(s.price)}
                    </div>
                    <div className="text-[11px] text-muted">~ {s.duration} min</div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
