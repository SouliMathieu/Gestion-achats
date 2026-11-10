import { Capacitor } from '@capacitor/core';
import { CapacitorSQLite, SQLiteConnection, SQLiteDBConnection } from '@capacitor-community/sqlite';

import { initializeNativeDatabase, type InitializationReport, type NativeConnections } from './database-initialization';
import { initializeWebStorage } from './database-web-initialization';
import { normalizeArticle, normalizeFournisseur, normalizeTransport, normalizeCommande, normalizeCommandeLine, mergeWebRecord, buildSqlUpdate, serializePhotos, ARTICLE_ALIASES, FOURNISSEUR_ALIASES, TRANSPORT_ALIASES, COMMANDE_ALIASES } from './database-models';
import { writeWebTransaction } from './database-web-transaction';
import { TABLE_NAMES, type TableName } from './database-schema';

export class DatabaseService {
  private db: SQLiteDBConnection | null = null;
  private sqlite: NativeConnections;
  private isWeb: boolean;
  private initialization: Promise<InitializationReport> | null = null;

  constructor(options?: { sqlite?: NativeConnections; platform?: string }) {
    this.sqlite = options?.sqlite ?? new SQLiteConnection(CapacitorSQLite);
    this.isWeb = (options?.platform ?? Capacitor.getPlatform()) === 'web';
  }

  // Un échec reste mémorisé : aucun nouvel essai ni recréation implicite.
  initDatabase(): Promise<InitializationReport> {
    if (!this.initialization) {
      this.initialization = Promise.resolve().then(async () => {
        if (this.isWeb) return initializeWebStorage(localStorage);
        const initialized = await initializeNativeDatabase(this.sqlite);
        this.db = initialized.db;
        return initialized.report;
      });
    }
    return this.initialization;
  }

  // Initialisation explicite d'une base existante, reconnue vide après inspection.
  // La promesse initiale rejetée n'est remplacée qu'après confirmation de l'écran de démarrage.
  async confirmEmptyDatabaseInitialization(): Promise<InitializationReport> {
    if (this.isWeb) throw Object.assign(
      new Error('Cette confirmation ne concerne que le stockage SQLite natif.'),
      {code: 'WEB_STORAGE'}
    );
    if (!this.initialization) throw new Error('Aucune demande de confirmation en attente.');
    try {
      await this.initialization;
      throw new Error('La base est déjà initialisée.');
    } catch (error) {
      if (!(error instanceof Error) || !('code' in error) ||
        (error as {code?: string}).code !== 'EMPTY_DATABASE_CONFIRMATION' &&
        (error as {code?: string}).code !== 'SCHEMA_COMPLETION_CONFIRMATION') throw error;
    }
    const pending = initializeNativeDatabase(this.sqlite, true).then(initialized => {
      this.db = initialized.db;
      return initialized.report;
    });
    this.initialization = pending;
    return pending;
  }

