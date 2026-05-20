import Image from 'next/image';
import type { Staff } from '@/lib/types';

export function Stylists({ staff }: { staff: Staff[] }) {
  if (staff.length === 0) return null;

  return (
    <section id="maison" className="py-24 md:py-40">
      <div className="mx-auto max-w-7xl px-6">
        <div className="grid gap-10 md:grid-cols-12">
          <div className="md:col-span-5">
            <div className="eyebrow">La maison</div>
            <h2 className="font-display mt-6 text-4xl font-medium leading-tight tracking-tight md:text-6xl">
              Des mains
              <br />
              <span className="italic font-normal">expertes.</span>
            </h2>
          </div>
          <p
            className="max-w-md text-[15px] leading-relaxed md:col-span-6 md:col-start-7 md:self-end"
            style={{ color: 'rgb(var(--ink-soft))' }}
          >
            Une équipe restreinte et formée — pour que chaque cliente reçoive
            l&rsquo;attention qu&rsquo;elle mérite.
          </p>
        </div>

        <div className="mt-16 grid gap-px bg-[rgb(var(--line))] md:grid-cols-3">
          {staff.map((p, i) => (
            <article key={p.id} className="bg-[rgb(var(--bg))] p-8 md:p-10">
              <div className="relative aspect-[3/4] overflow-hidden">
                {p.photo_url ? (
                  <Image
                    src={p.photo_url}
                    alt={p.name}
                    fill
                    sizes="(max-width:768px) 100vw, 33vw"
                    className="object-cover"
                  />
                ) : (
                  <div className="img-bw absolute inset-0" />
                )}
              </div>
              <div className="mt-6 flex items-baseline justify-between">
                <span className="section-number">
                  {String(i + 1).padStart(2, '0')}
                </span>
                {p.role && (
                  <span
                    className="text-[10px] uppercase tracking-[0.24em]"
                    style={{ color: 'rgb(var(--muted))' }}
                  >
                    {p.role}
                  </span>
                )}
              </div>
              <h3 className="font-display mt-3 text-3xl font-medium tracking-tight">
                {p.name}
              </h3>
              {p.bio && (
                <p
                  className="mt-1 text-[12px] leading-relaxed"
                  style={{ color: 'rgb(var(--muted))' }}
                >
                  {p.bio}
                </p>
              )}
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
