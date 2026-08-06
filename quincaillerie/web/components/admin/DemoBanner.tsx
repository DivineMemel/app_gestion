'use client';
import { useState } from 'react';
import { FlaskConical, RotateCcw } from 'lucide-react';
import { MODE_DEMO } from '@/lib/admin-db';
import { reinitialiserDemo } from '@/lib/demo-store';

/**
 * Signale que les données ne sont pas réelles.
 *
 * Volontairement impossible à masquer : dans un outil de caisse, confondre un
 * jeu de démonstration avec le vrai stock de la boutique coûterait cher.
 */
export function DemoBanner() {
  const [busy, setBusy] = useState(false);
  if (!MODE_DEMO) return null;

  function reinitialiser() {
    if (
      !window.confirm(
        'Remettre le jeu de démonstration à zéro ?\n\nLes ventes, commandes et corrections de stock saisies depuis le navigateur seront perdues.',
      )
    ) {
      return;
    }
    setBusy(true);
    reinitialiserDemo();
    window.location.reload();
  }

  return (
    <div
      className="mb-5 flex flex-wrap items-center gap-3 border px-4 py-2.5"
      style={{
        borderColor: 'rgb(var(--orange) / 0.55)',
        background: 'rgb(var(--orange) / 0.09)',
      }}
    >
      <FlaskConical
        className="h-4 w-4 shrink-0"
        strokeWidth={1.75}
        style={{ color: 'rgb(var(--orange))' }}
      />
      <div className="min-w-0 flex-1 text-[13px]">
        <strong>Mode démonstration.</strong> Aucun projet Supabase n’est
        configuré : les données sont un jeu d’essai stocké dans ce navigateur.
        Tout fonctionne — encaisser, chiffrer, réceptionner — mais rien n’est
        partagé entre appareils.
      </div>
      <button onClick={reinitialiser} className="btn-outline" disabled={busy}>
        <RotateCcw className="h-3.5 w-3.5" strokeWidth={1.75} />
        Réinitialiser
      </button>
    </div>
  );
}