  // ARTICLES
  async createArticle(article: any) {
    await this.initDatabase();
    article = normalizeArticle(article);
    if (this.isWeb) {
      const articles = JSON.parse(localStorage.getItem('articles') || '[]');
      articles.push({
        ...article,
        photos: serializePhotos(article.photos)
      });
      localStorage.setItem('articles', JSON.stringify(articles));
    } else {
      if (!this.db) throw new Error('Connexion SQLite indisponible.');
      const query = `
        INSERT INTO articles (id, nom, categorie, description, taille, couleur, prix, devise, 
                             fournisseur_id, photos, statut, notes, date_creation, date_modification)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;
      await this.db.run(query, [
        article.id, article.nom, article.categorie, article.description,
        article.taille, article.couleur, article.prix, article.devise,
        article.fournisseurId, serializePhotos(article.photos), article.statut,
        article.notes, article.dateCreation, article.dateModification
      ]);
    }
  }

  async getArticles(filters?: any) {
    await this.initDatabase();
    if (this.isWeb) {
      let articles = JSON.parse(localStorage.getItem('articles') || '[]');
      
      if (filters?.categorie) {
        articles = articles.filter((a: any) => a.categorie === filters.categorie);
      }
      if (filters?.statut) {
        articles = articles.filter((a: any) => a.statut === filters.statut);
      }
      if (filters?.search) {
        const search = filters.search.toLowerCase();
        articles = articles.filter((a: any) => 
          a.nom.toLowerCase().includes(search) || 
          a.description?.toLowerCase().includes(search)
        );
      }
      
      return articles.map(normalizeArticle).sort((a: any, b: any) => new Date(b.dateModification || 0).getTime() - new Date(a.dateModification || 0).getTime());
    } else {
      if (!this.db) throw new Error('Connexion SQLite indisponible.');
      let query = 'SELECT * FROM articles WHERE 1=1';
      const params: any[] = [];

      if (filters?.categorie) {
        query += ' AND categorie = ?';
        params.push(filters.categorie);
      }
      if (filters?.statut) {
        query += ' AND statut = ?';
        params.push(filters.statut);
      }
      if (filters?.search) {
        query += ' AND (nom LIKE ? OR description LIKE ?)';
        params.push(`%${filters.search}%`, `%${filters.search}%`);
      }

      query += ' ORDER BY date_modification DESC';
      const result = await this.db.query(query, params);
      return (result.values || []).map(normalizeArticle);
    }
  }

  async updateArticle(id: string, article: any) {
    await this.initDatabase();
    const patch = normalizeArticle(article);
    const modifiedAt = new Date().toISOString();
    if (this.isWeb) {
      const records = JSON.parse(localStorage.getItem('articles') || '[]');
      const index = records.findIndex((item: any) => item.id === id);
      if (index === -1) return;
      records[index] = mergeWebRecord(records[index], patch, ARTICLE_ALIASES, id, modifiedAt);
      localStorage.setItem('articles', JSON.stringify(records));
      return;
    }
    if (!this.db) throw new Error('Connexion SQLite indisponible.');
    const update = buildSqlUpdate(patch, [
      {key:'nom',column:'nom'}, {key:'categorie',column:'categorie'}, {key:'description',column:'description'},
      {key:'taille',column:'taille'}, {key:'couleur',column:'couleur'}, {key:'prix',column:'prix'},
      {key:'devise',column:'devise'}, {key:'fournisseurId',legacy:'fournisseur_id',column:'fournisseur_id'},
      {key:'photos',column:'photos',transform:serializePhotos}, {key:'statut',column:'statut'}, {key:'notes',column:'notes'}
    ], modifiedAt);
    await this.db.run('UPDATE articles SET ' + update.assignments.join(',') + ' WHERE id=?', [...update.values,id]);
  }

  async deleteArticle(id: string) {
    await this.initDatabase();
    if (this.isWeb) {
      const lines = JSON.parse(localStorage.getItem('commande_lignes') || '[]');
      if (lines.some((line: any) => (line.article_id ?? line.articleId) === id)) {
        throw new Error('Suppression refusée : cet article est utilisé dans au moins une commande.');
      }
      const articles = JSON.parse(localStorage.getItem('articles') || '[]');
      localStorage.setItem('articles', JSON.stringify(articles.filter((a: any) => a.id !== id)));
    } else {
      if (!this.db) throw new Error('Connexion SQLite indisponible.');
      const refs = await this.db.query('SELECT COUNT(*) AS count FROM commande_lignes WHERE article_id = ?', [id]);
      if (Number(refs.values?.[0]?.count ?? 0) > 0) {
        throw new Error('Suppression refusée : cet article est utilisé dans au moins une commande.');
      }
      await this.db.run('DELETE FROM articles WHERE id = ?', [id]);
    }
  }

  async createFournisseur(fournisseur: any) {
    await this.initDatabase();
    fournisseur = normalizeFournisseur(fournisseur);
    if (this.isWeb) {
      const fournisseurs = JSON.parse(localStorage.getItem('fournisseurs') || '[]');
      fournisseurs.push(fournisseur);
      localStorage.setItem('fournisseurs', JSON.stringify(fournisseurs));
    } else {
      if (!this.db) throw new Error('Connexion SQLite indisponible.');
      const query = `
        INSERT INTO fournisseurs (id, nom, type, pays, ville, adresse, localisation,
                                  telephone, reseaux_sociaux, articles_principaux, notes,
                                  date_creation, date_modification)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;
      await this.db.run(query, [
        fournisseur.id, fournisseur.nom, fournisseur.type, fournisseur.pays,
        fournisseur.ville, fournisseur.adresse, fournisseur.localisation,
        fournisseur.telephone, fournisseur.reseauxSociaux, fournisseur.articlesPrincipaux,
        fournisseur.notes, fournisseur.dateCreation, fournisseur.dateModification
      ]);
    }
  }

