// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { buildSync } from 'esbuild';
import { NativeHarness, seed, rawSnapshot, DatabaseSync } from '../helpers/native-sqlite';
import { initializeNativeDatabase, DATABASE_NAME } from '../../src/services/database-initialization';
import { PROTECTION_DATABASE } from '../../src/services/database-migration-protection';

const root = mkdtempSync(join(tmpdir(), 'gestion-phase1-interruptions-'));
const script = join(root, 'interruption.mjs');
buildSync({entryPoints: [resolve('tests/helpers/migration-interruption.ts')], outfile: script,
  bundle: true, platform: 'node', format: 'esm', target: 'node24'});

describe('Interruption réelle du processus pendant une migration SQLite', () => {
  it.each(['locked', 'protection-inserted', 'protection-reread', 'version-written', 'before-commit', 'after-commit'])('SIGKILL au point %s : données intactes et redémarrage sûr', async point => {
      const directory = mkdtempSync(join(root, point + '-'));
      seed(directory, 0);
      const before = rawSnapshot(directory);
      const child = spawnSync(process.execPath, [script, directory, point], {encoding: 'utf8', timeout: 15000});
      expect(child.error, child.stderr).toBeUndefined();
      expect(child.signal, child.stderr).toBe('SIGKILL');
      expect(rawSnapshot(directory)).toEqual({...before, version: point === 'after-commit' ? 2 : 0});
      const harness = new NativeHarness(directory);
      let priorProtections = 0;
      if ((await harness.api.isDatabase(PROTECTION_DATABASE)).result) {
        const guard = new DatabaseSync(harness.path(PROTECTION_DATABASE));
        priorProtections = guard.prepare('SELECT COUNT(*) AS n FROM protections').get().n;
        guard.close();
      }
      try {
        const report = (await initializeNativeDatabase(harness.api)).report;
        expect(report.version).toBe(2);
        expect(rawSnapshot(directory)).toEqual({...before, version: 2});
        const guard = new DatabaseSync(harness.path(PROTECTION_DATABASE));
        expect(guard.prepare('SELECT COUNT(*) AS n FROM protections').get().n).toBeGreaterThanOrEqual(priorProtections);
        guard.close();
      } finally { harness.close(); }
    });

  it('reprend automatiquement une création interrompue lorsque aucune table métier n’a été validée', async () => {
    const directory = mkdtempSync(join(root, 'new-'));
    const child = spawnSync(process.execPath, [script, directory, 'new-first-table'], {encoding: 'utf8', timeout: 15000});
    expect(child.error, child.stderr).toBeUndefined();
    expect(child.signal, child.stderr).toBe('SIGKILL');
    const harness = new NativeHarness(directory);
    const db = new DatabaseSync(harness.path(DATABASE_NAME));
    expect(db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all()).toEqual([]);
    db.close();
    try {
      const initialized = await initializeNativeDatabase(harness.api);
      expect(initialized.report).toMatchObject({kind: 'empty-existing', version: 2});
      expect(Object.values(initialized.report.counts)).toEqual([0, 0, 0, 0, 0]);
      expect(rawSnapshot(directory).data).toHaveProperty('articles');
      expect(rawSnapshot(directory).data).toHaveProperty('fournisseurs');
      expect(rawSnapshot(directory).data).toHaveProperty('transport');
      expect(rawSnapshot(directory).data).toHaveProperty('commandes');
      expect(rawSnapshot(directory).data).toHaveProperty('commande_lignes');
    } finally { harness.close(); }
  });
});

console.info('Artefacts synthétiques d’interruption conservés :', root);
