'use client';
import { useEffect, useState } from 'react';
import { CheckCircle2, Smartphone, Loader2, LogOut } from 'lucide-react';
import { supabase, uniqueChannel } from '@/lib/supabase';
import type { WhatsAppStatus } from '@/lib/types';

export default function SetupPage() {
  const [status, setStatus] = useState<WhatsAppStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [disconnecting, setDisconnecting] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('whatsapp_status')
        .select('*')
        .eq('id', 1)
        .maybeSingle();
      setStatus(data as WhatsAppStatus | null);
      setLoading(false);
    })();

    const channel = supabase
      .channel(uniqueChannel('wa-status'))
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'whatsapp_status' },
        (payload) => {
          setStatus(payload.new as WhatsAppStatus);
          if (!(payload.new as WhatsAppStatus).disconnect_requested) {
            setDisconnecting(false);
          }
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  async function disconnect() {
    if (!confirm('Déconnecter WhatsApp ? Il faudra re-scanner le QR pour reconnecter.')) {
      return;
    }
    setDisconnecting(true);
    await supabase
      .from('whatsapp_status')
      .update({ disconnect_requested: true })
      .eq('id', 1);
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">WhatsApp</h1>
        <p className="text-sm text-muted">
          Connecte le compte WhatsApp Business pour recevoir les messages.
        </p>
      </header>

      {loading && (
        <div className="surface flex items-center gap-3 rounded-xl px-4 py-3">
          <Loader2 className="h-4 w-4 animate-spin text-muted" />
          <span className="text-sm text-muted">Chargement…</span>
        </div>
      )}

      {!loading && status?.connected && (
        <div className="space-y-4">
          <div className="surface relative overflow-hidden rounded-2xl p-6">
            <div className="absolute -right-16 -top-16 h-48 w-48 rounded-full bg-emerald-500/10 blur-2xl" />
            <div className="relative flex items-start gap-4">
              <div className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                <CheckCircle2 className="h-6 w-6" />
              </div>
              <div className="flex-1">
                <div className="text-lg font-semibold">Connecté</div>
                <p className="mt-0.5 text-sm text-muted">
                  Les messages WhatsApp sont reçus et triés en temps réel.
                </p>
                {status.phone && (
                  <div className="mt-3 inline-flex items-center gap-2 rounded-lg surface-2 px-3 py-1.5 text-sm">
                    <Smartphone className="h-3.5 w-3.5 text-muted" />
                    <span className="font-mono">+{status.phone}</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          <button
            onClick={disconnect}
            disabled={disconnecting}
            className="inline-flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm font-medium text-red-700 transition-colors hover:bg-red-100 disabled:opacity-50 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300 dark:hover:bg-red-950/50"
          >
            {disconnecting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <LogOut className="h-4 w-4" />
            )}
            {disconnecting ? 'Déconnexion en cours…' : 'Se déconnecter'}
          </button>
        </div>
      )}

      {!loading && !status?.connected && status?.qr_code && (
        <div className="grid gap-6 md:grid-cols-[auto,1fr]">
          <div className="surface mx-auto rounded-2xl p-3">
            <div className="rounded-xl bg-white p-3 pulse-ring">
              <img
                src={status.qr_code}
                alt="QR code WhatsApp"
                className="h-64 w-64"
              />
            </div>
          </div>
          <ol className="space-y-3 text-sm">
            {[
              'Ouvre WhatsApp sur le téléphone',
              'Va dans Paramètres → Appareils liés',
              'Touche "Lier un appareil"',
              'Scanne ce QR code',
            ].map((step, i) => (
              <li key={i} className="flex gap-3">
                <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-[rgb(var(--primary))] text-xs font-semibold text-[rgb(var(--primary-fg))]">
                  {i + 1}
                </span>
                <span className="pt-0.5">{step}</span>
              </li>
            ))}
            <li className="text-xs text-muted">
              Le QR change toutes les 30 secondes — il se rafraîchit automatiquement
              ici.
            </li>
          </ol>
        </div>
      )}

      {!loading && !status?.connected && !status?.qr_code && (
        <div className="surface flex items-start gap-3 rounded-xl p-4">
          <Loader2 className="mt-0.5 h-4 w-4 animate-spin text-muted" />
          <div>
            <div className="text-sm font-medium">En attente du worker…</div>
            <p className="mt-0.5 text-xs text-muted">
              Démarre le worker (<code className="rounded surface-2 px-1.5 py-0.5">cd worker && npm run dev</code>)
              pour générer le QR.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
