import { createRequire } from 'node:module';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { SQLiteDBConnection } from '@capacitor-community/sqlite';
import type { NativeConnections } from '../../src/services/database-sqlite-support';

// Adaptateur de contrat pour tester le vrai moteur SQLite fourni par Node 24.
// Il ne remplace pas la validation du pont Java/SQLCipher sur un appareil.
const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite');
export interface Event {
  stage: 'before' | 'after'; method: string; name: string; readonly: boolean; sql?: string;
}
export class NativeHarness {
  connections = new Map<string, NativeDatabase>();
  events: Event[] = [];
  hook?: (event: Event) => void;
  constructor(public directory: string, public initialSynchronous?: number) {}
  path(name: string) { return join(this.directory, name + '.db'); }
  emit(event: Event) { this.events.push(event); this.hook?.(event); }
  api: NativeConnections = {
    isDatabase: async name => ({result: existsSync(this.path(name))}),
    isConnection: async (name, readonly) => ({result: this.connections.has(name + readonly)}),
    retrieveConnection: async (name, readonly) => this.connections.get(name + readonly) as unknown as SQLiteDBConnection,
    createConnection: async (name, _encrypted, _mode, _version, readonly) => {
      if (this.connections.has(name + readonly)) throw new Error('Duplicate connection');
      const connection = new NativeDatabase(this, name, readonly);
      this.connections.set(name + readonly, connection);
      return connection as unknown as SQLiteDBConnection;
    },
    closeConnection: async (name, readonly) => {
      const connection = this.connections.get(name + readonly);
      if (!connection) throw new Error('Missing connection');
      await connection.close();
      this.connections.delete(name + readonly);
    }
  };
  close() { for (const db of this.connections.values()) db.close(); this.connections.clear(); }
}
class NativeDatabase {
  handle: any;
  constructor(private harness: NativeHarness, public name: string, private readonly: boolean) {}
  event(stage: Event['stage'], method: string, sql?: string) {
    this.harness.emit({stage, method, name: this.name, readonly: this.readonly, sql});
  }
  getConnectionReadOnly() { return this.readonly; }
  async isDBOpen() { return {result: !!this.handle}; }
  async open() {
    this.event('before', 'open');
    this.handle = new DatabaseSync(this.harness.path(this.name), {readOnly: this.readonly});
    this.handle.exec('PRAGMA foreign_keys = ON;');
    if (this.harness.initialSynchronous !== undefined) {
      this.handle.exec(`PRAGMA synchronous = ${this.harness.initialSynchronous};`);
    }
    this.event('after', 'open');
  }
  async close() { this.handle?.close(); this.handle = undefined; }
  async getVersion() { return {version: this.handle.prepare('PRAGMA user_version;').get().user_version}; }
  async query(sql: string, values: any[] = []) {
    this.event('before', 'query', sql);
    const valuesOut = this.handle.prepare(sql).all(...values).map((row: object) => ({...row}));
    this.event('after', 'query', sql);
    return {values: valuesOut};
  }
  async beginTransaction() { this.event('before', 'begin'); this.handle.exec('BEGIN IMMEDIATE;'); this.event('after', 'begin'); }
  async commitTransaction() { this.event('before', 'commit'); this.handle.exec('COMMIT;'); this.event('after', 'commit'); }
  async rollbackTransaction() { this.event('before', 'rollback'); this.handle.exec('ROLLBACK;'); this.event('after', 'rollback'); }
  async isTransactionActive() { return {result: this.handle.isTransaction}; }
  async execute(sql: string, transaction = true) {
    this.event('before', 'execute', sql);
    if (transaction) this.handle.exec('BEGIN;');
    try { this.handle.exec(sql); if (transaction) this.handle.exec('COMMIT;'); }
    catch (error) { if (transaction && this.handle.isTransaction) this.handle.exec('ROLLBACK;'); throw error; }
    this.event('after', 'execute', sql);
    return {changes: {changes: 0}};
  }
  async run(sql: string, values: any[] = [], transaction = true) {
    this.event('before', 'run', sql);
    if (transaction) this.handle.exec('BEGIN;');
    try { this.handle.prepare(sql).run(...values); if (transaction) this.handle.exec('COMMIT;'); }
    catch (error) { if (transaction && this.handle.isTransaction) this.handle.exec('ROLLBACK;'); throw error; }
    this.event('after', 'run', sql);
    return {changes: {changes: 1}};
  }
}

export function seed(directory: string, version = 0) {
  const db = new DatabaseSync(join(directory, 'gestion_achats.db'));
  db.exec(readFileSync(new URL('../fixtures/historical-schema.sql', import.meta.url), 'utf8'));
  // Chaque colonne reçoit une valeur synthétique, y compris les champs facultatifs et photos.
  const ids: Record<string, string> = {articles: 'TEST-ARTICLE', fournisseurs: 'TEST-FOURNISSEUR',
    transport: 'TEST-TRANSPORT', commandes: 'TEST-COMMANDE', commande_lignes: 'TEST-LIGNE'};
  for (const table of ['fournisseurs', 'transport', 'articles', 'commandes', 'commande_lignes']) {
    const columns = db.prepare(`PRAGMA table_info(${table})`).all();
    const values = columns.map((c: any) => {
      if (c.name === 'id') return ids[table];
      if (c.name === 'fournisseur_id') return ids.fournisseurs;
      if (c.name === 'transport_id') return ids.transport;
      if (c.name === 'commande_id') return ids.commandes;
      if (c.name === 'article_id') return ids.articles;
      if (c.type === 'REAL') return c.name === 'cout_transport' ? 0 : 12.75;
      if (c.type === 'INTEGER') return 3;
      if (c.name === 'photos') return 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aOCkAAAAASUVORK5CYII=|||TEST-photo-2';
      if (c.name.startsWith('date_')) return '2020-02-03T04:05:06.789Z';
      if (c.name === 'devise') return 'MAD';
      return 'TEST-' + c.name + '-é';
    });
    db.prepare(`INSERT INTO ${table} VALUES (${values.map(() => '?').join(',')})`).run(...values);
  }
  db.exec(`INSERT INTO articles SELECT 'TEST-ARTICLE-NULL', nom, categorie, NULL, NULL, NULL, 0,
    'FCFA', fournisseur_id, NULL, statut, 'TEST-notes avec apostrophe '' et retour', date_creation, date_modification
    FROM articles WHERE id='TEST-ARTICLE';`);
  db.exec(`PRAGMA user_version = ${version};`);
  db.close();
}

export function rawSnapshot(directory: string) {
  const db = new DatabaseSync(join(directory, 'gestion_achats.db'));
  try {
    const schema = db.prepare("SELECT type, name, tbl_name, sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type, name").all();
    const data = Object.fromEntries(schema.filter((s: any) => s.type === 'table').map((s: any) =>
      [s.name, db.prepare(`SELECT * FROM "${s.name}" ORDER BY id`).all().map((row: object) => ({...row}))]));
    return {version: db.prepare('PRAGMA user_version').get().user_version, schema, data};
  } finally { db.close(); }
}
export { DatabaseSync };
