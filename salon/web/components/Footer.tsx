import { MapPin, Phone, Mail, Clock } from 'lucide-react';

function InstagramIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <rect width="20" height="20" x="2" y="2" rx="5" />
      <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
      <line x1="17.5" x2="17.51" y1="6.5" y2="6.5" />
    </svg>
  );
}

function FacebookIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z" />
    </svg>
  );
}

const HOURS = [
  ['Lundi — Vendredi', '9h — 19h'],
  ['Samedi', '9h — 20h'],
  ['Dimanche', 'Fermé'],
];

export function Footer() {
  return (
    <footer
      id="contact"
      className="relative border-t border-[rgb(var(--border))]"
      style={{
        background:
          'linear-gradient(180deg, transparent 0%, rgba(196, 147, 42, 0.04) 100%)',
      }}
    >
      <div className="mx-auto max-w-6xl px-4 py-16 md:py-24">
        <div className="grid gap-10 md:grid-cols-4">
          {/* Brand */}
          <div className="md:col-span-2">
            <div className="font-display text-3xl font-semibold tracking-tight">
              Salon<span className="text-gold italic">.</span>
            </div>
            <p className="mt-3 max-w-sm text-sm text-muted">
              L'art de la beauté, révélé par nos mains. Atelier de coiffure
              premium au cœur d'Abidjan.
            </p>
            <div className="mt-6 flex items-center gap-2">
              <a
                href="https://instagram.com"
                target="_blank"
                rel="noreferrer"
                className="grid h-10 w-10 place-items-center rounded-full surface lift"
                aria-label="Instagram"
              >
                <InstagramIcon className="h-4 w-4" />
              </a>
              <a
                href="https://facebook.com"
                target="_blank"
                rel="noreferrer"
                className="grid h-10 w-10 place-items-center rounded-full surface lift"
                aria-label="Facebook"
              >
                <FacebookIcon className="h-4 w-4" />
              </a>
            </div>
          </div>

          {/* Hours */}
          <div>
            <h3 className="font-display text-lg font-semibold">
              <Clock className="inline h-4 w-4 mr-1.5 mb-0.5" style={{ color: '#d6a937' }} />
              Horaires
            </h3>
            <ul className="mt-4 space-y-2 text-sm">
              {HOURS.map(([d, h]) => (
                <li key={d} className="flex items-baseline justify-between gap-2">
                  <span className="text-muted">{d}</span>
                  <span className="font-mono text-xs">{h}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Contact */}
          <div>
            <h3 className="font-display text-lg font-semibold">Contact</h3>
            <ul className="mt-4 space-y-3 text-sm">
              <li className="flex items-start gap-2">
                <MapPin className="mt-0.5 h-4 w-4 shrink-0" style={{ color: '#d6a937' }} />
                <span className="text-muted">
                  Cocody, Abidjan
                  <br />
                  Côte d'Ivoire
                </span>
              </li>
              <li className="flex items-center gap-2">
                <Phone className="h-4 w-4 shrink-0" style={{ color: '#d6a937' }} />
                <a href="tel:+22500000000" className="text-muted hover:text-[rgb(var(--fg))]">
                  +225 00 00 00 00
                </a>
              </li>
              <li className="flex items-center gap-2">
                <Mail className="h-4 w-4 shrink-0" style={{ color: '#d6a937' }} />
                <a href="mailto:hello@salon.ci" className="text-muted hover:text-[rgb(var(--fg))]">
                  hello@salon.ci
                </a>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-12 flex flex-col items-center justify-between gap-3 border-t border-[rgb(var(--border))] pt-6 text-xs text-muted md:flex-row">
          <div>© {new Date().getFullYear()} Salon · Tous droits réservés.</div>
          <div className="flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: '#d6a937' }} />
            Made in Abidjan
          </div>
        </div>
      </div>
    </footer>
  );
}
