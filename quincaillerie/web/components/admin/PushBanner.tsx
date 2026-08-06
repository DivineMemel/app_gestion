'use client';
import { useEffect, useState } from 'react';
import { Bell, X } from 'lucide-react';

// Conversion de la clé VAPID (base64url) vers le BufferSource attendu par
// PushManager.subscribe. On renvoie l'ArrayBuffer sous-jacent : le type
// générique de Uint8Array (ArrayBuffer vs SharedArrayBuffer) varie selon la
// version de TypeScript et ne satisfait pas toujours BufferSource.
function vapidKey(base64: string): ArrayBuffer {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(b64);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes.buffer as ArrayBuffer;
}

const MASQUE = 'qc_push_masque';

/**
 * Propose d'activer les alertes (nouvelle vente, commande en ligne, stock bas).
 *
 * Ne s'affiche jamais tant que le patron n'a pas d'intérêt à cliquer : pas de
 * clé VAPID configurée, permission déjà accordée ou refusée, ou bandeau
 * masqué → rien.
 */
export function PushBanner() {
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY) return;
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
    if (Notification.permission !== 'default') return;
    if (localStorage.getItem(MASQUE) === '1') return;
    setVisible(true);
  }, []);

  async function activer() {
    setBusy(true);
    setErreur(null);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        setVisible(false);
        return;
      }

      const reg = await navigator.serviceWorker.register('/sw.js');
      await navigator.serviceWorker.ready;

      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: vapidKey(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!),
      });

      const res = await fetch('/api/admin/push/subscribe', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(sub.toJSON()),
      });
      if (!res.ok) throw new Error('enregistrement refusé');

      setVisible(false);
    } catch (e) {
      setErreur(
        e instanceof Error ? e.message : 'Activation impossible sur cet appareil.',
      );
    } finally {
      setBusy(false);
    }
  }

  function masquer() {
    localStorage.setItem(MASQUE, '1');
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <div
      className="mb-6 flex flex-wrap items-center gap-3 border p-4"
      style={{
        borderColor: 'rgb(var(--accent) / 0.45)',
        background: 'rgb(var(--accent) / 0.06)',
      }}
    >
      <Bell className="h-5 w-5 shrink-0" strokeWidth={1.75} style={{ color: 'rgb(var(--accent))' }} />
      <div className="min-w-0 flex-1">
        <div className="text-[14px] font-semibold">Activer les alertes</div>
        <div className="text-[13px]" style={{ color: 'rgb(var(--muted))' }}>
          Nouvelle vente, commande en ligne et stock bas, même app fermée.
          {erreur && (
            <span style={{ color: 'rgb(var(--danger))' }}> — {erreur}</span>
          )}
        </div>
      </div>
      <button onClick={activer} className="btn-primary" disabled={busy}>
        {busy ? 'Activation…' : 'Activer'}
      </button>
      <button onClick={masquer} className="btn-ghost" aria-label="Masquer">
        <X className="h-4 w-4" strokeWidth={1.75} />
      </button>
    </div>
  );
}