  async getFournisseurs(search?: string) {
    await this.initDatabase();
    if (this.isWeb) {
      let fournisseurs = JSON.parse(localStorage.getItem('fournisseurs') || '[]');
      
      if (search) {
        const s = search.toLowerCase();
        fournisseurs = fournisseurs.filter((f: any) =>
          f.nom.toLowerCase().includes(s) ||
          f.ville.toLowerCase().includes(s) ||
          f.type.toLowerCase().includes(s)
        );
      }
      
      return fournisseurs.map(normalizeFournisseur).sort((a: any, b: any) => a.nom.localeCompare(b.nom));
    } else {
      if (!this.db) throw new Error('Connexion SQLite indisponible.');
      let query = 'SELECT * FROM fournisseurs';
      const params: any[] = [];

      if (search) {
        query += ' WHERE nom LIKE ? OR ville LIKE ? OR type LIKE ?';
        params.push(`%${search}%`, `%${search}%`, `%${search}%`);
      }

      query += ' ORDER BY nom ASC';
      const result = await this.db.query(query, params);
      return (result.values || []).map(normalizeFournisseur);
    }
  }

  async updateFournisseur(id: string, fournisseur: any) {
    await this.initDatabase();
    const patch = normalizeFournisseur(fournisseur);
    const modifiedAt = new Date().toISOString();
    if (this.isWeb) {
      const records = JSON.parse(localStorage.getItem('fournisseurs') || '[]');
      const index = records.findIndex((item: any) => item.id === id);
      if (index === -1) return;
      records[index] = mergeWebRecord(records[index], patch, FOURNISSEUR_ALIASES, id, modifiedAt);
      localStorage.setItem('fournisseurs', JSON.stringify(records));
      return;
    }
    if (!this.db) throw new Error('Connexion SQLite indisponible.');
    const update = buildSqlUpdate(patch, [
      {key:'nom',column:'nom'}, {key:'type',column:'type'}, {key:'pays',column:'pays'}, {key:'ville',column:'ville'},
      {key:'adresse',column:'adresse'}, {key:'localisation',column:'localisation'}, {key:'telephone',column:'telephone'},
      {key:'reseauxSociaux',legacy:'reseaux_sociaux',column:'reseaux_sociaux'},
      {key:'articlesPrincipaux',legacy:'articles_principaux',column:'articles_principaux'}, {key:'notes',column:'notes'}
    ], modifiedAt);
    await this.db.run('UPDATE fournisseurs SET ' + update.assignments.join(',') + ' WHERE id=?', [...update.values,id]);
  }

