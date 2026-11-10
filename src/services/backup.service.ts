import { Capacitor } from '@capacitor/core';
import DatabaseService from './database.service';
import { TABLE_NAMES, HISTORICAL_SCHEMA, type TableName } from './database-schema';

export const BACKUP_FORMAT = 'afriki-achats-backup';
export const BACKUP_FORMAT_VERSION = 1;
const SNAPSHOT_DB = 'afriki-achats-backup-store';
const SNAPSHOT_STORE = 'snapshots';
const MAX_SNAPSHOTS = 10;
const MAX_BACKUP_BYTES = 50 * 1024 * 1024;

export interface BackupDocument {
  format: typeof BACKUP_FORMAT;
  formatVersion: number;
  app: string;
  createdAt: string;
  sourceStorage: 'sqlite' | 'localStorage';
  schemaVersion: number;
  tables: Record<TableName, any[]>;
  sha256: string;
}

export interface BackupValidation {
  valid: boolean;
  createdAt: string;
  counts: Record<TableName, number>;
  sourceStorage: string;
}

function stable(value: any): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(stable).join(',') + ']';
  return '{' + Object.keys(value).sort().map(k => JSON.stringify(k) + ':' + stable(value[k])).join(',') + '}';
}

async function sha256(value: string): Promise<string> {
  if (!globalThis.crypto?.subtle) throw new Error('Le contrôle cryptographique SHA-256 n’est pas disponible sur cet appareil.');
  const bytes = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2, '0')).join('');
}

function payloadOf(doc: BackupDocument): string {
  const {sha256: _ignored, ...payload} = doc;
  return stable(payload);
}

function columnsFor(table: TableName): Set<string> {
  return new Set(HISTORICAL_SCHEMA[table].split('\n').flatMap(line => {
    const match = line.trim().match(/^([a-zA-Z_][a-zA-Z0-9_]*) (?:TEXT|REAL|INTEGER)\b/);
    return match ? [match[1]] : [];
  }));
}

const aliases: Partial<Record<TableName, Record<string, string>>> = {
  articles: {fournisseurId:'fournisseur_id', dateCreation:'date_creation', dateModification:'date_modification'},
  fournisseurs: {reseauxSociaux:'reseaux_sociaux', articlesPrincipaux:'articles_principaux', dateCreation:'date_creation', dateModification:'date_modification'},
  transport: {villeDepart:'ville_depart', paysDepart:'pays_depart', villeArrivee:'ville_arrivee', paysArrivee:'pays_arrivee', dureeTrajet:'duree_trajet', modeTarification:'mode_tarification', grilleTarifaire:'grille_tarifaire', dateCreation:'date_creation', dateModification:'date_modification'},
  commandes: {dateCommande:'date_commande', fournisseurId:'fournisseur_id', transportId:'transport_id', coutTransport:'cout_transport', coutTotal:'cout_total', modePaiement:'mode_paiement', dateCreation:'date_creation', dateModification:'date_modification'},
  commande_lignes: {commandeId:'commande_id', articleId:'article_id', prixUnitaire:'prix_unitaire'}
};

function adaptRowsForSqlite(tables: Record<TableName, any[]>): Record<TableName, any[]> {
  const adapted = {} as Record<TableName, any[]>;
  for (const table of TABLE_NAMES) {
    const allowed = columnsFor(table);
    adapted[table] = tables[table].map((row: any, index: number) => {
      if (!row || typeof row !== 'object' || Array.isArray(row)) throw new Error('Ligne invalide dans ' + table + ' (' + (index + 1) + ').');
      const output: Record<string, any> = {};
      for (const [key, value] of Object.entries(row)) {
        const column = aliases[table]?.[key] ?? key;
        if (!allowed.has(column)) throw new Error('Champ non compatible avec SQLite : ' + table + '.' + key + '. Aucune donnée ne sera ignorée.');
        if (Object.prototype.hasOwnProperty.call(output, column)) throw new Error('Deux champs correspondent à la même colonne dans ' + table + '.');
        output[column] = value;
      }
      return output;
    });
  }
  return adapted;
}

