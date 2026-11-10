import { canonical, digest, openConnection, type NativeConnections } from './database-sqlite-support';

export const PROTECTION_DATABASE = 'gestion_achats_initialization_protections';

// Protection interne aux migrations, indépendante de la base métier et sans purge.
// Ce n'est pas encore un format d'export/restauration utilisateur.
export async function persistProtection(sqlite: NativeConnections, document: string): Promise<string> {
  const id = globalThis.crypto.randomUUID();
  const sha256 = await digest(document);
  let db = await openConnection(sqlite, PROTECTION_DATABASE, false);
  let closed = false;
  try {
    await db.execute('PRAGMA synchronous = FULL;', false);
    const journal = await db.query('PRAGMA journal_mode;');
    const mode = String(Object.values(journal.values?.[0] ?? {})[0]).toLowerCase();
    if (!['delete', 'wal', 'truncate', 'persist'].includes(mode)) throw new Error('Protection non durable.');
    await db.execute(`CREATE TABLE IF NOT EXISTS protections (
      id TEXT PRIMARY KEY, created_at TEXT NOT NULL, document TEXT NOT NULL, sha256 TEXT NOT NULL
    );`);
    await db.run('INSERT INTO protections (id, created_at, document, sha256) VALUES (?, ?, ?, ?);',
      [id, new Date().toISOString(), document, sha256]);
    // Vérifier une nouvelle ouverture, et non le seul objet présent en mémoire.
    await sqlite.closeConnection(PROTECTION_DATABASE, false);
    closed = true;
    db = await openConnection(sqlite, PROTECTION_DATABASE, true);
    closed = false;
    const persisted = await db.query('SELECT document, sha256 FROM protections WHERE id = ?;', [id]);
    const row = persisted.values?.[0];
    if (!row || row.document !== document || row.sha256 !== sha256 || await digest(row.document) !== sha256) {
      throw new Error('La copie de protection persistée ne correspond pas à la base.');
    }
    // Détecter aussi une altération structurelle de la protection.
    const check = await db.query('PRAGMA quick_check;');
    if (canonical(check.values) !== canonical([{quick_check: 'ok'}])) throw new Error('Protection SQLite illisible.');
    return id;
  } finally {
    if (!closed) await sqlite.closeConnection(PROTECTION_DATABASE, db.getConnectionReadOnly());
  }
}