  async deleteFournisseur(id: string) {
    await this.initDatabase();
    if (this.isWeb) {
      const articles = JSON.parse(localStorage.getItem('articles') || '[]');
      const commandes = JSON.parse(localStorage.getItem('commandes') || '[]');
      if (articles.some((a: any) => (a.fournisseur_id ?? a.fournisseurId) === id) ||
        commandes.some((c: any) => (c.fournisseur_id ?? c.fournisseurId) === id)) {
        throw new Error('Suppression refusée : ce fournisseur est associé à des articles ou à des commandes.');
      }
      const fournisseurs = JSON.parse(localStorage.getItem('fournisseurs') || '[]');
      localStorage.setItem('fournisseurs', JSON.stringify(fournisseurs.filter((f: any) => f.id !== id)));
    } else {
      if (!this.db) throw new Error('Connexion SQLite indisponible.');
      const [articles, commandes] = await Promise.all([
        this.db.query('SELECT COUNT(*) AS count FROM articles WHERE fournisseur_id = ?', [id]),
        this.db.query('SELECT COUNT(*) AS count FROM commandes WHERE fournisseur_id = ?', [id])
      ]);
      if (Number(articles.values?.[0]?.count ?? 0) > 0 || Number(commandes.values?.[0]?.count ?? 0) > 0) {
        throw new Error('Suppression refusée : ce fournisseur est associé à des articles ou à des commandes.');
      }
      await this.db.run('DELETE FROM fournisseurs WHERE id = ?', [id]);
    }
  }

