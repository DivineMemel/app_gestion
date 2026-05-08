'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Menu, X, Calendar } from 'lucide-react';

const NAV = [
  { href: '#services', label: 'Services' },
  { href: '#galerie', label: 'Galerie' },
  { href: '#equipe', label: 'Équipe' },
  { href: '#contact', label: 'Contact' },
];

export function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 16);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <header
      className={`fixed inset-x-0 top-0 z-50 transition-all ${
        scrolled
          ? 'glass border-b border-[rgb(var(--border))] py-2.5'
          : 'bg-transparent py-4'
      }`}
    >
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4">
        <Link href="/" className="flex items-center gap-2">
          <span
            className="font-display text-2xl font-semibold leading-none tracking-tight"
            style={{ color: 'rgb(var(--fg))' }}
          >
            Salon
          </span>
          <span
            className="font-display text-2xl font-semibold leading-none italic text-gold"
          >
            .
          </span>
        </Link>

        <nav className="hidden items-center gap-1 md:flex">
          {NAV.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className="px-3 py-2 text-sm text-muted transition-colors hover:text-[rgb(var(--fg))]"
            >
              {item.label}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <Link href="/reserver" className="btn-primary hidden sm:inline-flex">
            <Calendar className="h-4 w-4" />
            Réserver
          </Link>
          <button
            className="btn-ghost h-10 w-10 p-0 md:hidden"
            onClick={() => setOpen((o) => !o)}
            aria-label="Menu"
          >
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {open && (
        <div className="md:hidden">
          <div className="mx-4 mt-2 glass rounded-2xl p-2">
            {NAV.map((item) => (
              <a
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                className="block rounded-xl px-4 py-3 text-sm hover:bg-[rgb(var(--surface-2))]"
              >
                {item.label}
              </a>
            ))}
            <Link
              href="/reserver"
              onClick={() => setOpen(false)}
              className="btn-primary mt-1 w-full"
            >
              <Calendar className="h-4 w-4" />
              Réserver
            </Link>
          </div>
        </div>
      )}
    </header>
  );
}
