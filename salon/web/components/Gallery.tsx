const ITEMS = [
  { tag: 'Tresses', grad: 'linear-gradient(135deg, #2c1f10, #c8932a)' },
  { tag: 'Couleur', grad: 'linear-gradient(135deg, #4a3520, #ecda99)' },
  { tag: 'Soin', grad: 'linear-gradient(135deg, #1a1410, #a87623)' },
  { tag: 'Coupe', grad: 'linear-gradient(135deg, #3d2a17, #d6a937)' },
  { tag: 'Mariage', grad: 'linear-gradient(135deg, #2c1f10, #f5edcc)' },
  { tag: 'Lissage', grad: 'linear-gradient(135deg, #5b3e1c, #ecda99)' },
];

export function Gallery() {
  return (
    <section id="galerie" className="relative py-20 md:py-32">
      <div className="mx-auto max-w-6xl px-4">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="eyebrow mb-4">Notre galerie</div>
            <h2 className="font-display text-4xl font-medium tracking-tight md:text-5xl">
              Quelques <span className="text-gold italic">métamorphoses</span>
            </h2>
          </div>
          <p className="max-w-md text-sm text-muted">
            Les portraits parlent mieux que les mots. Voici un aperçu de notre
            travail récent.
          </p>
        </div>

        <div className="mt-12 grid grid-cols-2 gap-3 md:grid-cols-3 md:gap-5">
          {ITEMS.map((it, i) => (
            <div
              key={i}
              className={`group relative overflow-hidden rounded-2xl card-3d ${
                i === 0 ? 'md:col-span-2 md:row-span-2 aspect-square' : 'aspect-[3/4]'
              }`}
            >
              <div
                className="absolute inset-0 transition-transform duration-700 group-hover:scale-110"
                style={{ background: it.grad }}
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
              <div className="absolute bottom-0 left-0 right-0 p-4 md:p-5">
                <span className="chip text-white" style={{ background: 'rgba(255,255,255,0.18)', backdropFilter: 'blur(8px)' }}>
                  {it.tag}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
