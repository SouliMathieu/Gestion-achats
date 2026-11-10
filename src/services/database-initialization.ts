import type { SQLiteDBConnection } from '@capacitor-community/sqlite';
import { HISTORICAL_SCHEMA, TABLE_NAMES, type TableName } from './database-schema';
import { persistProtection } from './database-migration-protection';
import { canonical, openConnection, type NativeConnections } from './database-sqlite-support';
export type { NativeConnections } from './database-sqlite-support';

export const DATABASE_NAME = 'gestion_achats';
export const SCHEMA_VERSION = 1;
export type SchemaKind = 'new' | 'empty-existing' | 'partial-empty' | 'historical' | 'current' | 'partial' | 'unknown';
export interface InitializationReport {
  storage: 'sqlite' | 'localStorage';
  kind: SchemaKind;
  version: number | null;
  counts: Record<string, number>;
  protectionId?: string;
}
export class DatabaseInitializationError extends Error {
  constructor(public readonly code: string, message: string,
    public readonly report?: InitializationReport, public readonly originalError?: unknown) {
    super(message);
    this.name = 'DatabaseInitializationError';
  }
}
type Row = Record<string, unknown>;
interface Inspection extends InitializationReport { schema: Row[] }

export async function queryRows(db: SQLiteDBConnection, sql: string): Promise<Row[]> {
  const result = await db.query(sql);
  if (!Array.isArray(result.values)) throw new Error('Réponse SQLite illisible.');
  return result.values;
}

function expectedColumns(table: TableName) {
  return HISTORICAL_SCHEMA[table].split('\n').flatMap(line => {
    const match = line.trim().match(/^(\w+) (TEXT|REAL|INTEGER)\b(.*)/);
    return match ? [{name: match[1], type: match[2], notnull: match[3].includes('NOT NULL') ? 1 : 0,
      pk: match[3].includes('PRIMARY KEY') ? 1 : 0, dflt_value: null}] : [];
  });
}

function expectedRelations(table: TableName) {
  return [...HISTORICAL_SCHEMA[table].matchAll(/FOREIGN KEY \((\w+)\) REFERENCES (\w+)\((\w+)\)( ON DELETE CASCADE)?/g)]
    .map(m => ({from: m[1], table: m[2], to: m[3], on_delete: m[4] ? 'CASCADE' : 'NO ACTION', on_update: 'NO ACTION', match: 'NONE'}));
}

export async function inspectDatabase(db: SQLiteDBConnection, existed: boolean): Promise<Inspection> {
  const version = (await db.getVersion()).version;
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 0) throw new Error('Version SQLite illisible.');
  const integrity = await queryRows(db, 'PRAGMA quick_check;');
  if (integrity.length !== 1 || Object.values(integrity[0])[0] !== 'ok') {
    throw new DatabaseInitializationError('INTEGRITY', 'La base nécessite une vérification. Aucune réparation automatique ne sera effectuée.');
  }
  const schema = await queryRows(db,
    "SELECT type, name, tbl_name, sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type, name;");
  const applicationSchema = schema.filter(s => s.name !== 'android_metadata');
  const tables = applicationSchema.filter(s => s.type === 'table');
  const counts: Record<string, number> = {};
  let matches = true;
  for (const table of TABLE_NAMES) {
    if (!tables.some(t => t.name === table)) continue;
    const columns = (await queryRows(db, `PRAGMA table_info("${table}");`))
      .map(({name, type, notnull, pk, dflt_value}) => ({name, type, notnull, pk, dflt_value}));
    const relations = (await queryRows(db, `PRAGMA foreign_key_list("${table}");`))
      .map(({from, table, to, on_delete, on_update, match}) => ({from, table, to, on_delete, on_update, match}));
    const actualSql = String(tables.find(t => t.name === table)?.sql);
    const normalizeSql = (sql: string) => sql.replace(/IF NOT EXISTS/gi, '').replace(/\s+/g, '').replace(/;$/, '').toLowerCase();
    if (normalizeSql(actualSql) !== normalizeSql(HISTORICAL_SCHEMA[table]) ||
      canonical(columns) !== canonical(expectedColumns(table)) ||
      canonical(relations.map(canonical).sort()) !== canonical(expectedRelations(table).map(canonical).sort())) matches = false;
    const result = await queryRows(db, `SELECT COUNT(*) AS count FROM "${table}";`);
    if (typeof result[0]?.count !== 'number') throw new Error('Nombre de lignes illisible.');
    counts[table] = result[0].count;
  }
  // Les tables/colonnes supplémentaires ne sont jamais supprimées ou ignorées pour migrer.
  const unsupported = applicationSchema.some(s =>
    (s.type !== 'table' && s.type !== 'index') || !TABLE_NAMES.includes(s.tbl_name as TableName));
  let kind: SchemaKind;
  if (version > SCHEMA_VERSION || unsupported || !matches) kind = 'unknown';
  else if (tables.length === TABLE_NAMES.length) kind = version === 0 ? 'historical' : 'current';
  else if (!existed && tables.length === 0) kind = 'new';
  else if (tables.length === 0) {
    // Une création interrompue peut laisser un fichier SQLite sans table applicative.
    kind = 'empty-existing';
  } else if (tables.length < TABLE_NAMES.length && Object.values(counts).every(count => count === 0)) {
    // Un schéma incomplet, mais reconnu et sans aucune ligne, peut être complété
    // après confirmation : CREATE TABLE IF NOT EXISTS ne supprime rien d'existant.
    kind = 'partial-empty';
  } else kind = 'partial';
  return {storage: 'sqlite', kind, version, counts, schema};
}

