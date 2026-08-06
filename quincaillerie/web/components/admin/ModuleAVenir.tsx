import { Construction } from 'lucide-react';
import { PageHeader } from '@/components/admin/PageHeader';

/**
 * Page d'attente d'un module non encore implémenté.
 *
 * Volontairement explicite sur ce qui manque : mieux vaut une page qui dit
 * « pas encore fait, voilà ce qui viendra » qu'un lien mort dans le menu.
 */
export function ModuleAVenir({
  titre,
  resume,
  contenu,
}: {
  titre: string;
  resume: string;
  contenu: string[];
}) {
  return (
    <>
      <PageHeader title={titre} subtitle={resume} />
      <div className="surface p-8">
        <div
          className="inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-industrial"
          style={{ color: 'rgb(var(--accent))' }}
        >
          <Construction className="h-4 w-4" strokeWidth={1.75} />
          Module à venir
        </div>
        <p className="mt-3 max-w-xl text-sm" style={{ color: 'rgb(var(--ink-soft))' }}>
          Le schéma de base de données de ce module est déjà en place — il ne
          manque que l’écran. Ce qui est prévu :
        </p>
        <ul className="mt-4 space-y-1.5">
          {contenu.map((c) => (
            <li key={c} className="flex gap-2 text-sm">
              <span style={{ color: 'rgb(var(--accent))' }}>—</span>
              <span style={{ color: 'rgb(var(--ink-soft))' }}>{c}</span>
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}
