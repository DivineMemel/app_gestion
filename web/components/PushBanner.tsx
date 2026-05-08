'use client';
import { useEffect, useState } from 'react';
import { Bell, BellOff, AlertTriangle } from 'lucide-react';
import {
  pushSupported,
  getSubscription,
  subscribePush,
  unsubscribePush,
} from '@/lib/push';

type State =
  | 'loading'
  | 'unsupported'
  | 'off'
  | 'on'
  | 'denied'
  | 'service-unavailable'
  | 'invalid-key'
  | 'error';

export function PushBanner() {
  const [state, setState] = useState<State>('loading');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      if (!pushSupported()) {
        setState('unsupported');
        return;
      }
      if (Notification.permission === 'denied') {
        setState('denied');
        return;
      }
      const sub = await getSubscription();
      setState(sub ? 'on' : 'off');
    })();
  }, []);

  async function enable() {
    setBusy(true);
    const result = await subscribePush();
    setBusy(false);
    setState(result === 'ok' ? 'on' : (result as State));
  }

  if (state === 'loading' || state === 'unsupported' || state === 'on') return null;

  if (state === 'denied') {
    return (
      <div className="card-3d flex items-center gap-3 px-3 py-2.5 text-xs">
        <BellOff className="h-4 w-4 text-red-500 dark:text-red-400" />
        <span className="text-red-700 dark:text-red-300">
          Notifications bloquées. Active-les dans les paramètres du navigateur.
        </span>
      </div>
    );
  }

  if (state === 'service-unavailable') {
    return (
      <div className="card-3d flex items-start gap-3 px-3 py-2.5 text-xs">
        <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0 text-amber-500" />
        <div className="text-amber-800 dark:text-amber-200">
          <div className="font-semibold">Push indisponible sur ce navigateur.</div>
          <div className="text-muted mt-0.5">
            Souvent : Safari/Firefox en local, ou un VPN/firewall qui bloque FCM.
            Une fois déployé sur Vercel (HTTPS) ça marche depuis ton tél.
          </div>
          <button onClick={enable} disabled={busy} className="btn-ghost mt-1.5 text-[11px] py-1">
            Réessayer
          </button>
        </div>
      </div>
    );
  }

  if (state === 'invalid-key') {
    return (
      <div className="card-3d flex items-start gap-3 px-3 py-2.5 text-xs">
        <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0 text-red-500" />
        <div className="text-red-700 dark:text-red-300">
          <div className="font-semibold">VAPID public key invalide.</div>
          <div className="text-muted mt-0.5">
            Vérifie <code>NEXT_PUBLIC_VAPID_PUBLIC_KEY</code> dans <code>.env.local</code> —
            elle doit correspondre à <code>VAPID_PUBLIC_KEY</code> côté worker.
          </div>
        </div>
      </div>
    );
  }

  if (state === 'error') {
    return (
      <div className="card-3d flex items-center gap-3 px-3 py-2.5 text-xs">
        <AlertTriangle className="h-4 w-4 text-red-500" />
        <span className="text-red-700 dark:text-red-300">
          Erreur d'activation des notifications. Voir la console.
        </span>
        <button onClick={enable} disabled={busy} className="btn-ghost ml-auto text-[11px] py-1">
          Réessayer
        </button>
      </div>
    );
  }

  return (
    <div className="card-3d relative flex items-center gap-3 px-3 py-2.5 overflow-hidden">
      <div className="absolute -top-12 -right-12 h-32 w-32 rounded-full bg-amber-400/30 blur-2xl pointer-events-none" />
      <div
        className="relative grid h-9 w-9 shrink-0 place-items-center rounded-xl text-white"
        style={{
          background: 'linear-gradient(135deg, #f59e0b 0%, #f97316 100%)',
          boxShadow:
            'inset 0 1px 0 rgba(255,255,255,0.25), 0 4px 14px -4px rgba(245,158,11,0.45)',
        }}
      >
        <Bell className="h-4 w-4" />
      </div>
      <div className="relative flex-1 text-xs">
        <div className="font-semibold">Active les alertes RDV</div>
        <div className="text-muted">Récap matin + rappel 30 min avant.</div>
      </div>
      <button disabled={busy} onClick={enable} className="btn-primary text-xs">
        {busy ? '…' : 'Activer'}
      </button>
    </div>
  );
}