function requireKnown(report: Inspection) {
  if (report.kind === 'partial' || report.kind === 'unknown') {
    throw new DatabaseInitializationError('SCHEMA_' + report.kind.toUpperCase(),
      'Le schéma de cette base doit être examiné avant utilisation. Les données sont conservées.', report);
  }
}

function requiresEmptySchemaConfirmation(report: Inspection): boolean {
  return report.kind === 'empty-existing' || report.kind === 'partial-empty' || report.kind === 'partial';
}

function emptySchemaConfirmationError(report: Inspection) {
  return new DatabaseInitializationError('EMPTY_DATABASE_CONFIRMATION',
    'La base existe, mais son schéma est absent ou incomplet et les tables reconnues ne contiennent aucune donnée. Confirmez l’ajout des tables manquantes. Aucune table ni donnée existante ne sera supprimée.',
    report);
}

export async function captureDatabase(db: SQLiteDBConnection, inspection: Inspection): Promise<string> {
  const data: Record<string, Row[]> = {};
  for (const object of inspection.schema.filter(s => s.type === 'table')) {
    const name = String(object.name);
    const escaped = name.replace(/"/g, '""');
    const columns = await queryRows(db, `PRAGMA table_info("${escaped}");`);
    const blobs = columns.map(c => `typeof("${String(c.name).replace(/"/g, '""')}") = 'blob'`).join(' OR ');
    if (blobs && (await queryRows(db, `SELECT COUNT(*) AS count FROM "${escaped}" WHERE ${blobs};`))[0]?.count !== 0) {
      throw new Error('Une valeur binaire nécessite une protection adaptée avant migration.');
    }
    const rows = await queryRows(db, `SELECT * FROM "${escaped}";`);
    // L'ordre SQL n'est pas une information métier. Chaque valeur et chaque doublon est conservé.
    data[name] = rows.map(row => JSON.parse(canonical(row))).sort((a, b) => canonical(a).localeCompare(canonical(b)));
  }
  return canonical({format: 'gestion-achats-migration-protection', formatVersion: 1,
    database: DATABASE_NAME, version: inspection.version, schema: inspection.schema, data});
}

// Catalogue volontairement limité : reconnaissance du schéma historique, sans réécriture métier.
export const MIGRATIONS = [{id: 'recognize-historical-schema', from: 0, to: 1}] as const;

async function baseline(db: SQLiteDBConnection, sqlite: NativeConnections, existed: boolean, confirmEmptySchema: boolean): Promise<InitializationReport> {
  let active = false;
  try {
    active = true;
    await db.beginTransaction();
    // Relecture sous verrou : une inspection antérieure ne suffit pas à autoriser une écriture.
    const before = await inspectDatabase(db, existed);
    requireKnown(before);
    if (requiresEmptySchemaConfirmation(before) && !confirmEmptySchema) {
      throw emptySchemaConfirmationError(before);
    }
    if (before.kind === 'current') {
      await db.commitTransaction();
      active = false;
      return before;
    }
    const safety = await queryRows(db, 'PRAGMA synchronous;');
    const journal = await queryRows(db, 'PRAGMA journal_mode;');
    const sync = Number(Object.values(safety[0] ?? {})[0]);
    if (!Number.isFinite(sync) || sync < 2 ||
      !['delete', 'wal', 'truncate', 'persist'].includes(String(Object.values(journal[0] ?? {})[0]).toLowerCase())) {
      throw new Error('Configuration SQLite insuffisante pour une migration durable.');
    }
    let document: string | undefined;
    let protectionId: string | undefined;
    if (before.kind === 'historical' || before.kind === 'empty-existing' ||
      before.kind === 'partial-empty' || before.kind === 'partial') {
      try {
        // Toute base existante à compléter est sauvegardée et relue avant la moindre modification.
        document = await captureDatabase(db, before);
        protectionId = await persistProtection(sqlite, document);
      } catch (error) {
        throw new DatabaseInitializationError('PROTECTION',
          'La copie de protection n’a pas pu être vérifiée. Aucune modification du schéma n’a été effectuée. Les données originales sont conservées.', before, error);
      }
    }
    if (before.kind === 'new' || before.kind === 'empty-existing' ||
      before.kind === 'partial-empty' || before.kind === 'partial') {
      // CREATE TABLE IF NOT EXISTS ajoute les tables absentes sans modifier les tables existantes.
      for (const sql of Object.values(HISTORICAL_SCHEMA)) await db.execute(sql + ';', false);
    }
    await db.execute(`PRAGMA user_version = ${MIGRATIONS[0].to};`, false);
    const after = await inspectDatabase(db, true);
    if (after.kind !== 'current') throw new Error('Schéma final non conforme.');
    if (document) {
      // Comparaison de chaque table et objet déjà présent avant toute création.
      const original = JSON.parse(document) as {schema: Row[]; data: Record<string, Row[]>};
      const current = JSON.parse(await captureDatabase(db, {...after, version: before.version})) as {schema: Row[]; data: Record<string, Row[]>};
      for (const [name, rows] of Object.entries(original.data)) {
        if (canonical(current.data[name]) !== canonical(rows)) throw new Error(`Données modifiées pendant la complétion : ${name}`);
      }
      for (const object of original.schema) {
        const retained = current.schema.find(item => item.type === object.type && item.name === object.name);
        if (!retained || canonical(retained) !== canonical(object)) throw new Error(`Structure modifiée pendant la complétion : ${String(object.name)}`);
      }
    }
    await db.commitTransaction();
    active = false;
    return {storage: 'sqlite', kind: before.kind, version: after.version, counts: after.counts, protectionId};
  } catch (error) {
    if (active) {
      try {
        const transaction = await db.isTransactionActive();
        if (typeof transaction.result !== 'boolean') throw new Error('État transactionnel indéterminé.');
        if (transaction.result) await db.rollbackTransaction();
      } catch (rollbackError) {
        throw new DatabaseInitializationError('ROLLBACK',
          'La migration a échoué et sa clôture doit être vérifiée. La copie de protection est conservée.',
          undefined, {error, rollbackError});
      }
    }
    throw error;
  }
}

export async function initializeNativeDatabase(sqlite: NativeConnections, confirmEmptySchema = false): Promise<{db: SQLiteDBConnection; report: InitializationReport}> {
  try {
    const existence = await sqlite.isDatabase(DATABASE_NAME);
    if (typeof existence.result !== 'boolean') throw new Error('Existence de la base indéterminée.');
    if (existence.result) {
      // Un schéma inconnu est refusé avant même l'ouverture en écriture.
      const probe = await openConnection(sqlite, DATABASE_NAME, true);
      try {
        const probeReport = await inspectDatabase(probe, true);
        requireKnown(probeReport);
        if (requiresEmptySchemaConfirmation(probeReport) && !confirmEmptySchema) {
          throw emptySchemaConfirmationError(probeReport);
        }
      } finally { await sqlite.closeConnection(DATABASE_NAME, true); }
    }
    const db = await openConnection(sqlite, DATABASE_NAME, false);
    const inspection = await inspectDatabase(db, existence.result);
    requireKnown(inspection);
    if (requiresEmptySchemaConfirmation(inspection) && !confirmEmptySchema) {
      throw emptySchemaConfirmationError(inspection);
    }
    const report = inspection.kind === 'current' ? inspection : await baseline(db, sqlite, existence.result, confirmEmptySchema);
    return {db, report};
  } catch (error) {
    if (error instanceof DatabaseInitializationError) throw error;
    throw new DatabaseInitializationError('INITIALIZATION',
      'La base de données est indisponible. Aucune réinitialisation automatique ne sera effectuée.', undefined, error);
  }
}
