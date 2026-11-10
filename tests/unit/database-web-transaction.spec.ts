import { afterEach, describe, expect, it, vi } from 'vitest';
import { recoverWebTransaction, writeWebTransaction } from '../../src/services/database-web-transaction';

afterEach(() => { localStorage.clear(); vi.restoreAllMocks(); });

describe('Transactions Web/Electron avec journal de reprise', () => {
  it('applique plusieurs collections et clôture le journal', () => {
    localStorage.setItem('commandes', '[{"id":"TEST-OLD"}]');
    localStorage.setItem('commande_lignes', '[]');

    writeWebTransaction(localStorage, [
      {key:'commandes', value:'[{"id":"TEST-NEW"}]'},
      {key:'commande_lignes', value:'[{"id":"TEST-LINE","commande_id":"TEST-NEW"}]'}
    ]);

    expect(JSON.parse(localStorage.getItem('commandes') || '[]')[0].id).toBe('TEST-NEW');
    expect(JSON.parse(localStorage.getItem('commande_lignes') || '[]')[0].commande_id).toBe('TEST-NEW');
    expect(localStorage.getItem('__gestion_achats_transaction_v1__')).toBeNull();
  });

  it('reprend une transaction interrompue après la première collection', () => {
    localStorage.setItem('commandes', '[]');
    localStorage.setItem('commande_lignes', '[]');
    const original = Storage.prototype.setItem;
    let interrupted = false;

    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function(key: string, value: string) {
      if (key === 'commande_lignes' && !interrupted) {
        interrupted = true;
        throw new DOMException('TEST interruption', 'QuotaExceededError');
      }
      return original.call(this, key, value);
    });

    expect(() => writeWebTransaction(localStorage, [
      {key:'commandes', value:'[{"id":"TEST-C"}]'},
      {key:'commande_lignes', value:'[{"id":"TEST-L","commande_id":"TEST-C"}]'}
    ])).toThrow();

    expect(localStorage.getItem('__gestion_achats_transaction_v1__')).not.toBeNull();
    expect(JSON.parse(localStorage.getItem('commandes') || '[]')[0].id).toBe('TEST-C');
    expect(localStorage.getItem('commande_lignes')).toBe('[]');

    vi.restoreAllMocks();
    recoverWebTransaction(localStorage);

    expect(JSON.parse(localStorage.getItem('commande_lignes') || '[]')[0].commande_id).toBe('TEST-C');
    expect(localStorage.getItem('__gestion_achats_transaction_v1__')).toBeNull();
  });

  it('refuse un journal corrompu sans toucher aux collections métier', () => {
    localStorage.setItem('commandes', '[{"id":"TEST-KEEP"}]');
    localStorage.setItem('__gestion_achats_transaction_v1__', '{"version":99,"writes":[]}');

    expect(() => recoverWebTransaction(localStorage)).toThrow();
    expect(localStorage.getItem('commandes')).toBe('[{"id":"TEST-KEEP"}]');
    expect(localStorage.getItem('__gestion_achats_transaction_v1__')).not.toBeNull();
  });

  it('refuse les clés répétées ou la réécriture du journal lui-même', () => {
    expect(() => writeWebTransaction(localStorage, [
      {key:'commandes', value:'[]'},
      {key:'commandes', value:'[]'}
    ])).toThrow();
    expect(() => writeWebTransaction(localStorage, [
      {key:'__gestion_achats_transaction_v1__', value:'[]'}
    ])).toThrow();
  });
});
