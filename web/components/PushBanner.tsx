'use client';
import { useEffect, useState } from 'react';
import {
  pushSupported,
  getSubscription,
  subscribePush,
  unsubscribePush,
} from '@/lib/push';

export function PushBanner() {
  const [state, setState] = useState<
    'loading' | 'unsupported' | 'off' | 'on' | 'denied' | 'error'
  >('loading');
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
    setState(result === 'ok' ? 'on' : (result as any));
  }

  async function disable() {
    setBusy(true);
    await unsubscribePush();
    setBusy(false);
    setState('off');
  }

  if (state === 'loading' || state === 'unsupported' || state === 'on') return null;

  if (state === 'denied') {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950 px-3 py-2 text-xs text-red-700 dark:text-red-200">
        Notifications bloquées. Autorise-les dans les paramètres du navigateur pour
        recevoir les alertes RDV.
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950 px-3 py-2 flex items-center gap-3">
      <div className="text-sm flex-1">
        <div className="font-medium text-amber-800 dark:text-amber-200">
          Active les alertes RDV
        </div>
        <div className="text-xs text-amber-700 dark:text-amber-300">
          Récap chaque matin + alerte 30 min avant chaque RDV.
        </div>
      </div>
      <button
        disabled={busy}
        onClick={enable}
        className="px-3 py-1.5 rounded-md bg-amber-600 text-white text-xs disabled:opacity-50"
      >
        {busy ? '…' : 'Activer'}
      </button>
    </div>
  );
}

export function PushToggleRow() {
  const [state, setState] = useState<'on' | 'off' | 'unknown'>('unknown');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!pushSupported()) return;
    getSubscription().then((s) => setState(s ? 'on' : 'off'));
  }, []);

  async function toggle() {
    setBusy(true);
    if (state === 'on') {
      await unsubscribePush();
      setState('off');
    } else {
      const r = await subscribePush();
      setState(r === 'ok' ? 'on' : 'off');
    }
    setBusy(false);
  }

  if (state === 'unknown') return null;
  return (
    <button
      disabled={busy}
      onClick={toggle}
      className="text-xs px-3 py-1.5 rounded-md bg-slate-200 dark:bg-slate-800"
    >
      Notifications : {state === 'on' ? 'ON' : 'OFF'}
    </button>
  );
}
