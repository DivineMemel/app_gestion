const ITEMS = [
  { tag: 'Tresses', n: '01' },
  { tag: 'Couleur', n: '02' },
  { tag: 'Manucure', n: '03' },
  { tag: 'Coupe', n: '04' },
  { tag: 'Mariage', n: '05' },
  { tag: 'Pédicure', n: '06' },
];

export function Gallery() {
  return (
    <section id="galerie" className="py-24 md:py-40">
      <div className="mx-auto max-w-7xl px-6">
        <div className="grid gap-10 md:grid-cols-12">
          <div className="md:col-span-5">
            <div className="eyebrow">Galerie</div>
            <h2 className="font-display mt-6 text-4xl font-medium leading-tight tracking-tight md:text-6xl">
              Quelques
              <br />
              <span className="italic font-normal">métamorphoses.</span>
            </h2>
          </div>
          <p
            className="max-w-md text-[15px] leading-relaxed md:col-span-6 md:col-start-7 md:self-end"
            style={{ color: 'rgb(var(--ink-soft))' }}
          >
            Les portraits parlent mieux que les mots. Voici un aperçu de notre
            travail récent — coiffures, manucures, instants signature.
          </p>
        </div>

        <div className="mt-16 grid grid-cols-2 gap-1 md:grid-cols-4">
          {ITEMS.map((it, i) => (
            <figure
              key={it.n}
              className={`group relative overflow-hidden ${
                i === 0 || i === 4 ? 'md:col-span-2 md:row-span-2 aspect-square' : 'aspect-[3/4]'
              }`}
            >
              <div className="img-bw absolute inset-0 transition-transform duration-700 group-hover:scale-105" />
              <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent" />
              <figcaption className="absolute inset-x-0 bottom-0 p-4 md:p-6">
                <div className="flex items-baseline justify-between text-white">
                  <span className="text-[10px] uppercase tracking-[0.28em] opacity-80">
                    N° {it.n}
                  </span>
                  <span className="text-[11px] uppercase tracking-[0.18em]">
                    {it.tag}
                  </span>
                </div>
              </figcaption>
            </figure>
          ))}
        </div>
      </div>
    </section>
  );
}
