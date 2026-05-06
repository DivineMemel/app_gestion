'use client';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import type { WhatsAppStatus } from '@/lib/types';

export default function SetupPage() {
  const [status, setStatus] = useState<WhatsAppStatus | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('whatsapp_status')
        .select('*')
        .eq('id', 1)
        .single();
      setStatus(data as WhatsAppStatus);
      setLoading(false);
    })();

    const channel = supabase
      .channel('wa-status')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'whatsapp_status' },
        (payload) => setStatus(payload.new as WhatsAppStatus),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  if (loading) return <div className="text-sm text-slate-500">Chargement…</div>;

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Connexion WhatsApp</h1>

      {status?.connected ? (
        <div className="rounded-xl border border-emerald-300 bg-emerald-50 dark:bg-emerald-950 dark:border-emerald-800 p-4">
          <div className="font-medium text-emerald-700 dark:text-emerald-200">
            ✓ Connecté
          </div>
          {status.phone && (
            <div className="text-sm text-emerald-600 dark:text-emerald-300 mt-1">
              Numéro lié : {status.phone}
            </div>
          )}
        </div>
      ) : status?.qr_code ? (
        <div className="space-y-3">
          <p className="text-sm text-slate-600 dark:text-slate-300">
            1. Ouvre WhatsApp sur le téléphone d'Eric.
            <br />
            2. Va dans <strong>Paramètres → Appareils liés → Lier un appareil</strong>.
            <br />
            3. Scanne ce QR code :
          </p>
          <div className="rounded-xl bg-white p-4 inline-block">
            <img src={status.qr_code} alt="QR code WhatsApp" className="w-64 h-64" />
          </div>
          <p className="text-xs text-slate-500">
            Le QR change toutes les 30 secondes — il se rafraîchit ici automatiquement.
          </p>
        </div>
      ) : (
        <div className="rounded-xl border border-amber-300 bg-amber-50 dark:bg-amber-950 dark:border-amber-800 p-4 text-sm">
          <div className="font-medium text-amber-700 dark:text-amber-200">
            En attente du worker…
          </div>
          <p className="text-amber-600 dark:text-amber-300 mt-1">
            Démarre le worker (<code>cd worker && npm run dev</code>) pour voir le QR.
          </p>
        </div>
      )}
    </div>
  );
}
