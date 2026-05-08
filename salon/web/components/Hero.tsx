import Link from 'next/link';

export function Hero() {
  return (
    <section className="relative min-h-[92vh] grain pt-32 pb-20 md:pt-44">
      <div className="mx-auto max-w-7xl px-6">
        <div className="grid gap-16 md:grid-cols-12 md:items-center md:gap-12">
          {/* Left — éditorial */}
          <div className="md:col-span-7 stagger">
            <div className="eyebrow">Atelier · Abidjan · Depuis 2024</div>

            <h1
              className="font-display mt-8 text-[14vw] font-medium leading-[0.92] tracking-[-0.02em] md:text-[7.5rem]"
              style={{ color: 'rgb(var(--ink))' }}
            >
              L&rsquo;élégance,
              <br />
              <span className="italic font-normal">comme une</span>
              <br />
              signature.
            </h1>

            <p
              className="mt-10 max-w-md text-[15px] leading-relaxed"
              style={{ color: 'rgb(var(--ink-soft))' }}
            >
              MUSE l&rsquo;atelier accompagne celles qui savent ce qu&rsquo;elles
              veulent. Coiffure, onglerie et soins — sous un même toit, avec la
              même exigence.
            </p>

            <div className="mt-10 flex flex-wrap items-center gap-3">
              <Link href="/reserver" className="btn-primary">
                Prendre rendez-vous
              </Link>
              <a href="#secteurs" className="btn-outline">
                Découvrir
              </a>
            </div>
          </div>

          {/* Right — visuel B&W */}
          <div className="md:col-span-5">
            <figure className="relative animate-fade-up">
              <div className="img-bw relative aspect-[3/4] overflow-hidden">
                {/* Logo MUSE en watermark */}
                <div className="absolute inset-0 flex items-center justify-center opacity-15">
                  <div className="text-center text-white">
                    <div className="font-display text-[18vw] font-medium leading-none tracking-[0.06em] md:text-[7rem]">
                      MUSE
                    </div>
                    <div className="mt-2 text-[10px] uppercase tracking-[0.4em]">
                      L&rsquo;atelier
                    </div>
                  </div>
                </div>
              </div>
              <figcaption
                className="mt-4 flex items-center justify-between text-[10px] uppercase tracking-[0.24em]"
                style={{ color: 'rgb(var(--muted))' }}
              >
                <span>N° 01 — Atelier</span>
                <span>Abidjan, CI</span>
              </figcaption>
            </figure>
          </div>
        </div>

        {/* Marquee discret en bas */}
        <div
          className="mt-20 flex flex-wrap items-center justify-between gap-6 border-t pt-8 text-[10px] uppercase tracking-[0.24em] md:mt-32"
          style={{ borderColor: 'rgb(var(--line))', color: 'rgb(var(--muted))' }}
        >
          <span>Coiffure</span>
          <span>·</span>
          <span>Onglerie</span>
          <span>·</span>
          <span>Soins</span>
          <span>·</span>
          <span className="hidden md:inline">Sur rendez-vous</span>
        </div>
      </div>
    </section>
  );
}
