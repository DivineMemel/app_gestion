import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { Navbar } from '@/components/Navbar';
import { Footer } from '@/components/Footer';
import { ReservationWizard } from '@/components/reserver/ReservationWizard';

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

          <div className="eyebrow">Réservation</div>
          <h1 className="font-display mt-4 text-4xl font-medium leading-tight tracking-tight md:text-6xl">
            Réservez votre <span className="italic font-normal">moment</span>.
          </h1>
          <p
            className="mt-4 max-w-xl text-[15px] leading-relaxed"
            style={{ color: 'rgb(var(--ink-soft))' }}
          >
            Choisissez votre prestation, votre créneau, laissez-nous vos
            coordonnées. Une confirmation arrive par WhatsApp dans la foulée.
          </p>

          <div className="hairline my-10" />

          <ReservationWizard />
        </div>
      </main>
      <Footer />
    </>
  );
}
