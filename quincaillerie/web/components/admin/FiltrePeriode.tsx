'use client';
import { abidjanMonthRange, abidjanToday } from '@/lib/format';
import { PERIODE_LABELS, type Periode } from '@/lib/periode';

/**
 * Sélecteur de période, commun à tous les écrans datés.
 *
 * Les raccourcis répondent à la question courante (« et aujourd'hui ? »), la
 * plage libre à celle qu'on ne peut pas prévoir : un chantier livré sur deux
 * semaines, un mois arrêté à la date d'un inventaire, la période exacte d'un
 * contrôle. Chaque page choisit ses raccourcis ; « Dates » est toujours là.
 */
export function FiltrePeriode({
  options,
  periode,
  debut,
  fin,
  onPeriode,
  onDebut,
  onFin,
}: {
  options: readonly Periode[];
  periode: Periode;
  debut: string;
  fin: string;
  onPeriode: (p: Periode) => void;
  onDebut: (v: string) => void;
  onFin: (v: string) => void;
}) {
  const aujourdhui = abidjanToday();

  function choisir(p: Periode) {
    // Passer sur « Dates » sans plage saisie afficherait tout l'historique,
    // ce qui n'est jamais ce qu'on veut en cliquant dessus. On propose le mois
    // en cours, à retoucher.
    if (p === 'dates' && !debut && !fin) {
      onDebut(abidjanMonthRange().start.slice(0, 10));
      onFin(aujourdhui);
    }
    onPeriode(p);
  }

  return (
    <div className="flex flex-col gap-2 md:items-end">
      <div className="flex flex-wrap gap-1">
        {[...options, 'dates' as const].map((p) => (
          <button
            key={p}
            onClick={() => choisir(p)}
            className={periode === p ? 'btn-primary' : 'btn-outline'}
          >
            {PERIODE_LABELS[p]}
          </button>
        ))}
      </div>

      {periode === 'dates' && (
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="date"
            className="input w-auto"
            aria-label="Date de début"
            value={debut}
            max={aujourdhui}
            onChange={(e) => onDebut(e.target.value)}
          />
          <span className="text-[12px]" style={{ color: 'rgb(var(--muted))' }}>
            au
          </span>
          <input
            type="date"
            className="input w-auto"
            aria-label="Date de fin"
            value={fin}
            max={aujourdhui}
            onChange={(e) => onFin(e.target.value)}
          />
          {(debut || fin) && (
            <button
              onClick={() => {
                onDebut('');
                onFin('');
              }}
              className="btn-ghost"
            >
              Effacer
            </button>
          )}
        </div>
      )}
    </div>
  );
}
