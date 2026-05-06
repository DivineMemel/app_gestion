import {
  proto,
  initAuthCreds,
  BufferJSON,
  AuthenticationCreds,
  AuthenticationState,
  SignalDataTypeMap,
} from '@whiskeysockets/baileys';
import { db } from './db.js';

/**
 * Stockage de l'état d'auth Baileys dans Supabase (table wa_auth_state).
 * Permet au worker de redémarrer (ou de migrer d'un host à un autre)
 * sans avoir à re-scanner le QR.
 */
export async function useSupabaseAuthState(): Promise<{
  state: AuthenticationState;
  saveCreds: () => Promise<void>;
}> {
  const writeData = async (key: string, value: unknown) => {
    const serialized = JSON.parse(JSON.stringify(value, BufferJSON.replacer));
    await db
      .from('wa_auth_state')
      .upsert({ key, value: serialized, updated_at: new Date().toISOString() });
  };

  const readData = async <T = unknown>(key: string): Promise<T | null> => {
    const { data } = await db
      .from('wa_auth_state')
      .select('value')
      .eq('key', key)
      .maybeSingle();
    if (!data) return null;
    return JSON.parse(JSON.stringify(data.value), BufferJSON.reviver) as T;
  };

  const removeData = async (key: string) => {
    await db.from('wa_auth_state').delete().eq('key', key);
  };

  const creds: AuthenticationCreds =
    (await readData<AuthenticationCreds>('creds')) || initAuthCreds();

  return {
    state: {
      creds,
      keys: {
        get: async (type, ids) => {
          const data: { [id: string]: any } = {};
          await Promise.all(
            ids.map(async (id) => {
              const value = await readData<any>(`${type}-${id}`);
              if (value) {
                if (type === 'app-state-sync-key') {
                  data[id] = proto.Message.AppStateSyncKeyData.fromObject(value);
                } else {
                  data[id] = value;
                }
              }
            }),
          );
          return data;
        },
        set: async (data) => {
          const tasks: Promise<unknown>[] = [];
          for (const category in data) {
            const cat = category as keyof SignalDataTypeMap;
            const entries = data[cat];
            if (!entries) continue;
            for (const id in entries) {
              const value = entries[id];
              const key = `${category}-${id}`;
              tasks.push(value ? writeData(key, value) : removeData(key));
            }
          }
          await Promise.all(tasks);
        },
      },
    },
    saveCreds: async () => {
      await writeData('creds', creds);
    },
  };
}
