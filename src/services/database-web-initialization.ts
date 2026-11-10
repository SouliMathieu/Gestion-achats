import { TABLE_NAMES } from './database-schema';
import { DatabaseInitializationError, type InitializationReport } from './database-initialization';
import { recoverWebTransaction } from './database-web-transaction';

export function initializeWebStorage(storage: Storage): InitializationReport {
  try {
    // Recover a write-ahead transaction before inspecting or exposing collections.
    recoverWebTransaction(storage);
    // Tout lire et valider avant la première écriture. Une exception n'est jamais une absence.
    const existing = TABLE_NAMES.map(name => ({name, raw: storage.getItem(name)}));
    const counts: Record<string, number> = {};
    for (const {name, raw} of existing) {
      if (raw === null) { counts[name] = 0; continue; }
      const data = JSON.parse(raw);
      if (!Array.isArray(data) || data.some(v => v === null || typeof v !== 'object' || Array.isArray(v))) {
        throw new Error('Collection locale non reconnue.');
      }
      counts[name] = data.length;
    }
    const missing = existing.filter(v => v.raw === null);
    for (const {name} of missing) {
      // Ne jamais écraser une collection apparue entre-temps dans un autre onglet.
      if (storage.getItem(name) !== null) throw new Error('Le stockage a changé pendant son initialisation. Rechargez l’application.');
      storage.setItem(name, '[]');
      if (storage.getItem(name) !== '[]') throw new Error('Initialisation locale non persistée.');
    }
    return {storage: 'localStorage', kind: missing.length === existing.length ? 'new' : missing.length ? 'partial' : 'historical',
      version: null, counts};
  } catch (error) {
    throw new DatabaseInitializationError('WEB_STORAGE',
      'Le stockage local est indisponible ou non reconnu. Les collections existantes ne sont pas réinitialisées.', undefined, error);
  }
}
