'use client';
import { createContext, useContext } from 'react';
import {
  canSeeCosts,
  canWriteModule,
  type ModuleKey,
  type Role,
} from '@/lib/permissions';

/**
 * Identité et droits du membre connecté, injectés une fois par le layout admin
 * (résolus côté serveur). Évite qu'une dizaine de pages refassent chacune un
 * appel à /api/admin/me au montage.
 *
 * Sert uniquement à adapter l'affichage : la vraie barrière reste côté serveur.
 */
export type MemberCtx = { id: string; name: string; role: Role };

const Ctx = createContext<MemberCtx | null>(null);

export function MemberProvider({
  value,
  children,
}: {
  value: MemberCtx;
  children: React.ReactNode;
}) {
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useMember(): MemberCtx {
  const m = useContext(Ctx);
  if (!m) throw new Error('useMember doit être utilisé dans le layout admin.');
  return m;
}

/** Raccourci : « ce rôle peut-il écrire dans ce module ? » */
export function useCanWrite(module: ModuleKey): boolean {
  return canWriteModule(useMember().role, module);
}

/** Raccourci : « ce rôle voit-il les prix d'achat et les marges ? » */
export function useCanSeeCosts(): boolean {
  return canSeeCosts(useMember().role);
}
