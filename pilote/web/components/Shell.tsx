'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import {
  Inbox,
  Calendar,
  Tags,
  Smartphone,
  Sun,
  Moon,
  Sparkles,
  Users,
  Settings,
} from 'lucide-react';
import { supabase, uniqueChannel } from '@/lib/supabase';

const NAV = [
  { href: '/', label: 'Inbox', icon: Inbox },
  { href: '/calendar', label: 'Agenda', icon: Calendar },
  { href: '/clients', label: 'Clients', icon: Users },
  { href: '/categories', label: 'Catégories', icon: Tags },
  { href: '/settings', label: 'Réglages', icon: Settings },
  { href: '/setup', label: 'WhatsApp', icon: Smartphone },
];

const MOBILE_NAV = [
  { href: '/', label: 'Inbox', icon: Inbox },
  { href: '/calendar', label: 'Agenda', icon: Calendar },
  { href: '/clients', label: 'Clients', icon: Users },
  { href: '/settings', label: 'Réglages', icon: Settings },
];

function ThemeToggle() {
  const [dark, setDark] = useState(false);
  useEffect(() => {
    setDark(document.documentElement.classList.contains('dark'));
  }, []);
  function toggle() {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle('dark', next);
    try {
      localStorage.setItem('theme', next ? 'dark' : 'light');
    } catch {}
  }
  return (
    <button
      onClick={toggle}
      className="btn-ghost h-9 w-9 p-0"
      aria-label="Theme"
    >
      {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </button>
  );
}

function ConnectionPill() {
  const [connected, setConnected] = useState<boolean | null>(null);
  useEffect(() => {
    let active = true;
    (async () => {
      const { data } = await supabase
        .from('whatsapp_status')
        .select('connected')
        .eq('id', 1)
        .maybeSingle();
      if (active) setConnected(!!data?.connected);
    })();
    const ch = supabase
      .channel(uniqueChannel('shell-status'))
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'whatsapp_status' },
        (payload) => setConnected(!!(payload.new as any)?.connected),
      )
      .subscribe();
    return () => {
      active = false;
      supabase.removeChannel(ch);
    };
  }, []);
  if (connected === null) return null;
  return (
    <Link
      href="/setup"
      className="inline-flex items-center gap-1.5 rounded-full glass px-2.5 py-1 text-xs lift"
    >
      <span
        className={`relative h-1.5 w-1.5 rounded-full ${
          connected ? 'bg-emerald-500' : 'bg-red-500'
        }`}
      >
        {connected && (
          <span className="absolute inset-0 rounded-full bg-emerald-500 animate-ping opacity-50" />
        )}
      </span>
      <span className="text-muted">
        {connected ? 'Connecté' : 'Déconnecté'}
      </span>
    </Link>
  );
}

function Logo({ size = 8 }: { size?: 7 | 8 }) {
  const dim = size === 8 ? 'h-8 w-8' : 'h-7 w-7';
  const icon = size === 8 ? 'h-4 w-4' : 'h-3.5 w-3.5';
  return (
    <div className="relative">
      <div
        className={`${dim} grid place-items-center rounded-xl text-white relative z-10`}
        style={{
          background: 'linear-gradient(135deg, #6366f1 0%, #a855f7 50%, #ec4899 100%)',
          boxShadow:
            'inset 0 1px 0 rgba(255,255,255,0.3), 0 6px 20px -4px rgba(99, 102, 241, 0.55)',
        }}
      >
        <Sparkles className={icon} />
      </div>
      <div
        className={`${dim} absolute inset-0 rounded-xl blur-md opacity-60`}
        style={{
          background: 'linear-gradient(135deg, #6366f1 0%, #a855f7 50%, #ec4899 100%)',
        }}
      />
    </div>
  );
}

