const TEAM = [
  { name: 'Awa', role: 'Coloriste senior', grad: 'linear-gradient(135deg, #c8932a, #ecda99)' },
  { name: 'Maïmouna', role: 'Spécialiste tresses', grad: 'linear-gradient(135deg, #2c1f10, #c8932a)' },
  { name: 'Nadia', role: 'Coiffeuse événementiel', grad: 'linear-gradient(135deg, #4a3520, #f5edcc)' },
];

export function Stylists() {
  return (
    <section id="equipe" className="relative py-20 md:py-32">
      <div className="mx-auto max-w-6xl px-4">
        <div className="mx-auto max-w-2xl text-center">
          <div className="eyebrow justify-center mb-5">L'équipe</div>
          <h2 className="font-display text-4xl font-medium tracking-tight md:text-5xl">
            Des mains <span className="text-gold italic">expertes</span>, un œil affûté.
          </h2>
        </div>

        <div className="mt-12 grid gap-6 sm:grid-cols-2 md:grid-cols-3 stagger">
          {TEAM.map((p) => (
            <div key={p.name} className="card-3d overflow-hidden lift">
              <div className="relative aspect-[4/5] overflow-hidden">
                <div className="absolute inset-0" style={{ background: p.grad }} />
                <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent" />
              </div>
              <div className="p-5">
                <div className="font-display text-2xl font-medium">{p.name}</div>
                <div className="text-sm text-muted">{p.role}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
