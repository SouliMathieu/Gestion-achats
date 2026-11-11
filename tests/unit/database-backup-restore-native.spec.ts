// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseService } from '../../src/services/database.service';
import { NativeHarness, seed } from '../helpers/native-sqlite';

const harnesses: NativeHarness[] = [];
function setup() {
  const directory = mkdtempSync(join(tmpdir(), 'gestion-backup-restore-'));
  seed(directory, 2);
  const harness = new NativeHarness(directory);
  harnesses.push(harness);
  const service = new DatabaseService({sqlite:harness.api,platform:'android'});
  return {service,harness,directory};
}
afterEach(() => { for (const harness of harnesses.splice(0)) harness.close(); });

describe('Restauration SQLite transactionnelle — moteur synthétique', () => {
  it('remplace les cinq collections et relit toutes les données', async () => {
    const {service} = setup();
    const before = await service.exportBackupTables();
    await service.replaceBackupTables(before.tables);
    const after = await service.exportBackupTables();
    for (const table of Object.keys(before.tables) as Array<keyof typeof before.tables>) {
      expect(after.tables[table]).toHaveLength(before.tables[table].length);
    }
    expect(after.tables.articles.some((row:any)=>row.id==='TEST-ARTICLE')).toBe(true);
  });

  it('annule la transaction si une référence est invalide et conserve les données initiales', async () => {
    const {service} = setup();
    const before = await service.exportBackupTables();
    const invalid = structuredClone(before.tables);
    invalid.commande_lignes[0].article_id = 'TEST-ARTICLE-ABSENT';

    await expect(service.replaceBackupTables(invalid)).rejects.toThrow(/FOREIGN KEY constraint failed|relations incohérentes/);
    const after = await service.exportBackupTables();
    expect(after.tables).toEqual(before.tables);
  });

  it('refuse une collection absente avant de commencer une transaction', async () => {
    const {service,harness} = setup();
    const before = await service.exportBackupTables();
    const invalid = {...before.tables} as any;
    delete invalid.transport;
    await expect(service.replaceBackupTables(invalid)).rejects.toThrow('transport');
    expect(harness.events.some(event=>event.method==='begin')).toBe(false);
  });
});
