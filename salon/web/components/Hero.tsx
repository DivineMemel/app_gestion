import Link from 'next/link';
import { Calendar, Sparkles, Star } from 'lucide-react';

export function Hero() {
  return (
    <section className="relative overflow-hidden pt-32 pb-20 md:pt-40 md:pb-32">
      {/* Decorative blobs */}
      <div className="pointer-events-none absolute -top-32 -left-32 h-96 w-96 rounded-full opacity-40 blur-3xl"
        style={{ background: 'radial-gradient(circle, #d6a937, transparent 70%)' }}
      />
      <div className="pointer-events-none absolute -bottom-40 -right-32 h-[28rem] w-[28rem] rounded-full opacity-30 blur-3xl"
        style={{ background: 'radial-gradient(circle, #c8932a, transparent 70%)' }}
      />

      <div className="relative mx-auto max-w-6xl px-4">
        <div className="grid gap-12 md:grid-cols-2 md:items-center">
          {/* Left — content */}
          <div className="stagger">
            <div className="eyebrow mb-5">Atelier de coiffure · Abidjan</div>

            <h1 className="font-display text-5xl font-medium leading-[1.05] tracking-tight md:text-7xl">
              L'art de la <span className="text-gold italic">beauté</span>,
              <br />
              révélé par nos mains.
            </h1>

            <p className="mt-6 max-w-md text-base text-muted md:text-lg">
              Coupes, couleurs, soins et tresses signature. Notre équipe sublime
              ta coiffure dans un cadre qui te ressemble.
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link href="/reserver" className="btn-primary text-base">
                <Calendar className="h-4 w-4" />
                Réserver maintenant
              </Link>
              <a href="#services" className="btn-outline text-base">
                Voir les services
              </a>
            </div>

            {/* Trust row */}
            <div className="mt-10 flex flex-wrap items-center gap-6">
              <div className="flex items-center gap-1.5">
                {[...Array(5)].map((_, i) => (
                  <Star key={i} className="h-4 w-4 fill-current text-gold-500" style={{ color: '#d6a937', fill: '#d6a937' }} />
                ))}
                <span className="ml-1 text-sm font-medium">4.9</span>
                <span className="text-sm text-muted">· 200+ avis</span>
              </div>
              <div className="hidden h-4 w-px bg-[rgb(var(--border))] sm:block" />
              <div className="flex items-center gap-1.5 text-sm text-muted">
                <Sparkles className="h-4 w-4" style={{ color: '#d6a937' }} />
                Produits premium
              </div>
            </div>
          </div>

          {/* Right — visual */}
          <div className="relative">
            <div className="relative aspect-[3/4] overflow-hidden rounded-3xl card-3d animate-fade-in">
              <div
                className="absolute inset-0"
                style={{
                  background:
                    'linear-gradient(135deg, #2c1f10 0%, #4a3520 50%, #c8932a 100%)',
                }}
              />
              <div
                className="absolute inset-0 opacity-30 mix-blend-overlay"
                style={{
                  backgroundImage:
                    'radial-gradient(circle at 30% 20%, rgba(255,225,150,0.4), transparent 60%)',
                }}
              />
              {/* Decorative SVG pattern */}
              <svg
                className="absolute inset-0 h-full w-full opacity-20"
                viewBox="0 0 200 280"
                preserveAspectRatio="xMidYMid slice"
              >
                <defs>
                  <pattern id="dots" x="0" y="0" width="20" height="20" patternUnits="userSpaceOnUse">
                    <circle cx="2" cy="2" r="0.8" fill="#fff8e0" />
                  </pattern>
                </defs>
                <rect width="200" height="280" fill="url(#dots)" />
              </svg>
              <div className="absolute inset-0 flex items-end p-8">
                <div className="text-white">
                  <div className="font-display text-3xl italic leading-tight">
                    "Plus qu'une coupe, une expérience."
                  </div>
                </div>
              </div>
            </div>

            {/* Floating badge */}
            <div className="absolute -left-4 top-8 hidden md:block animate-float">
              <div className="card-3d px-4 py-3">
                <div className="text-[10px] uppercase tracking-wider text-muted">Ouvert aujourd'hui</div>
                <div className="font-display text-lg font-semibold">9h — 19h</div>
              </div>
            </div>
            <div className="absolute -right-4 bottom-12 hidden md:block animate-float" style={{ animationDelay: '2s' }}>
              <div className="card-3d px-4 py-3">
                <div className="flex items-center gap-2">
                  <div
                    className="h-8 w-8 rounded-full"
                    style={{
                      background: 'linear-gradient(135deg, #c8932a, #ecda99)',
                    }}
                  />
                  <div>
                    <div className="text-xs font-semibold">+200 clientes</div>
                    <div className="text-[10px] text-muted">cette semaine</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