function validateRows(tables: Record<TableName, any[]>): Record<TableName, any[]> {
  if (!tables || typeof tables !== 'object' || Array.isArray(tables)) throw new Error('Le bloc de données de la sauvegarde est invalide.');
  const keys = Object.keys(tables).sort();
  if (stable(keys) !== stable([...TABLE_NAMES].sort())) throw new Error('La sauvegarde ne contient pas exactement les cinq collections attendues.');
  for (const table of TABLE_NAMES) {
    if (!Array.isArray(tables[table])) throw new Error('Collection invalide : ' + table + '.');
    const seenIds = new Set<string>();
    for (const [index, row] of tables[table].entries()) {
      if (typeof row?.id !== 'string' || !row.id.trim()) throw new Error('Identifiant absent ou invalide dans ' + table + ' (' + (index + 1) + ').');
      if (seenIds.has(row.id)) throw new Error('Identifiant dupliqué dans ' + table + ' : ' + row.id + '.');
      seenIds.add(row.id);
      if (!row || typeof row !== 'object' || Array.isArray(row)) throw new Error('Enregistrement invalide dans ' + table + ' (' + (index + 1) + ').');
      for (const [key, value] of Object.entries(row)) {
        if (value === undefined || typeof value === 'function' || typeof value === 'bigint') throw new Error('Valeur non prise en charge dans ' + table + '.' + key + '.');
        if (value !== null && typeof value === 'object') throw new Error('Valeur imbriquée non prise en charge dans ' + table + '.' + key + '.');
        if (typeof value === 'number' && !Number.isFinite(value)) throw new Error('Nombre invalide dans ' + table + '.' + key + '.');
      }
    }
  }
  const ids = (table: TableName) => new Set(tables[table].map(row => row.id));
  const suppliers = ids('fournisseurs'), transports = ids('transport'), articles = ids('articles'), orders = ids('commandes');
  const has = (row: any, a: string, b: string) => row[a] ?? row[b] ?? null;
  for (const row of tables.articles) {
    const supplier = has(row,'fournisseur_id','fournisseurId');
    if (supplier && !suppliers.has(supplier)) throw new Error('Un article référence un fournisseur absent.');
  }
  for (const row of tables.commandes) {
    const supplier = has(row,'fournisseur_id','fournisseurId');
    const transport = has(row,'transport_id','transportId');
    if (!supplier || !suppliers.has(supplier)) throw new Error('Une commande référence un fournisseur absent.');
    if (transport && !transports.has(transport)) throw new Error('Une commande référence un transport absent.');
  }
  for (const row of tables.commande_lignes) {
    const order = has(row,'commande_id','commandeId'), article = has(row,'article_id','articleId');
    if (!order || !orders.has(order)) throw new Error('Une ligne référence une commande absente.');
    if (!article || !articles.has(article)) throw new Error('Une ligne référence un article absent.');
  }
  return tables;
}

function openSnapshotDb(): Promise<IDBDatabase> {
  if (typeof indexedDB === 'undefined') return Promise.reject(new Error('Le stockage local des sauvegardes n’est pas disponible sur cette plateforme.'));
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(SNAPSHOT_DB, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(SNAPSHOT_STORE)) db.createObjectStore(SNAPSHOT_STORE, {keyPath: 'id'});
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Ouverture du coffre de sauvegardes impossible.'));
  });
}

async function snapshotPut(doc: BackupDocument): Promise<void> {
  const db = await openSnapshotDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(SNAPSHOT_STORE, 'readwrite');
      tx.objectStore(SNAPSHOT_STORE).put({id: doc.createdAt, doc});
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error ?? new Error('Sauvegarde locale annulée.'));
    });
    const all = await snapshotList(db);
    const stale = all.slice(MAX_SNAPSHOTS);
    if (stale.length) await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(SNAPSHOT_STORE, 'readwrite');
      for (const item of stale) tx.objectStore(SNAPSHOT_STORE).delete(item.id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } finally { db.close(); }
}

async function snapshotList(db?: IDBDatabase): Promise<Array<{id:string;doc:BackupDocument}>> {
  const own = !db;
  const handle = db ?? await openSnapshotDb();
  try {
    return await new Promise((resolve, reject) => {
      const request = handle.transaction(SNAPSHOT_STORE, 'readonly').objectStore(SNAPSHOT_STORE).getAll();
      request.onsuccess = () => resolve((request.result || []).sort((a,b) => b.id.localeCompare(a.id)));
      request.onerror = () => reject(request.error);
    });
  } finally { if (own) handle.close(); }
}

