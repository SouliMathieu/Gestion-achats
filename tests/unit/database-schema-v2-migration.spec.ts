// @vitest-environment node
import {afterEach,describe,expect,it} from 'vitest';
import {mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {DatabaseService} from '../../src/services/database.service';
import {DATABASE_NAME} from '../../src/services/database-initialization';
import {NativeHarness,DatabaseSync,rawSnapshot,seed} from '../helpers/native-sqlite';
const harnesses:NativeHarness[]=[];
afterEach(()=>{for(const h of harnesses.splice(0))h.close();});
describe('Migration SQLite v1 vers v2 — archivage non destructif',()=>{
 it.each([0,1])('migre le schéma historique v%s vers v2 sans modifier les commandes ni leurs lignes et permet archiver/restaurer',async(version)=>{
  const directory=mkdtempSync(join(tmpdir(),'gestion-v2-'));seed(directory,version);const before=rawSnapshot(directory);const harness=new NativeHarness(directory);harnesses.push(harness);
  const service=new DatabaseService({sqlite:harness.api,platform:'android'});
  const report=await service.initDatabase();expect(report.version).toBe(2);
  const after=rawSnapshot(directory);expect(after.version).toBe(2);
  expect(after.data.commandes).toHaveLength(before.data.commandes.length);
  expect(after.data.commandes[0]).toMatchObject({id:'TEST-COMMANDE',archivee:0,date_archivage:null});
  expect(after.data.commande_lignes).toEqual(before.data.commande_lignes);
  await service.archiveCommande('TEST-COMMANDE');
  expect(await service.getCommandes()).toHaveLength(0);
  expect(await service.getArchivedCommandes()).toHaveLength(1);
  await service.restoreCommande('TEST-COMMANDE');
  expect(await service.getCommandes()).toHaveLength(1);
  const check=new DatabaseSync(harness.path(DATABASE_NAME));
  expect(check.prepare('PRAGMA user_version').get().user_version).toBe(2);
  check.close();
 });
});
