'use client';
import { useState } from 'react';
import { AUTRE } from '@/lib/unites';

/**
 * Liste déroulante d'unités avec échappatoire.
 *
 * On ne peut pas énumérer toutes les unités d'une quincaillerie — il y aura
 * toujours un « fût de 200 L » ou un « ml de joint ». Le select couvre le cas
 * courant en un geste ; « Autre… » bascule sur un champ libre pour le reste,
 * et la valeur saisie reste sélectionnée si on rouvre la fiche.
 */
export function ChampUnite({
  value,
  onChange,
  options,
  className = 'select',
  placeholder = 'Saisir l’unité…',
  id,
}: {
  value: string;
  onChange: (v: string) => void;
  options: string[];
  className?: string;
  placeholder?: string;
  id?: string;
}) {
  // Une valeur déjà enregistrée mais absente de la liste (fiche ancienne, ou
  // unité maison) doit rester visible : on démarre alors en mode libre.
  const horsListe = value !== '' && !options.includes(value);
  const [libre, setLibre] = useState(horsListe);

  if (libre) {
    return (
      <div className="flex gap-1">
        <input
          id={id}
          className="input"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          autoFocus
        />
        <button
          type="button"
          className="btn-outline px-2 text-[12px]"
          onClick={() => {
            setLibre(false);
            onChange(options[0] ?? '');
          }}
          title="Revenir à la liste"
        >
          Liste
        </button>
      </div>
    );
  }

  return (
    <select
      id={id}
      className={className}
      value={value}
      onChange={(e) => {
        if (e.target.value === AUTRE) {
          setLibre(true);
          onChange('');
          return;
        }
        onChange(e.target.value);
      }}
    >
      {/* Changer le facteur renouvelle les propositions. On garde le libellé
          courant dans la liste : le voir disparaître donnerait l'impression
          d'avoir perdu la saisie. */}
      {value !== '' && !options.includes(value) && (
        <option value={value}>{value}</option>
      )}
      {value === '' && <option value="">—</option>}
      {options.map((o) => (
        <option key={o} value={o}>
          {o}
        </option>
      ))}
      <option value={AUTRE}>Autre…</option>
    </select>
  );
}
