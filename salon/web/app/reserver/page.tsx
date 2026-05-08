import Link from 'next/link';
import { ArrowLeft, MessageCircle } from 'lucide-react';
import { Navbar } from '@/components/Navbar';
import { Footer } from '@/components/Footer';

export default function ReserverPage() {
  return (
    <>
      <Navbar />
      <main className="pt-32 pb-20">
        <div className="mx-auto max-w-2xl px-4">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-[rgb(var(--fg))] mb-8"
          >
            <ArrowLeft className="h-4 w-4" />
            Retour
          </Link>

          <div className="card-3d p-8 md:p-12 text-center">
            <div
              className="mx-auto mb-6 grid h-16 w-16 place-items-center rounded-2xl text-white relative halo-gold"
              style={{
                background: 'linear-gradient(135deg, #c8932a, #d6a937)',
                boxShadow: '0 10px 30px -8px rgba(196, 147, 42, 0.5)',
              }}
            >
              <MessageCircle className="h-7 w-7" />
            </div>

            <div className="eyebrow justify-center mb-4">Réservation</div>
            <h1 className="font-display text-4xl font-medium tracking-tight md:text-5xl">
              Bientôt disponible
              <span className="text-gold italic"> en ligne</span>
            </h1>
            <p className="mx-auto mt-4 max-w-md text-base text-muted">
              Le formulaire de réservation arrive très vite. Pour l'instant,
              contacte-nous directement par WhatsApp pour bloquer ton créneau.
            </p>

            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              <a
                href="https://wa.me/22500000000?text=Bonjour%2C%20je%20souhaite%20prendre%20rendez-vous"
                target="_blank"
                rel="noreferrer"
                className="btn-primary text-base"
              >
                <MessageCircle className="h-4 w-4" />
                Réserver par WhatsApp
              </a>
            </div>

            <p className="mt-6 text-xs text-muted">
              Ou appelle-nous au{' '}
              <a href="tel:+22500000000" className="font-medium text-[rgb(var(--fg))] underline">
                +225 00 00 00 00
              </a>
            </p>
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
