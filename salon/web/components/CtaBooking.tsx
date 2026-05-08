import Link from 'next/link';

export function CtaBooking() {
  return (
    <section className="py-24 md:py-40">
      <div className="mx-auto max-w-5xl px-6 text-center">
        <div className="eyebrow justify-center">Réserver</div>
        <h2 className="font-display mt-8 text-5xl font-medium leading-[1.05] tracking-tight md:text-7xl">
          Le rendez-vous
          <br />
          <span className="italic font-normal">est un art.</span>
        </h2>
        <p
          className="mx-auto mt-8 max-w-md text-[15px] leading-relaxed"
          style={{ color: 'rgb(var(--ink-soft))' }}
        >
          Choisissez votre prestation et l&rsquo;heure qui vous convient.
          Confirmation instantanée, rappel la veille.
        </p>
        <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
          <Link href="/reserver" className="btn-primary">
            Prendre rendez-vous
          </Link>
          <a href="tel:+22500000000" className="btn-outline">
            Nous appeler
          </a>
        </div>
      </div>
    </section>
  );
}
