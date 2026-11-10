import { afterEach, describe, expect, it } from 'vitest';
import { DatabaseService } from '../../src/services/database.service';
import { TABLE_NAMES } from '../../src/services/database-schema';

function prepare() {
  localStorage.clear();
  for (const key of TABLE_NAMES) localStorage.setItem(key, '[]');
}
afterEach(() => localStorage.clear());

describe('Phase 3 — intégrité des relations et suppressions', () => {
  it('refuse de supprimer un article encore présent dans une ligne de commande', async () => {
    prepare();
    localStorage.setItem('articles', JSON.stringify([{id:'TEST-A'}]));
    localStorage.setItem('commande_lignes', JSON.stringify([{id:'TEST-L',article_id:'TEST-A',commande_id:'TEST-C'}]));
    const db = new DatabaseService({platform:'web'});
    await expect(db.deleteArticle('TEST-A')).rejects.toThrow('utilisé dans au moins une commande');
    expect(JSON.parse(localStorage.getItem('articles') || '[]')).toHaveLength(1);
  });

  it('refuse de supprimer un fournisseur référencé par un article ou une commande', async () => {
    prepare();
    localStorage.setItem('fournisseurs', JSON.stringify([{id:'TEST-F'}]));
    localStorage.setItem('articles', JSON.stringify([{id:'TEST-A',fournisseur_id:'TEST-F'}]));
    const db = new DatabaseService({platform:'web'});
    await expect(db.deleteFournisseur('TEST-F')).rejects.toThrow('associé à des articles ou à des commandes');
    expect(JSON.parse(localStorage.getItem('fournisseurs') || '[]')).toHaveLength(1);
  });

  it('refuse de supprimer un transport référencé par une commande', async () => {
    prepare();
    localStorage.setItem('transport', JSON.stringify([{id:'TEST-T'}]));
    localStorage.setItem('commandes', JSON.stringify([{id:'TEST-C',transport_id:'TEST-T'}]));
    const db = new DatabaseService({platform:'web'});
    await expect(db.deleteTransport('TEST-T')).rejects.toThrow('associé à une commande');
    expect(JSON.parse(localStorage.getItem('transport') || '[]')).toHaveLength(1);
  });

  it('supprime une commande et ses lignes dans la même transaction Web', async () => {
    prepare();
    localStorage.setItem('commandes', JSON.stringify([{id:'TEST-C'},{id:'TEST-OTHER'}]));
    localStorage.setItem('commande_lignes', JSON.stringify([
      {id:'TEST-L',commande_id:'TEST-C'},
      {id:'TEST-OTHER-L',commande_id:'TEST-OTHER'}
    ]));
    const db = new DatabaseService({platform:'web'});
    await db.deleteCommande('TEST-C');
    expect(JSON.parse(localStorage.getItem('commandes') || '[]').map((x:any)=>x.id)).toEqual(['TEST-OTHER']);
    expect(JSON.parse(localStorage.getItem('commande_lignes') || '[]').map((x:any)=>x.id)).toEqual(['TEST-OTHER-L']);
    expect(localStorage.getItem('__gestion_achats_transaction_v1__')).toBeNull();
  });
});