  async createTransport(transport: any) {
    await this.initDatabase();
    transport = normalizeTransport(transport);
    if (this.isWeb) {
      const transports = JSON.parse(localStorage.getItem('transport') || '[]');
      transports.push(transport);
      localStorage.setItem('transport', JSON.stringify(transports));
    } else {
      if (!this.db) throw new Error('Connexion SQLite indisponible.');
      const query = `
        INSERT INTO transport (id, nom, type, ville_depart, pays_depart, ville_arrivee,
                              pays_arrivee, adresse, telephone, programme, duree_trajet,
                              mode_tarification, grille_tarifaire, services, notes,
                              date_creation, date_modification)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;
      await this.db.run(query, [
        transport.id, transport.nom, transport.type, transport.villeDepart,
        transport.paysDepart, transport.villeArrivee, transport.paysArrivee,
        transport.adresse, transport.telephone, transport.programme,
        transport.dureeTrajet, transport.modeTarification, transport.grilleTarifaire,
        transport.services, transport.notes, transport.dateCreation, transport.dateModification
      ]);
    }
  }

  async getTransports(search?: string) {
    await this.initDatabase();
    if (this.isWeb) {
      let transports = JSON.parse(localStorage.getItem('transport') || '[]');
      
      if (search) {
        const s = search.toLowerCase();
        transports = transports.filter((t: any) =>
          t.nom.toLowerCase().includes(s) ||
          t.villeDepart?.toLowerCase().includes(s) ||
          t.villeArrivee?.toLowerCase().includes(s)
        );
      }
      
      return transports.map(normalizeTransport).sort((a: any, b: any) => a.nom.localeCompare(b.nom));
    } else {
      if (!this.db) throw new Error('Connexion SQLite indisponible.');
      let query = 'SELECT * FROM transport';
      const params: any[] = [];

      if (search) {
        query += ' WHERE nom LIKE ? OR ville_depart LIKE ? OR ville_arrivee LIKE ?';
        params.push(`%${search}%`, `%${search}%`, `%${search}%`);
      }

      query += ' ORDER BY nom ASC';
      const result = await this.db.query(query, params);
      return (result.values || []).map(normalizeTransport);
    }
  }

  async updateTransport(id: string, transport: any) {
    await this.initDatabase();
    const patch = normalizeTransport(transport);
    const modifiedAt = new Date().toISOString();
    if (this.isWeb) {
      const records = JSON.parse(localStorage.getItem('transport') || '[]');
      const index = records.findIndex((item: any) => item.id === id);
      if (index === -1) return;
      records[index] = mergeWebRecord(records[index], patch, TRANSPORT_ALIASES, id, modifiedAt);
      localStorage.setItem('transport', JSON.stringify(records));
      return;
    }
    if (!this.db) throw new Error('Connexion SQLite indisponible.');
    const update = buildSqlUpdate(patch, [
      {key:'nom',column:'nom'}, {key:'type',column:'type'}, {key:'villeDepart',legacy:'ville_depart',column:'ville_depart'},
      {key:'paysDepart',legacy:'pays_depart',column:'pays_depart'}, {key:'villeArrivee',legacy:'ville_arrivee',column:'ville_arrivee'},
      {key:'paysArrivee',legacy:'pays_arrivee',column:'pays_arrivee'}, {key:'adresse',column:'adresse'},
      {key:'telephone',column:'telephone'}, {key:'programme',column:'programme'}, {key:'dureeTrajet',legacy:'duree_trajet',column:'duree_trajet'},
      {key:'modeTarification',legacy:'mode_tarification',column:'mode_tarification'}, {key:'grilleTarifaire',legacy:'grille_tarifaire',column:'grille_tarifaire'},
      {key:'services',column:'services'}, {key:'notes',column:'notes'}
    ], modifiedAt);
    await this.db.run('UPDATE transport SET ' + update.assignments.join(',') + ' WHERE id=?', [...update.values,id]);
  }

  async deleteTransport(id: string) {
    await this.initDatabase();
    if (this.isWeb) {
      const commandes = JSON.parse(localStorage.getItem('commandes') || '[]');
      if (commandes.some((c: any) => (c.transport_id ?? c.transportId) === id)) {
        throw new Error('Suppression refusée : ce transport est associé à une commande.');
      }
      const transports = JSON.parse(localStorage.getItem('transport') || '[]');
      localStorage.setItem('transport', JSON.stringify(transports.filter((t: any) => t.id !== id)));
    } else {
      if (!this.db) throw new Error('Connexion SQLite indisponible.');
      const refs = await this.db.query('SELECT COUNT(*) AS count FROM commandes WHERE transport_id = ?', [id]);
      if (Number(refs.values?.[0]?.count ?? 0) > 0) {
        throw new Error('Suppression refusée : ce transport est associé à une commande.');
      }
      await this.db.run('DELETE FROM transport WHERE id = ?', [id]);
    }
  }

  async createCommande(commande: any, lignes: any[]) {
    await this.initDatabase();
    commande = normalizeCommande(commande);
    lignes = lignes.map(normalizeCommandeLine);
    if (this.isWeb) {
      const commandes = JSON.parse(localStorage.getItem('commandes') || '[]');
      const allLignes = JSON.parse(localStorage.getItem('commande_lignes') || '[]');
      commandes.push(commande);
      allLignes.push(...lignes.map(l => ({ ...l, commande_id: commande.id })));
      writeWebTransaction(localStorage, [
        {key:'commandes', value:JSON.stringify(commandes)},
        {key:'commande_lignes', value:JSON.stringify(allLignes)}
      ]);
    } else {
      if (!this.db) throw new Error('Connexion SQLite indisponible.');
      const query = `
        INSERT INTO commandes (id, numero, date_commande, fournisseur_id, transport_id,
                              cout_transport, cout_total, devise, mode_paiement, statut,
                              notes, date_creation, date_modification)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;
      await this.db.beginTransaction();
      try {
        await this.db.run(query, [
          commande.id, commande.numero, commande.dateCommande, commande.fournisseurId,
          commande.transportId, commande.coutTransport, commande.coutTotal, commande.devise,
          commande.modePaiement, commande.statut, commande.notes,
          commande.dateCreation, commande.dateModification
        ], false);
        for (const ligne of lignes) {
          await this.db.run(`
            INSERT INTO commande_lignes (id, commande_id, article_id, quantite, prix_unitaire, devise)
            VALUES (?, ?, ?, ?, ?, ?)
          `, [ligne.id, commande.id, ligne.articleId, ligne.quantite, ligne.prixUnitaire, ligne.devise], false);
        }
        await this.db.commitTransaction();
      } catch (error) {
        await this.db.rollbackTransaction();
        throw error;
      }
    }
  }