export class BackupService {
  async createBackup(): Promise<BackupDocument> {
    const exported = await DatabaseService.exportBackupTables();
    const tables = validateRows(exported.tables);
    const payload = {
      format: BACKUP_FORMAT as typeof BACKUP_FORMAT,
      formatVersion: BACKUP_FORMAT_VERSION,
      app: 'Afriki Achats',
      createdAt: new Date().toISOString(),
      sourceStorage: exported.storage,
      schemaVersion: 1,
      tables
    };
    const doc: BackupDocument = {...payload, sha256: await sha256(stable(payload))};
    if (new Blob([JSON.stringify(doc)]).size > MAX_BACKUP_BYTES) throw new Error('La sauvegarde dépasse la taille maximale autorisée de 50 Mo.');
    return doc;
  }

  async validateBackup(input: unknown): Promise<{doc: BackupDocument; report: BackupValidation}> {
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Fichier de sauvegarde invalide.');
    const doc = input as BackupDocument;
    if (doc.format !== BACKUP_FORMAT || doc.formatVersion !== BACKUP_FORMAT_VERSION || doc.schemaVersion !== 1) throw new Error('Format ou version de sauvegarde non compatible.');
    if (typeof doc.createdAt !== 'string' || !Number.isFinite(Date.parse(doc.createdAt))) throw new Error('Date de sauvegarde invalide.');
    if (!['sqlite','localStorage'].includes(doc.sourceStorage)) throw new Error('Origine de sauvegarde inconnue.');
    if (typeof doc.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(doc.sha256)) throw new Error('Empreinte de sauvegarde invalide.');
    const tables = validateRows(doc.tables);
    if (await sha256(payloadOf(doc)) !== doc.sha256) throw new Error('L’empreinte SHA-256 ne correspond pas. Le fichier est altéré ou incomplet.');
    return {doc:{...doc,tables},report:{valid:true,createdAt:doc.createdAt,counts:Object.fromEntries(TABLE_NAMES.map(t=>[t,tables[t].length])) as Record<TableName,number>,sourceStorage:doc.sourceStorage}};
  }

  async saveAutomaticSnapshot(): Promise<BackupDocument> {
    const doc = await this.createBackup();
    await snapshotPut(doc);
    return doc;
  }

  async ensureDailySnapshot(): Promise<void> {
    const today = new Date().toISOString().slice(0,10);
    const existing = await snapshotList();
    if (existing.some(item => item.id.slice(0,10) === today)) return;
    await this.saveAutomaticSnapshot();
  }

  async listAutomaticSnapshots(): Promise<BackupValidation[]> {
    const items = await snapshotList();
    return Promise.all(items.map(async item => (await this.validateBackup(item.doc)).report));
  }

  async restoreBackup(input: unknown): Promise<BackupValidation> {
    const {doc, report} = await this.validateBackup(input);
    const safety = await this.createBackup();
    await snapshotPut(safety);
    const isWeb = Capacitor.getPlatform() === 'web';
    const target = isWeb ? doc.tables : adaptRowsForSqlite(doc.tables);
    await DatabaseService.replaceBackupTables(target);
    const after = await this.createBackup();
    const expected = isWeb ? doc.tables : target;
    for (const table of TABLE_NAMES) {
      if (stable(after.tables[table]) !== stable(expected[table])) {
        throw new Error('La vérification après restauration a échoué pour ' + table + '. Une copie de sécurité préalable est conservée.');
      }
    }
    return report;
  }

  async importFile(file: File): Promise<{doc: BackupDocument; report: BackupValidation}> {
    if (file.size > MAX_BACKUP_BYTES) throw new Error('Le fichier dépasse la taille maximale de 50 Mo.');
    let parsed: unknown;
    try { parsed = JSON.parse(await file.text()); }
    catch { throw new Error('Le fichier n’est pas un JSON valide.'); }
    return this.validateBackup(parsed);
  }

  async exportFile(doc: BackupDocument): Promise<void> {
    const blob = new Blob([JSON.stringify(doc, null, 2)], {type:'application/json'});
    const filename = 'afriki-achats-backup-' + doc.createdAt.replace(/[:.]/g,'-') + '.json';
    const url = URL.createObjectURL(blob);
    try {
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = filename;
      anchor.style.display = 'none';
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
    } finally {
      window.setTimeout(() => URL.revokeObjectURL(url), 30000);
    }
  }
}

export const backupService = new BackupService();
