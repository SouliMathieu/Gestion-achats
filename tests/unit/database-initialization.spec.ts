// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseService } from '../../src/services/database.service';
import { DATABASE_NAME, initializeNativeDatabase } from '../../src/services/database-initialization';
import { PROTECTION_DATABASE } from '../../src/services/database-migration-protection';
import { NativeHarness, DatabaseSync, rawSnapshot, seed } from '../helpers/native-sqlite';

const harnesses: NativeHarness[] = [];
function setup(version?: number) {
  const directory = mkdtempSync(join(tmpdir(), 'gestion-phase1-'));
  if (version !== undefined) seed(directory, version);
  const harness = new NativeHarness(directory);
  harnesses.push(harness);
  return {directory, harness, service: new DatabaseService({sqlite: harness.api, platform: 'android'})};
}
afterEach(() => { for (const h of harnesses.splice(0)) h.close(); vi.restoreAllMocks(); });

describe('Initialisation native sur un vrai moteur SQLite, données TEST uniquement', () => {
  it('partage la même promesse et attend pour toutes les lectures concurrentes', async () => {
    const {service, harness} = setup(0);
    const first = service.initDatabase();
    expect(service.initDatabase()).toBe(first);
    const reads = Array.from({length: 16}, () => service.getArticles());
    await Promise.all(reads);
    expect((await first).kind).toBe('historical');
    expect(harness.events.filter(e => e.name === DATABASE_NAME && !e.readonly && e.method === 'open' && e.stage === 'before')).toHaveLength(1);
    expect(harness.events.filter(e => e.method === 'run' && e.name === PROTECTION_DATABASE && e.stage === 'after')).toHaveLength(1);
    for (const result of await Promise.all(reads)) expect(result[0].id).toBe('TEST-ARTICLE');
  });

  it.each([false, true])('réutilise une connexion enregistrée, déjà ouverte=%s', async opened => {
    const {service, harness} = setup(1);
    const db = await harness.api.createConnection(DATABASE_NAME, false, 'no-encryption', 1, false);
    if (opened) await db.open();
    const report = await service.initDatabase();
    expect(report.kind).toBe('current');
    expect(harness.connections.get(DATABASE_NAME + false)).toBe(db);
    expect(harness.events.filter(e => e.method === 'open' && e.stage === 'before' && e.name === DATABASE_NAME && !e.readonly)).toHaveLength(1);
    expect(harness.events.some(e => e.method === 'execute' || e.method === 'run')).toBe(false);
  });

  it('crée une base réellement absente et vérifie ses cinq tables en version 1', async () => {
    const {service, directory} = setup();
    const report = await service.initDatabase();
    expect(report).toMatchObject({kind: 'new', version: 1});
    expect(Object.values(report.counts)).toEqual([0, 0, 0, 0, 0]);
    expect(Object.keys(rawSnapshot(directory).data)).toHaveLength(5);
  });

  it('protège la base historique version 0, conserve chaque champ et ne modifie que sa version', async () => {
    const {service, directory, harness} = setup(0);
    const before = rawSnapshot(directory);
    const report = await service.initDatabase();
    expect(report).toMatchObject({kind: 'historical', version: 1});
    expect(report.protectionId).toBeTruthy();
    expect(rawSnapshot(directory)).toEqual({...before, version: 1});
    const guard = new DatabaseSync(harness.path(PROTECTION_DATABASE), {readOnly: true});
    try {
      const row = guard.prepare('SELECT * FROM protections').get();
      const snapshot = JSON.parse(row.document);
      expect(snapshot.version).toBe(0);
      expect(snapshot.data).toEqual(before.data);
      expect(row.sha256).toMatch(/^[a-f0-9]{64}$/);
    } finally { guard.close(); }
    const checkIndex = harness.events.findIndex(e => e.method === 'query' && e.readonly && e.name === PROTECTION_DATABASE && e.sql?.includes('SELECT document'));
    const writeIndex = harness.events.findIndex(e => e.method === 'execute' && e.name === DATABASE_NAME && e.sql?.includes('user_version'));
    expect(checkIndex).toBeGreaterThan(0);
    expect(writeIndex).toBeGreaterThan(checkIndex);
  });

  it.each(['missing-table', 'extra-column', 'extra-table', 'trigger', 'check-constraint', 'future-version'])('refuse %s avant toute ouverture en écriture, sans modifier le fichier', async variation => {
      const {service, directory, harness} = setup(variation === 'future-version' ? 9 : 0);
      const db = new DatabaseSync(harness.path(DATABASE_NAME));
      if (variation === 'missing-table') db.exec('PRAGMA foreign_keys=OFF; DROP TABLE commande_lignes;');
      if (variation === 'extra-column') db.exec('ALTER TABLE commandes ADD COLUMN historique TEXT;');
      if (variation === 'extra-table') db.exec('CREATE TABLE inconnu (id TEXT);');
      if (variation === 'trigger') db.exec('CREATE TRIGGER inconnu AFTER INSERT ON articles BEGIN SELECT 1; END;');
      if (variation === 'check-constraint') {
        const ddl = db.prepare("SELECT sql FROM sqlite_master WHERE name='articles'").get().sql;
        db.exec(ddl.replace('CREATE TABLE articles', 'CREATE TABLE articles_check')
          .replace('nom TEXT NOT NULL', 'nom TEXT NOT NULL CHECK(length(nom)>0)'));
        db.exec('PRAGMA foreign_keys=OFF; INSERT INTO articles_check SELECT * FROM articles; DROP TABLE articles; ALTER TABLE articles_check RENAME TO articles;');
      }
      db.close();
      const bytes = readFileSync(harness.path(DATABASE_NAME));
      await expect(service.initDatabase()).rejects.toMatchObject({code: expect.stringMatching(/^SCHEMA_/)});
      expect(readFileSync(harness.path(DATABASE_NAME))).toEqual(bytes);
      expect(harness.events.some(e => e.name === DATABASE_NAME && !e.readonly)).toBe(false);
      expect(directory).toBeTruthy();
    });

  it('exige une confirmation avant de créer les tables dans une base existante vide', async () => {
    const {service, directory, harness} = setup(0);
    const db = new DatabaseSync(harness.path(DATABASE_NAME));
    db.exec('PRAGMA foreign_keys=OFF; DROP TABLE commande_lignes; DROP TABLE commandes; DROP TABLE articles; DROP TABLE fournisseurs; DROP TABLE transport;');
    db.close();

    const before = readFileSync(harness.path(DATABASE_NAME));
    await expect(service.initDatabase()).rejects.toMatchObject({code: 'EMPTY_DATABASE_CONFIRMATION'});
    expect(readFileSync(harness.path(DATABASE_NAME))).toEqual(before);
    expect(harness.events.some(e => e.name === DATABASE_NAME && e.method === 'execute' && e.sql?.includes('CREATE TABLE'))).toBe(false);

    const report = await service.confirmEmptyDatabaseInitialization();
    expect(report).toMatchObject({kind: 'empty-existing', version: 1});
    expect(Object.values(report.counts)).toEqual([0, 0, 0, 0, 0]);
    expect(Object.keys(rawSnapshot(directory).data).sort()).toEqual(['articles', 'commande_lignes', 'commandes', 'fournisseurs', 'transport']);
  });

  it('complète uniquement les tables manquantes si les tables historiques présentes sont vides', async () => {
    const {service, directory} = setup(0);
    const db = new DatabaseSync(join(directory, DATABASE_NAME + '.db'));
    db.exec(`
      PRAGMA foreign_keys=OFF;
      DELETE FROM commande_lignes;
      DELETE FROM commandes;
      DELETE FROM articles;
      DELETE FROM transport;
      DELETE FROM fournisseurs;
      DROP TABLE commande_lignes;
      DROP TABLE commandes;
      DROP TABLE articles;
    `);
    db.close();

    const before = readFileSync(join(directory, DATABASE_NAME + '.db'));
    await expect(service.initDatabase()).rejects.toMatchObject({code: 'SCHEMA_PARTIAL'});
    expect(readFileSync(join(directory, DATABASE_NAME + '.db'))).toEqual(before);
  });

  it('reconnaît android_metadata sans perdre ses informations', async () => {
    const {service, directory, harness} = setup(0);
    const db = new DatabaseSync(harness.path(DATABASE_NAME));
    db.exec("CREATE TABLE android_metadata(locale TEXT); INSERT INTO android_metadata VALUES ('fr_FR');");
    db.close();
    await service.initDatabase();
    const guard = new DatabaseSync(harness.path(PROTECTION_DATABASE), {readOnly: true});
    try { expect(JSON.parse(guard.prepare('SELECT document FROM protections').get().document).data.android_metadata).toEqual([{locale: 'fr_FR'}]); }
    finally { guard.close(); }
    expect(directory).toBeTruthy();
  });

  it('propage l’échec d’ouverture, sans essai automatique, ni création de remplacement', async () => {
    const {service, harness} = setup(0);
    harness.hook = e => { if (e.name === DATABASE_NAME && e.method === 'open' && e.stage === 'before') throw new Error('TEST ouverture refusée'); };
    const first = service.initDatabase();
    await expect(first).rejects.toMatchObject({code: 'INITIALIZATION'});
    await expect(service.getArticles()).rejects.toMatchObject({code: 'INITIALIZATION'});
    await expect(service.createArticle({id: 'TEST'})).rejects.toMatchObject({code: 'INITIALIZATION'});
    expect(service.initDatabase()).toBe(first);
    expect(harness.events.filter(e => e.method === 'open')).toHaveLength(1);
  });

  it.each(['existence-rejected', 'existence-unknown'])('ne traite pas %s comme une base absente', async reason => {
    const {service, harness} = setup(0);
    harness.api.isDatabase = async () => { if (reason === 'existence-rejected') throw new Error('TEST accès refusé'); return {}; };
    await expect(service.initDatabase()).rejects.toMatchObject({code: 'INITIALIZATION'});
    expect(harness.events).toEqual([]);
  });

  it.each(['write', 'reread', 'tamper', 'hash'])('bloque la migration si la protection échoue : %s', async failure => {
    const {service, harness, directory} = setup(0);
    const before = rawSnapshot(directory);
    let changed = false;
    harness.hook = e => {
      if (e.name !== PROTECTION_DATABASE || e.stage !== 'before') return;
      if (failure === 'write' && e.method === 'run') throw new Error('TEST espace insuffisant');
      if (e.method === 'query' && e.sql?.includes('SELECT document')) {
        if (failure === 'reread') throw new Error('TEST relecture impossible');
        if (!changed && (failure === 'tamper' || failure === 'hash')) {
          changed = true;
          const guard = new DatabaseSync(harness.path(PROTECTION_DATABASE));
          guard.exec(failure === 'tamper' ? "UPDATE protections SET document='TEST-corrompu'" : "UPDATE protections SET sha256='TEST-invalide'");
          guard.close();
        }
      }
    };
    await expect(service.initDatabase()).rejects.toMatchObject({code: 'PROTECTION'});
    expect(rawSnapshot(directory)).toEqual(before);
    expect(harness.events.some(e => e.name === DATABASE_NAME && e.method === 'execute')).toBe(false);
  });

  it('annule la version si une erreur survient après son écriture et conserve la protection', async () => {
    const {service, harness, directory} = setup(0);
    const before = rawSnapshot(directory);
    harness.hook = e => { if (e.name === DATABASE_NAME && e.stage === 'after' && e.method === 'execute' && e.sql?.includes('user_version')) throw new Error('TEST interruption'); };
    await expect(service.initDatabase()).rejects.toMatchObject({code: 'INITIALIZATION'});
    expect(rawSnapshot(directory)).toEqual(before);
    const guard = new DatabaseSync(harness.path(PROTECTION_DATABASE));
    expect(guard.prepare('SELECT COUNT(*) AS n FROM protections').get().n).toBe(1);
    guard.close();
  });

  it('détecte une altération de données pendant la migration et annule tout', async () => {
    const {service, harness, directory} = setup(0);
    const before = rawSnapshot(directory);
    harness.hook = e => {
      if (e.name === DATABASE_NAME && e.stage === 'after' && e.method === 'execute' && e.sql?.includes('user_version')) {
        harness.connections.get(DATABASE_NAME + false)!.handle.exec("UPDATE commandes SET notes='TEST-altération'");
      }
    };
    await expect(service.initDatabase()).rejects.toMatchObject({code: 'INITIALIZATION'});
    expect(rawSnapshot(directory)).toEqual(before);
  });

  it('un second démarrage version 1 n’effectue aucune nouvelle migration', async () => {
    const {directory, harness} = setup(0);
    await initializeNativeDatabase(harness.api);
    harness.close();
    const restarted = new NativeHarness(directory); harnesses.push(restarted);
    expect((await initializeNativeDatabase(restarted.api)).report.kind).toBe('current');
    expect(restarted.events.some(e => e.method === 'execute' || e.method === 'run')).toBe(false);
  });

  it('la protection persistée permet de reconstituer toutes les données dans une base synthétique vierge', async () => {
    const {service, directory, harness} = setup(0);
    const before = rawSnapshot(directory);
    await service.initDatabase();
    const guard = new DatabaseSync(harness.path(PROTECTION_DATABASE), {readOnly: true});
    const snapshot = JSON.parse(guard.prepare('SELECT document FROM protections').get().document);
    guard.close();
    const copyDirectory = mkdtempSync(join(tmpdir(), 'gestion-phase1-copy-'));
    const copy = new DatabaseSync(join(copyDirectory, DATABASE_NAME + '.db'));
    try {
      copy.exec('PRAGMA foreign_keys = OFF; BEGIN;');
      for (const object of snapshot.schema.filter((s: any) => s.type === 'table')) copy.exec(object.sql);
      for (const [name, rows] of Object.entries(snapshot.data)) {
        for (const row of rows as Record<string, any>[]) {
          const columns = Object.keys(row);
          const quote = (s: string) => '"' + s.replace(/"/g, '""') + '"';
          copy.prepare(`INSERT INTO ${quote(name)} (${columns.map(quote).join(',')}) VALUES (${columns.map(() => '?').join(',')})`)
            .run(...columns.map(c => row[c]));
        }
      }
      copy.exec(`PRAGMA user_version = ${snapshot.version}; COMMIT; PRAGMA foreign_keys=ON;`);
      expect(copy.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
    } finally { copy.close(); }
    expect(rawSnapshot(copyDirectory)).toEqual(before);
  });

  it.each(['blob', 'unsafe-number'])('refuse une valeur %s non représentable avant toute écriture de migration', async kind => {
    const {service, harness, directory} = setup(0);
    const db = new DatabaseSync(harness.path(DATABASE_NAME));
    db.exec(kind === 'blob' ? "UPDATE articles SET photos=X'010203' WHERE id='TEST-ARTICLE'" :
      "UPDATE articles SET prix=1e30 WHERE id='TEST-ARTICLE'");
    db.close();
    const before = rawSnapshot(directory);
    await expect(service.initDatabase()).rejects.toMatchObject({code: 'PROTECTION'});
    expect(rawSnapshot(directory)).toEqual(before);
  });
});
