import { afterEach, describe, expect, it, vi } from 'vitest';
import { DatabaseService } from '../../src/services/database.service';
import { TABLE_NAMES } from '../../src/services/database-schema';

afterEach(() => { localStorage.clear(); vi.restoreAllMocks(); });
const service = () => new DatabaseService({platform: 'web'});

describe('Initialisation Web/Electron avec données synthétiques', () => {
  it('initialise les cinq collections et partage la promesse', async () => {
    const db = service();
    const first = db.initDatabase();
    expect(db.initDatabase()).toBe(first);
    expect((await first).kind).toBe('new');
    for (const name of TABLE_NAMES) expect(localStorage.getItem(name)).toBe('[]');
  });
  it('préserve exactement les anciens JSON et champs historiques', async () => {
    const raw = ' [ {"id":"TEST-1", "dateCreation":"2020-01-01", "historique":{"ancien":true}, "photos":"TEST-photo", "prix":0} ] ';
    for (const name of TABLE_NAMES) localStorage.setItem(name, raw);
    const db = service();
    expect((await db.initDatabase()).kind).toBe('historical');
    expect((await db.getArticles())[0].historique).toEqual({ancien: true});
    for (const name of TABLE_NAMES) expect(localStorage.getItem(name)).toBe(raw);
  });
  it('reconnaît une initialisation partielle et ne crée que les clés absentes', async () => {
    const raw = '[{"id":"TEST-historique","inconnu":123}]';
    localStorage.setItem('articles', raw);
    expect((await service().initDatabase()).kind).toBe('partial');
    expect(localStorage.getItem('articles')).toBe(raw);
    for (const name of TABLE_NAMES.filter(n => n !== 'articles')) expect(localStorage.getItem(name)).toBe('[]');
  });
  it.each(['', '{"inconnu":1}', 'null', '[null]', '["TEST"]'])('refuse une collection non reconnue (%s) avant toute écriture', async raw => {
    localStorage.setItem('commandes', raw);
    await expect(service().initDatabase()).rejects.toMatchObject({code: 'WEB_STORAGE'});
    expect(localStorage.getItem('commandes')).toBe(raw);
    expect(localStorage.getItem('articles')).toBeNull();
  });
  it('propage les accès refusés sans créer de stockage de remplacement', async () => {
    const read = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('TEST accès refusé'); });
    const write = vi.spyOn(Storage.prototype, 'setItem');
    await expect(service().getArticles()).rejects.toMatchObject({code: 'WEB_STORAGE'});
    expect(read).toHaveBeenCalled(); expect(write).not.toHaveBeenCalled();
  });
  it('propage le manque d’espace et conserve les collections déjà présentes', async () => {
    localStorage.setItem('articles', '[{"id":"TEST-ancien"}]');
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('TEST plein', 'QuotaExceededError'); });
    const db = service();
    await expect(db.initDatabase()).rejects.toMatchObject({code: 'WEB_STORAGE'});
    await expect(db.getCommandes()).rejects.toMatchObject({code: 'WEB_STORAGE'});
    expect(localStorage.getItem('articles')).toBe('[{"id":"TEST-ancien"}]');
  });
  it('détecte une écriture non persistée', async () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => undefined);
    await expect(service().initDatabase()).rejects.toMatchObject({code: 'WEB_STORAGE'});
  });
  it('tous les accès publics propagent un échec d’initialisation', async () => {
    localStorage.setItem('commandes', 'TEST-corrompu');
    const db = service();
    for (const name of Object.getOwnPropertyNames(DatabaseService.prototype).filter(n => n !== 'constructor' && n !== 'initDatabase')) {
      await expect((db as any)[name]()).rejects.toMatchObject({code: 'WEB_STORAGE'});
    }
  });
});
