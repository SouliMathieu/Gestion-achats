import type { SQLiteConnection } from '@capacitor-community/sqlite';

export type NativeConnections = Pick<SQLiteConnection,
  'isDatabase' | 'isConnection' | 'retrieveConnection' | 'createConnection' | 'closeConnection'>;
type Row = Record<string, unknown>;

// Canonicalisation sans conversion des valeurs, ni normalisation des données métier.
export function canonical(value: unknown): string {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'number' && Number.isFinite(value) &&
    (!Number.isInteger(value) || Number.isSafeInteger(value))) return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
    const row = value as Row;
    return '{' + Object.keys(row).sort().map(k => JSON.stringify(k) + ':' + canonical(row[k])).join(',') + '}';
  }
  throw new Error('Valeur SQLite non représentable dans la protection ; migration interdite.');
}

export async function digest(document: string): Promise<string> {
  const bytes = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(document));
  return Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2, '0')).join('');
}

export async function openConnection(sqlite: NativeConnections, name: string, readonly: boolean) {
  const connection = await sqlite.isConnection(name, readonly);
  if (typeof connection.result !== 'boolean') throw new Error('État de connexion indéterminé.');
  const db = connection.result ? await sqlite.retrieveConnection(name, readonly) :
    await sqlite.createConnection(name, false, 'no-encryption', 1, readonly);
  const opened = await db.isDBOpen();
  if (typeof opened.result !== 'boolean') throw new Error('État d’ouverture indéterminé.');
  if (!opened.result) await db.open();
  return db;
}

