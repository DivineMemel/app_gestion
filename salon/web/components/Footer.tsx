import { MapPin, Phone, Mail } from 'lucide-react';
import { Wordmark } from './Wordmark';

function InstagramIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <rect width="20" height="20" x="2" y="2" rx="5" />
      <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
      <line x1="17.5" x2="17.51" y1="6.5" y2="6.5" />
    </svg>
  );
}

function WhatsAppIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.245 2.248 3.481 5.236 3.48 8.414-.003 6.557-5.338 11.892-11.893 11.892-1.99-.001-3.951-.5-5.688-1.448L.057 24zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884-.001 2.225.651 3.891 1.746 5.634l-.999 3.648 3.742-.981zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.611-.916-2.206-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.71.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.414z" />
    </svg>
  );
}

const HOURS = [
  ['Lundi — Vendredi', '09:00 — 19:00'],
  ['Samedi', '09:00 — 20:00'],
  ['Dimanche', 'Sur rendez-vous'],
];

export function Footer() {
  return (
    <footer
      id="contact"
      className="border-t pt-24 md:pt-32"
      style={{ borderColor: 'rgb(var(--line))' }}
    >
      <div className="mx-auto max-w-7xl px-6">
        <div className="grid gap-12 md:grid-cols-12">
          {/* Wordmark + tagline */}
          <div className="md:col-span-5">
            <Wordmark size="lg" href={null} />
            <p
              className="mt-8 max-w-xs text-[14px] leading-relaxed"
              style={{ color: 'rgb(var(--ink-soft))' }}
            >
              Une maison signature dédiée à la beauté du geste, à l&rsquo;exigence
              du détail.
            </p>
            <div className="mt-8 flex items-center gap-3">
              <a
                href="https://instagram.com"
                target="_blank"
                rel="noreferrer"
                aria-label="Instagram"
                className="grid h-10 w-10 place-items-center border transition-colors hover:bg-[rgb(var(--ink))] hover:text-[rgb(var(--bg))]"
                style={{ borderColor: 'rgb(var(--ink))' }}
              >
                <InstagramIcon className="h-4 w-4" />
              </a>
              <a
                href="https://wa.me/22500000000"
                target="_blank"
                rel="noreferrer"
                aria-label="WhatsApp"
                className="grid h-10 w-10 place-items-center border transition-colors hover:bg-[rgb(var(--ink))] hover:text-[rgb(var(--bg))]"
                style={{ borderColor: 'rgb(var(--ink))' }}
              >
                <WhatsAppIcon className="h-4 w-4" />
              </a>
            </div>
          </div>

          {/* Horaires */}
          <div className="md:col-span-3">
            <div
              className="text-[10px] uppercase tracking-[0.28em] mb-5"
              style={{ color: 'rgb(var(--muted))' }}
            >
              Horaires
            </div>
            <ul className="space-y-3 text-[13px]">
              {HOURS.map(([d, h]) => (
                <li key={d} className="flex items-baseline justify-between gap-3">
                  <span style={{ color: 'rgb(var(--ink-soft))' }}>{d}</span>
                  <span className="tabular-nums" style={{ color: 'rgb(var(--ink))' }}>
                    {h}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          {/* Contact */}
          <div className="md:col-span-4">
            <div
              className="text-[10px] uppercase tracking-[0.28em] mb-5"
              style={{ color: 'rgb(var(--muted))' }}
            >
              Contact
            </div>
            <ul className="space-y-3 text-[13px]">
              <li className="flex items-start gap-3">
                <MapPin className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={1.25} />
                <span style={{ color: 'rgb(var(--ink-soft))' }}>
                  Cocody, Abidjan
                  <br />
                  Côte d&rsquo;Ivoire
                </span>
              </li>
              <li className="flex items-center gap-3">
                <Phone className="h-4 w-4 shrink-0" strokeWidth={1.25} />
                <a
                  href="tel:+22500000000"
                  className="underline-anim"
                  style={{ color: 'rgb(var(--ink))' }}
                >
                  +225 00 00 00 00
                </a>
              </li>
              <li className="flex items-center gap-3">
                <Mail className="h-4 w-4 shrink-0" strokeWidth={1.25} />
                <a
                  href="mailto:hello@museatelier.ci"
                  className="underline-anim"
                  style={{ color: 'rgb(var(--ink))' }}
                >
                  hello@museatelier.ci
                </a>
              </li>
            </ul>
          </div>
        </div>

        <div
          className="mt-20 flex flex-col items-center justify-between gap-3 border-t py-8 text-[10px] uppercase tracking-[0.24em] md:flex-row"
          style={{ borderColor: 'rgb(var(--line))', color: 'rgb(var(--muted))' }}
        >
          <div>© {new Date().getFullYear()} MUSE l&rsquo;atelier — Tous droits réservés</div>
          <div>Made in Abidjan</div>
        </div>
      </div>
    </footer>
  );
}
