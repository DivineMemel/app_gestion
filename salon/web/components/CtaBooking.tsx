import Link from 'next/link';
import { Calendar, ArrowRight } from 'lucide-react';

export function CtaBooking() {
  return (
    <section className="relative py-20 md:py-28">
      <div className="mx-auto max-w-6xl px-4">
        <div
          className="relative overflow-hidden rounded-3xl px-6 py-16 md:px-16 md:py-24 text-center"
          style={{
            background:
              'linear-gradient(135deg, #1a1207 0%, #2c1f10 50%, #4a3520 100%)',
          }}
        >
          {/* Mesh blobs */}
          <div className="pointer-events-none absolute -top-32 -left-20 h-72 w-72 rounded-full opacity-50 blur-3xl"
            style={{ background: 'radial-gradient(circle, #d6a937, transparent 70%)' }}
          />
          <div className="pointer-events-none absolute -bottom-32 -right-20 h-72 w-72 rounded-full opacity-40 blur-3xl"
            style={{ background: 'radial-gradient(circle, #ecda99, transparent 70%)' }}
          />

          {/* Subtle gold border */}
          <div
            className="pointer-events-none absolute inset-0 rounded-3xl"
            style={{
              boxShadow: 'inset 0 0 0 1px rgba(214, 169, 55, 0.25)',
            }}
          />

          <div className="relative">
            <div className="eyebrow justify-center mb-6 text-gold-300">Prêt(e) ?</div>
            <h2 className="font-display text-4xl font-medium leading-tight tracking-tight text-white md:text-6xl">
              Prends rendez-vous
              <br />
              en <span className="italic" style={{ color: '#ecda99' }}>2 minutes</span>.
            </h2>
            <p className="mx-auto mt-5 max-w-md text-base" style={{ color: 'rgba(255,245,200,0.75)' }}>
              Choisis ton service, ton créneau et ta styliste. Confirmation
              instantanée par WhatsApp.
            </p>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              <Link href="/reserver" className="btn-primary text-base">
                <Calendar className="h-4 w-4" />
                Réserver maintenant
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