  async getCommandes(filters?: any) {
    await this.initDatabase();
    if (this.isWeb) {
      let commandes = JSON.parse(localStorage.getItem('commandes') || '[]');
      
      if (filters?.statut) {
        commandes = commandes.filter((c: any) => c.statut === filters.statut);
      }
      
      return commandes.map(normalizeCommande).sort((a: any, b: any) => 
        new Date(b.dateCommande).getTime() - new Date(a.dateCommande).getTime()
      );
    } else {
      if (!this.db) throw new Error('Connexion SQLite indisponible.');
      let query = 'SELECT * FROM commandes WHERE 1=1';
      const params: any[] = [];

      if (filters?.statut) {
        query += ' AND statut = ?';
        params.push(filters.statut);
      }

      query += ' ORDER BY date_commande DESC';
      const result = await this.db.query(query, params);
      return (result.values || []).map(normalizeCommande);
    }
  }

  async getCommandeById(id: string) {
    await this.initDatabase();
    if (this.isWeb) {
      const commandes = JSON.parse(localStorage.getItem('commandes') || '[]');
      const commande = commandes.find((c: any) => c.id === id);
      
      if (!commande) return null;

      const allLignes = JSON.parse(localStorage.getItem('commande_lignes') || '[]');
      const lignes = allLignes.filter((l: any) => l.commande_id === id || l.commandeId === id).map(normalizeCommandeLine);

      return normalizeCommande({ ...commande, lignes });
    } else {
      if (!this.db) throw new Error('Connexion SQLite indisponible.');
      const commande = await this.db.query('SELECT * FROM commandes WHERE id = ?', [id]);
      if (!commande.values?.[0]) return null;

      const lignes = await this.db.query('SELECT * FROM commande_lignes WHERE commande_id = ?', [id]);

      return {
        ...normalizeCommande(commande.values[0]),
        lignes: (lignes.values || []).map(normalizeCommandeLine)
      };
    }
  }

  async updateCommande(id: string, commande: any, lignes?: any[]) {
    await this.initDatabase();
    const patch = normalizeCommande(commande);
    const modifiedAt = new Date().toISOString();
    if (this.isWeb) {
      const commands = JSON.parse(localStorage.getItem('commandes') || '[]');
      const index = commands.findIndex((item: any) => item.id === id);
      if (index === -1) return;
      const nextCommands = [...commands];
      nextCommands[index] = mergeWebRecord(commands[index], patch, COMMANDE_ALIASES, id, modifiedAt);
      let nextLines: any[] | undefined;
      if (lignes !== undefined) {
        const allLines = JSON.parse(localStorage.getItem('commande_lignes') || '[]');
        const updatedLines = allLines.filter((line: any) => line.commande_id !== id && line.commandeId !== id);
        updatedLines.push(...lignes.map(line => ({...normalizeCommandeLine(line), commande_id:id})));
        nextLines = updatedLines;
      }
      const writes = [{key:'commandes', value:JSON.stringify(nextCommands)}];
      if (nextLines !== undefined) writes.push({key:'commande_lignes', value:JSON.stringify(nextLines)});
      writeWebTransaction(localStorage, writes);
      return;
    }
    if (!this.db) throw new Error('Connexion SQLite indisponible.');
    const update = buildSqlUpdate(patch, [
      {key:'dateCommande',legacy:'date_commande',column:'date_commande'}, {key:'fournisseurId',legacy:'fournisseur_id',column:'fournisseur_id'},
      {key:'transportId',legacy:'transport_id',column:'transport_id'}, {key:'coutTransport',legacy:'cout_transport',column:'cout_transport'},
      {key:'coutTotal',legacy:'cout_total',column:'cout_total'}, {key:'devise',column:'devise'},
      {key:'modePaiement',legacy:'mode_paiement',column:'mode_paiement'}, {key:'statut',column:'statut'}, {key:'notes',column:'notes'}
    ], modifiedAt);
    await this.db.beginTransaction();
    try {
      await this.db.run('UPDATE commandes SET ' + update.assignments.join(',') + ' WHERE id=?', [...update.values,id], false);
      if (lignes !== undefined) {
        await this.db.run('DELETE FROM commande_lignes WHERE commande_id = ?', [id], false);
        for (const line of lignes) {
          const item = normalizeCommandeLine(line);
          await this.db.run('INSERT INTO commande_lignes (id, commande_id, article_id, quantite, prix_unitaire, devise) VALUES (?, ?, ?, ?, ?, ?)',
            [item.id, id, item.articleId, item.quantite, item.prixUnitaire, item.devise], false);
        }
      }
      await this.db.commitTransaction();
    } catch (error) {
      await this.db.rollbackTransaction();
      throw error;
    }
  }

