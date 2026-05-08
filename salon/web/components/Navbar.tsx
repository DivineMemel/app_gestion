'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Menu, X } from 'lucide-react';
import { Wordmark } from './Wordmark';

const NAV = [
  { href: '#secteurs', label: 'Secteurs' },
  { href: '#prestations', label: 'Prestations' },
  { href: '#galerie', label: 'Galerie' },
  { href: '#maison', label: 'La maison' },
  { href: '#contact', label: 'Contact' },
];

export function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <header
      className={`fixed inset-x-0 top-0 z-50 transition-all duration-500 ${
        scrolled ? 'glass py-3' : 'bg-transparent py-5'
      }`}
    >
      <div className="mx-auto flex max-w-7xl items-center justify-between px-6">
        <div className="flex-1">
          <button
            className="flex items-center gap-2 text-[11px] uppercase tracking-[0.24em] md:hidden"
            onClick={() => setOpen((o) => !o)}
            aria-label="Menu"
          >
            {open ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
            Menu
          </button>
          <nav className="hidden items-center gap-8 md:flex">
            {NAV.slice(0, 3).map((item) => (
              <a
                key={item.href}
                href={item.href}
                className="underline-anim text-[11px] uppercase tracking-[0.24em]"
                style={{ color: 'rgb(var(--ink))' }}
              >
                {item.label}
              </a>
            ))}
          </nav>
        </div>

        <div className="flex-shrink-0">
          <Wordmark size="md" />
        </div>

        <div className="flex flex-1 items-center justify-end gap-6">
          <nav className="hidden items-center gap-8 md:flex">
            {NAV.slice(3).map((item) => (
              <a
                key={item.href}
                href={item.href}
                className="underline-anim text-[11px] uppercase tracking-[0.24em]"
                style={{ color: 'rgb(var(--ink))' }}
              >
                {item.label}
              </a>
            ))}
          </nav>
          <Link href="/reserver" className="btn-primary hidden sm:inline-flex">
            Réserver
          </Link>
        </div>
      </div>

      {open && (
        <div className="md:hidden">
          <div className="mx-6 mt-3 surface px-2 py-2">
            {NAV.map((item) => (
              <a
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                className="block px-4 py-3 text-[11px] uppercase tracking-[0.24em] hover:bg-[rgb(var(--surface-2))]"
              >
                {item.label}
              </a>
            ))}
            <div className="hairline my-2" />
            <Link
              href="/reserver"
              onClick={() => setOpen(false)}
              className="btn-primary mx-2 mb-2 mt-2 w-[calc(100%-1rem)]"
            >
              Réserver
            </Link>
          </div>
        </div>
      )}
    </header>
  );
}