export function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="md:flex md:min-h-dvh">
      {/* Desktop sidebar */}
      <aside className="hidden md:flex md:w-64 md:flex-col md:border-r md:border-[rgb(var(--border))] md:px-3 md:py-4 relative">
        <div className="absolute top-0 left-0 right-0 h-32 pointer-events-none opacity-60"
          style={{
            background:
              'radial-gradient(50% 100% at 50% 0%, rgba(99, 102, 241, 0.20), transparent 70%)',
          }}
        />
        <Link href="/" className="relative flex items-center gap-2.5 px-2 py-2">
          <Logo size={8} />
          <div className="leading-tight">
            <div className="font-semibold tracking-tight text-[15px]">Pilote</div>
            <div className="text-[10px] text-muted -mt-0.5">WhatsApp · IA</div>
          </div>
        </Link>
        <nav className="relative mt-5 space-y-1">
          {NAV.map(({ href, label, icon: Icon }) => {
            const active =
              href === '/' ? pathname === '/' : pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                className={`group relative flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm transition-all ${
                  active
                    ? 'text-white font-medium'
                    : 'text-muted hover:text-[rgb(var(--fg))] hover:bg-[rgb(var(--surface-2))]'
                }`}
              >
                {active && (
                  <>
                    <span
                      className="absolute inset-0 rounded-xl"
                      style={{
                        background:
                          'linear-gradient(135deg, rgb(var(--primary)) 0%, rgb(168 85 247) 50%, rgb(236 72 153) 100%)',
                        boxShadow:
                          'inset 0 1px 0 rgba(255,255,255,0.18), 0 6px 18px -4px rgba(99,102,241,0.45)',
                      }}
                    />
                    <span
                      className="absolute -inset-1 rounded-xl blur-md -z-10 opacity-50"
                      style={{
                        background:
                          'linear-gradient(135deg, rgb(99 102 241) 0%, rgb(168 85 247) 50%, rgb(236 72 153) 100%)',
                      }}
                    />
                  </>
                )}
                <Icon className="relative h-4 w-4" />
                <span className="relative">{label}</span>
              </Link>
            );
          })}
        </nav>
        <div className="relative mt-auto flex items-center justify-between px-2 pt-3">
          <ConnectionPill />
          <ThemeToggle />
        </div>
      </aside>

      {/* Main column */}
      <div className="flex min-h-dvh flex-1 flex-col">
        {/* Mobile header */}
        <header className="md:hidden sticky top-0 z-30 glass-strong border-b border-[rgb(var(--border))]">
          <div className="flex items-center gap-3 px-4 py-3">
            <Link href="/" className="flex items-center gap-2">
              <Logo size={7} />
              <div className="font-semibold tracking-tight">Pilote</div>
            </Link>
            <div className="ml-auto flex items-center gap-2">
              <ConnectionPill />
              <ThemeToggle />
            </div>
          </div>
        </header>

        <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-5 pb-28 md:pb-8">
          {children}
        </main>

        {/* Mobile bottom nav — floating dock */}
        <nav
          className="md:hidden fixed bottom-3 left-1/2 -translate-x-1/2 z-30"
          style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
        >
          <div className="glass-strong rounded-2xl p-1.5 flex items-center gap-1 shadow-[0_12px_40px_-8px_rgba(15,23,42,0.25)] dark:shadow-[0_12px_40px_-8px_rgba(0,0,0,0.6)]">
            {MOBILE_NAV.map(({ href, label, icon: Icon }) => {
              const active =
                href === '/' ? pathname === '/' : pathname.startsWith(href);
              return (
                <Link
                  key={href}
                  href={href}
                  className={`relative flex items-center gap-1.5 px-3 py-2 rounded-xl text-[11.5px] font-medium transition-all ${
                    active ? 'text-white' : 'text-muted hover:text-[rgb(var(--fg))]'
                  }`}
                >
                  {active && (
                    <span
                      className="absolute inset-0 rounded-xl"
                      style={{
                        background:
                          'linear-gradient(135deg, rgb(var(--primary)) 0%, rgb(168 85 247) 50%, rgb(236 72 153) 100%)',
                        boxShadow:
                          'inset 0 1px 0 rgba(255,255,255,0.18), 0 6px 18px -4px rgba(99,102,241,0.45)',
                      }}
                    />
                  )}
                  <Icon className="relative h-4 w-4" />
                  <span className="relative">{label}</span>
                </Link>
              );
            })}
          </div>
        </nav>
      </div>
    </div>
  );
}
