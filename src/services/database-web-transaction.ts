const JOURNAL_KEY = '__gestion_achats_transaction_v1__';

export interface WebStorageWrite {
  key: string;
  value: string | null;
}

interface WebStorageJournal {
  version: 1;
  writes: WebStorageWrite[];
}

function parseJournal(raw: string): WebStorageJournal {
  const journal = JSON.parse(raw) as WebStorageJournal;
  if (journal?.version !== 1 || !Array.isArray(journal.writes) || journal.writes.length === 0) {
    throw new Error('Journal de transaction local illisible ; les données sont verrouillées pour vérification.');
  }
  const keys = new Set<string>();
  for (const write of journal.writes) {
    if (!write || typeof write.key !== 'string' || !write.key || write.key === JOURNAL_KEY ||
      !(typeof write.value === 'string' || write.value === null) || keys.has(write.key)) {
      throw new Error('Journal de transaction local invalide ; aucune donnée ne sera écrasée.');
    }
    keys.add(write.key);
  }
  return journal;
}

function applyWrite(storage: Storage, write: WebStorageWrite): void {
  if (write.value === null) storage.removeItem(write.key);
  else storage.setItem(write.key, write.value);
  if (storage.getItem(write.key) !== write.value) {
    throw new Error('Une écriture transactionnelle locale n’a pas été vérifiée.');
  }
}

/** Write-ahead journal: persist intent first, then apply and verify every collection. */
export function recoverWebTransaction(storage: Storage): void {
  const raw = storage.getItem(JOURNAL_KEY);
  if (raw === null) return;
  const journal = parseJournal(raw);
  for (const write of journal.writes) applyWrite(storage, write);
  storage.removeItem(JOURNAL_KEY);
  if (storage.getItem(JOURNAL_KEY) !== null) throw new Error('Le journal de transaction n’a pas pu être clôturé.');
}

export function writeWebTransaction(storage: Storage, writes: WebStorageWrite[]): void {
  if (!Array.isArray(writes) || writes.length === 0) throw new Error('Transaction locale vide.');
  recoverWebTransaction(storage);
  const journal: WebStorageJournal = {version: 1, writes};
  const serialized = JSON.stringify(journal);
  parseJournal(serialized); // Validate before writing the journal or changing business data.
  storage.setItem(JOURNAL_KEY, serialized);
  if (storage.getItem(JOURNAL_KEY) !== serialized) {
    throw new Error('Le journal de transaction n’a pas pu être persisté ; aucune donnée métier n’a été modifiée.');
  }
  // On failure, leave the journal in place. Startup will safely replay it.
  recoverWebTransaction(storage);
}