  async updateCommandeStatus(id: string, statut: string) {
    await this.updateCommande(id, {statut});
  }

  async deleteCommande(id: string) {
    await this.initDatabase();
    if (this.isWeb) {
      const commandes = JSON.parse(localStorage.getItem('commandes') || '[]');
      const allLignes = JSON.parse(localStorage.getItem('commande_lignes') || '[]');
      const filtered = commandes.filter((c: any) => c.id !== id);
      const filteredLignes = allLignes.filter((l: any) => l.commande_id !== id && l.commandeId !== id);
      writeWebTransaction(localStorage, [
        {key:'commandes', value:JSON.stringify(filtered)},
        {key:'commande_lignes', value:JSON.stringify(filteredLignes)}
      ]);
    } else {
      if (!this.db) throw new Error('Connexion SQLite indisponible.');
      await this.db.run('DELETE FROM commande_lignes WHERE commande_id = ?', [id]);
      await this.db.run('DELETE FROM commandes WHERE id = ?', [id]);
    }
  }

  /**
   * Export brut des cinq collections, sans normalisation métier.
   * Les alias et champs historiques Web sont volontairement conservés.
   */
  async exportBackupTables(): Promise<{storage: 'sqlite' | 'localStorage'; tables: Record<TableName, any[]>}> {
    await this.initDatabase();
    const tables = {} as Record<TableName, any[]>;
    if (this.isWeb) {
      for (const name of TABLE_NAMES) {
        const raw = localStorage.getItem(name);
        if (raw === null) throw new Error(`Collection locale absente : ${name}.`);
        const rows = JSON.parse(raw);
        if (!Array.isArray(rows)) throw new Error(`Collection locale invalide : ${name}.`);
        tables[name] = rows;
      }
      return {storage: 'localStorage', tables};
    }

    if (!this.db) throw new Error('Connexion SQLite indisponible.');
    for (const name of TABLE_NAMES) {
      const result = await this.db.query(`SELECT * FROM "${name}";`);
      if (!Array.isArray(result.values)) throw new Error(`Lecture SQLite impossible : ${name}.`);
      tables[name] = result.values;
    }
    const foreignKeys = await this.db.query('PRAGMA foreign_key_check;');
    if (!Array.isArray(foreignKeys.values) || foreignKeys.values.length !== 0) {
      throw new Error('La base contient des relations incohérentes. Corrigez-les avant de créer une sauvegarde.');
    }
    const integrity = await this.db.query('PRAGMA quick_check;');
    if (integrity.values?.length !== 1 || Object.values(integrity.values[0] ?? {})[0] !== 'ok') {
      throw new Error('Le contrôle d’intégrité SQLite a échoué. Aucune sauvegarde n’a été déclarée valide.');
    }
    return {storage: 'sqlite', tables};
  }

