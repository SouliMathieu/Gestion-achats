import { NativeHarness } from './native-sqlite';
import { initializeNativeDatabase, DATABASE_NAME } from '../../src/services/database-initialization';
import { PROTECTION_DATABASE } from '../../src/services/database-migration-protection';

const [directory, point] = process.argv.slice(2);
const harness = new NativeHarness(directory);
harness.hook = e => {
  const shouldStop =
    (point === 'locked' && e.name === DATABASE_NAME && e.method === 'begin' && e.stage === 'after') ||
    (point === 'protection-inserted' && e.name === PROTECTION_DATABASE && e.method === 'run' && e.stage === 'after') ||
    (point === 'protection-reread' && e.name === PROTECTION_DATABASE && e.method === 'query' && e.sql?.includes('SELECT document') && e.stage === 'after') ||
    (point === 'version-written' && e.name === DATABASE_NAME && e.method === 'execute' && e.sql?.includes('user_version') && e.stage === 'after') ||
    (point === 'before-commit' && e.name === DATABASE_NAME && e.method === 'commit' && e.stage === 'before') ||
    (point === 'after-commit' && e.name === DATABASE_NAME && e.method === 'commit' && e.stage === 'after') ||
    (point === 'new-first-table' && e.name === DATABASE_NAME && e.method === 'execute' && e.sql?.includes('CREATE TABLE') && e.stage === 'after');
  if (shouldStop) process.kill(process.pid, 'SIGKILL');
};
initializeNativeDatabase(harness.api).then(() => {
  harness.close();
  throw new Error('Le point d’interruption TEST n’a pas été atteint.');
}).catch(error => { console.error(error); process.exitCode = 1; });
