import { afterEach, describe, expect, it, vi } from 'vitest';
import { DatabaseService } from '../../src/services/database.service';
import { TABLE_NAMES } from '../../src/services/database-schema';
import { BackupService, BACKUP_FORMAT } from '../../src/services/backup.service';

afterEach(() => {
  localStorage.clear();
  vi.unstubAllGlobals();
});

function setup() {
  localStorage.clear();
  for (const table of TABLE_NAMES) localStorage.setItem(table, '[]');
  localStorage.setItem('fournisseurs', JSON.stringify([{id:'F-1',nom:'Fournisseur test'}]));
  localStorage.setItem('transport', JSON.stringify([{id:'T-1',nom:'Transport test'}]));
  localStorage.setItem('articles', JSON.stringify([{id:'A-1',nom:'Article test',fournisseur_id:'F-1',prix:0}]));
  localStorage.setItem('commandes', JSON.stringify([{id:'C-1',numero:'CMD-1',fournisseur_id:'F-1',transport_id:'T-1'}]));
  localStorage.setItem('commande_lignes', JSON.stringify([{id:'L-1',commande_id:'C-1',article_id:'A-1',quantite:1,prix_unitaire:0}]));
  // Deterministic test-only SHA-256 stand-in; production always uses Web Crypto.
  vi.stubGlobal('crypto', {subtle:{digest:async (_algorithm:string, input:BufferSource) => {
    const bytes = new Uint8Array(input as ArrayBuffer);
    let state = 2166136261;
    for (const byte of bytes) state = Math.imul(state ^ byte, 16777619) >>> 0;
    const output = new Uint8Array(32);
    for (let i=0;i<32;i++) { state = Math.imul(state ^ i, 16777619) >>> 0; output[i] = state & 255; }
    return output.buffer;
  }}});
  return new BackupService();
}

describe('Sauvegardes JSON — validation et intégrité', () => {
  it('crée une sauvegarde versionnée des cinq collections et valide son empreinte', async () => {
    const service = setup();
    const doc = await service.createBackup();
    expect(doc.format).toBe(BACKUP_FORMAT);
    expect(doc.formatVersion).toBe(1);
    expect(doc.sha256).toMatch(/^[a-f0-9]{64}$/);
    const checked = await service.validateBackup(doc);
    expect(checked.report.valid).toBe(true);
    expect(checked.report.counts).toMatchObject({articles:1,fournisseurs:1,transport:1,commandes:1,commande_lignes:1});
  });

  it('détecte un fichier modifié après création de son empreinte', async () => {
    const service = setup();
    const doc = await service.createBackup();
    doc.tables.articles[0].nom = 'Donnée altérée';
    await expect(service.validateBackup(doc)).rejects.toThrow('SHA-256');
  });

  it('refuse une collection manquante ou supplémentaire', async () => {
    const service = setup();
    const doc = await service.createBackup();
    const missing = {...doc,tables:{...doc.tables,articles:undefined}} as any;
    await expect(service.validateBackup(missing)).rejects.toThrow('exactement les cinq collections');
    const extra = {...doc,tables:{...doc.tables,unknown:[]}} as any;
    await expect(service.validateBackup(extra)).rejects.toThrow('exactement les cinq collections');
  });

  it('refuse une relation article-fournisseur absente avant restauration', async () => {
    const service = setup();
    const doc = await service.createBackup();
    doc.tables.articles[0].fournisseur_id = 'F-ABSENT';
    // Recalculer une empreinte cohérente ne rend pas les références métier valides.
    const malformed = {...doc,sha256:'0'.repeat(64)};
    await expect(service.validateBackup(malformed)).rejects.toThrow('fournisseur absent');
  });

  it('préserve les champs historiques imbriqués dans les sauvegardes Web', async () => {
    const service = setup();
    localStorage.setItem('articles', JSON.stringify([{
      id:'A-1',nom:'Article test',fournisseur_id:'F-1',prix:0,
      historique:{ancien:true,metadata:{source:'migration'}}, tags:['ancien','conservé']
    }]));
    const doc = await service.createBackup();
    const checked = await service.validateBackup(doc);
    expect(checked.doc.tables.articles[0].historique).toEqual({ancien:true,metadata:{source:'migration'}});
    expect(checked.doc.tables.articles[0].tags).toEqual(['ancien','conservé']);
  });

  it('refuse les identifiants dupliqués avant toute restauration', async () => {
    const service = setup();
    const doc = await service.createBackup();
    doc.tables.articles.push({...doc.tables.articles[0]});
    await expect(service.validateBackup(doc)).rejects.toThrow('Identifiant dupliqué');
  });

  it('refuse une version de format inconnue', async () => {
    const service = setup();
    const doc = await service.createBackup();
    await expect(service.validateBackup({...doc,formatVersion:99})).rejects.toThrow('non compatible');
  });
});