  /**
   * Remplace les cinq collections en une seule opération transactionnelle.
   * Les données doivent déjà avoir été contrôlées et adaptées au schéma SQLite.
   */
  async replaceBackupTables(tables: Record<TableName, any[]>): Promise<void> {
    await this.initDatabase();
    for (const name of TABLE_NAMES) {
      if (!Array.isArray(tables[name])) throw new Error(`Données de restauration invalides : ${name}.`);
    }

    if (this.isWeb) {
      writeWebTransaction(localStorage, TABLE_NAMES.map(name => ({
        key: name,
        value: JSON.stringify(tables[name])
      })));
      return;
    }

    if (!this.db) throw new Error('Connexion SQLite indisponible.');
    const deleteOrder: TableName[] = ['commande_lignes', 'commandes', 'articles', 'transport', 'fournisseurs'];
    const insertOrder: TableName[] = ['fournisseurs', 'transport', 'articles', 'commandes', 'commande_lignes'];
    const quote = (identifier: string) => '"' + identifier.replace(/"/g, '""') + '"';

    await this.db.beginTransaction();
    try {
      for (const name of deleteOrder) {
        await this.db.run(`DELETE FROM "${name}";`, [], false);
      }

      for (const name of insertOrder) {
        for (const row of tables[name]) {
          const columns = Object.keys(row);
          if (columns.length === 0 || columns.some(column => !/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(column))) {
            throw new Error(`Colonnes de restauration invalides dans ${name}.`);
          }
          const sql = `INSERT INTO "${name}" (${columns.map(quote).join(',')}) VALUES (${columns.map(() => '?').join(',')});`;
          await this.db.run(sql, columns.map(column => row[column]), false);
        }
      }

      const foreignKeys = await this.db.query('PRAGMA foreign_key_check;');
      if (!Array.isArray(foreignKeys.values) || foreignKeys.values.length !== 0) {
        throw new Error('La sauvegarde contient des relations incohérentes. La restauration a été annulée.');
      }
      const integrity = await this.db.query('PRAGMA quick_check;');
      if (integrity.values?.length !== 1 || Object.values(integrity.values[0] ?? {})[0] !== 'ok') {
        throw new Error('Le contrôle d’intégrité SQLite a échoué. La restauration a été annulée.');
      }
      await this.db.commitTransaction();
    } catch (error) {
      try {
        const active = await this.db.isTransactionActive();
        if (active.result === true) await this.db.rollbackTransaction();
      } catch (rollbackError) {
        throw new Error('La restauration a échoué et le retour arrière doit être vérifié.', {cause: {error, rollbackError}});
      }
      throw error;
    }
  }

  // STATISTIQUES
  async getStats() {
    await this.initDatabase();
    if (this.isWeb) {
      const articles = JSON.parse(localStorage.getItem('articles') || '[]');
      const fournisseurs = JSON.parse(localStorage.getItem('fournisseurs') || '[]');
      const commandes = JSON.parse(localStorage.getItem('commandes') || '[]');

      const totalByDevise: any = {};
      commandes.forEach((c: any) => {
        if (!totalByDevise[c.devise]) totalByDevise[c.devise] = 0;
        totalByDevise[c.devise] += c.coutTotal || 0;
      });

      const totalAchats = Object.keys(totalByDevise).map(devise => ({
        total: totalByDevise[devise],
        devise
      }));

      return {
        totalArticles: articles.length,
        totalFournisseurs: fournisseurs.length,
        totalCommandes: commandes.length,
        totalAchats
      };
    } else {
      if (!this.db) throw new Error('Connexion SQLite indisponible.');

      const articles = await this.db.query('SELECT COUNT(*) as count FROM articles');
      const fournisseurs = await this.db.query('SELECT COUNT(*) as count FROM fournisseurs');
      const commandes = await this.db.query('SELECT COUNT(*) as count FROM commandes');
      const totalAchats = await this.db.query('SELECT SUM(cout_total) as total, devise FROM commandes GROUP BY devise');

      return {
        totalArticles: articles.values?.[0]?.count || 0,
        totalFournisseurs: fournisseurs.values?.[0]?.count || 0,
        totalCommandes: commandes.values?.[0]?.count || 0,
        totalAchats: totalAchats.values || []
      };
    }
  }

  async getRecentCommandes(limit: number = 5) {
    await this.initDatabase();
    if (this.isWeb) {
      const commandes = JSON.parse(localStorage.getItem('commandes') || '[]');
      return commandes
        .map(normalizeCommande)
        .sort((a: any, b: any) => new Date(b.dateCommande).getTime() - new Date(a.dateCommande).getTime())
        .slice(0, limit);
    } else {
      if (!this.db) throw new Error('Connexion SQLite indisponible.');
      const result = await this.db.query(
        'SELECT * FROM commandes ORDER BY date_commande DESC LIMIT ?',
        [limit]
      );
      return (result.values || []).map(normalizeCommande);
    }
  }
}

export default new DatabaseService();
