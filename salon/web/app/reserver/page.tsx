import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { Navbar } from '@/components/Navbar';
import { Footer } from '@/components/Footer';
import { Wordmark } from '@/components/Wordmark';

export default function ReserverPage() {
  return (
    <>
      <Navbar />
      <main className="pt-32 pb-24 md:pt-40">
        <div className="mx-auto max-w-3xl px-6">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-[11px] uppercase tracking-[0.24em] mb-12"
            style={{ color: 'rgb(var(--muted))' }}
          >
            <ArrowLeft className="h-3 w-3" />
            Retour
          </Link>

          <div className="surface px-8 py-16 md:px-16 md:py-24 text-center">
            <Wordmark size="md" href={null} />

            <div className="eyebrow justify-center mt-12">Réservation</div>
            <h1 className="font-display mt-8 text-4xl font-medium leading-tight tracking-tight md:text-6xl">
              Bientôt en ligne.
            </h1>
            <p
              className="mx-auto mt-6 max-w-md text-[15px] leading-relaxed"
              style={{ color: 'rgb(var(--ink-soft))' }}
            >
              Le formulaire de réservation arrive très vite. Pour l&rsquo;instant,
              contactez-nous directement par WhatsApp ou téléphone — réponse
              en quelques minutes.
            </p>

            <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
              <a
                href="https://wa.me/22500000000?text=Bonjour%2C%20je%20souhaite%20prendre%20rendez-vous%20chez%20MUSE%20l%27atelier"
                target="_blank"
                rel="noreferrer"
                className="btn-primary"
              >
                Réserver par WhatsApp
              </a>
              <a href="tel:+22500000000" className="btn-outline">
                Nous appeler
              </a>
            </div>
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
