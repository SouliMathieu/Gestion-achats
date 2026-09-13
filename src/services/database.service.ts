import { Capacitor } from '@capacitor/core';
import { CapacitorSQLite, SQLiteConnection, SQLiteDBConnection } from '@capacitor-community/sqlite';

class DatabaseService {
  private db: SQLiteDBConnection | null = null;
  private sqlite: SQLiteConnection;
  private isWeb: boolean;

  constructor() {
    this.sqlite = new SQLiteConnection(CapacitorSQLite);
    this.isWeb = Capacitor.getPlatform() === 'web';
  }

  async initDatabase() {
    try {
      if (this.isWeb) {
        console.log('Mode WEB : Utilisation de localStorage');
        this.initWebStorage();
      } else {
        console.log('Mode NATIF : Utilisation de SQLite');
        this.db = await this.sqlite.createConnection(
          'gestion_achats',
          false,
          'no-encryption',
          1,
          false
        );
        await this.db.open();
        await this.createTables();
      }
      console.log('Base de données initialisée');
    } catch (error) {
      console.error('Erreur initialisation DB:', error);
    }
  }

  private initWebStorage() {
    // Initialiser les collections dans localStorage si elles n'existent pas
    if (!localStorage.getItem('articles')) localStorage.setItem('articles', JSON.stringify([]));
    if (!localStorage.getItem('fournisseurs')) localStorage.setItem('fournisseurs', JSON.stringify([]));
    if (!localStorage.getItem('transport')) localStorage.setItem('transport', JSON.stringify([]));
    if (!localStorage.getItem('commandes')) localStorage.setItem('commandes', JSON.stringify([]));
    if (!localStorage.getItem('commande_lignes')) localStorage.setItem('commande_lignes', JSON.stringify([]));
  }

  private async createTables() {
    if (!this.db) return;

    // Table Articles
    await this.db.execute(`
      CREATE TABLE IF NOT EXISTS articles (
        id TEXT PRIMARY KEY,
        nom TEXT NOT NULL,
        categorie TEXT NOT NULL,
        description TEXT,
        taille TEXT,
        couleur TEXT,
        prix REAL NOT NULL,
        devise TEXT NOT NULL,
        fournisseur_id TEXT,
        photos TEXT,
        statut TEXT NOT NULL,
        notes TEXT,
        date_creation TEXT NOT NULL,
        date_modification TEXT NOT NULL,
        FOREIGN KEY (fournisseur_id) REFERENCES fournisseurs(id)
      )
    `);

    await this.db.execute(`
      CREATE TABLE IF NOT EXISTS fournisseurs (
        id TEXT PRIMARY KEY,
        nom TEXT NOT NULL,
        type TEXT NOT NULL,
        pays TEXT NOT NULL,
        ville TEXT NOT NULL,
        adresse TEXT,
        localisation TEXT,
        telephone TEXT,
        reseaux_sociaux TEXT,
        articles_principaux TEXT,
        notes TEXT,
        date_creation TEXT NOT NULL,
        date_modification TEXT NOT NULL
      )
    `);

    await this.db.execute(`
      CREATE TABLE IF NOT EXISTS transport (
        id TEXT PRIMARY KEY,
        nom TEXT NOT NULL,
        type TEXT NOT NULL,
        ville_depart TEXT NOT NULL,
        pays_depart TEXT NOT NULL,
        ville_arrivee TEXT NOT NULL,
        pays_arrivee TEXT NOT NULL,
        adresse TEXT,
        telephone TEXT,
        programme TEXT,
        duree_trajet TEXT,
        mode_tarification TEXT,
        grille_tarifaire TEXT,
        services TEXT,
        notes TEXT,
        date_creation TEXT NOT NULL,
        date_modification TEXT NOT NULL
      )
    `);

    await this.db.execute(`
      CREATE TABLE IF NOT EXISTS commandes (
        id TEXT PRIMARY KEY,
        numero TEXT NOT NULL,
        date_commande TEXT NOT NULL,
        fournisseur_id TEXT NOT NULL,
        transport_id TEXT,
        cout_transport REAL,
        cout_total REAL NOT NULL,
        devise TEXT NOT NULL,
        mode_paiement TEXT,
        statut TEXT NOT NULL,
        notes TEXT,
        date_creation TEXT NOT NULL,
        date_modification TEXT NOT NULL,
        FOREIGN KEY (fournisseur_id) REFERENCES fournisseurs(id),
        FOREIGN KEY (transport_id) REFERENCES transport(id)
      )
    `);

    await this.db.execute(`
      CREATE TABLE IF NOT EXISTS commande_lignes (
        id TEXT PRIMARY KEY,
        commande_id TEXT NOT NULL,
        article_id TEXT NOT NULL,
        quantite INTEGER NOT NULL,
        prix_unitaire REAL NOT NULL,
        devise TEXT NOT NULL,
        FOREIGN KEY (commande_id) REFERENCES commandes(id) ON DELETE CASCADE,
        FOREIGN KEY (article_id) REFERENCES articles(id)
      )
    `);
  }

  // ARTICLES
  async createArticle(article: any) {
    if (this.isWeb) {
      const articles = JSON.parse(localStorage.getItem('articles') || '[]');
      articles.push({
        ...article,
        photos: article.photos?.join('|||')
      });
      localStorage.setItem('articles', JSON.stringify(articles));
    } else {
      if (!this.db) return;
      const query = `
        INSERT INTO articles (id, nom, categorie, description, taille, couleur, prix, devise, 
                             fournisseur_id, photos, statut, notes, date_creation, date_modification)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;
      await this.db.run(query, [
        article.id, article.nom, article.categorie, article.description,
        article.taille, article.couleur, article.prix, article.devise,
        article.fournisseurId, article.photos?.join('|||'), article.statut,
        article.notes, article.dateCreation, article.dateModification
      ]);
    }
  }

  async getArticles(filters?: any) {
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
      
      return articles.sort((a: any, b: any) => 
        new Date(b.date_modification).getTime() - new Date(a.date_modification).getTime()
      );
    } else {
      if (!this.db) return [];
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
      return result.values || [];
    }
  }

  async updateArticle(id: string, article: any) {
    if (this.isWeb) {
      const articles = JSON.parse(localStorage.getItem('articles') || '[]');
      const index = articles.findIndex((a: any) => a.id === id);
      if (index !== -1) {
        articles[index] = {
          ...article,
          id,
          photos: article.photos?.join('|||'),
          date_modification: new Date().toISOString()
        };
        localStorage.setItem('articles', JSON.stringify(articles));
      }
    } else {
      if (!this.db) return;
      const query = `
        UPDATE articles SET nom=?, categorie=?, description=?, taille=?, couleur=?, 
                           prix=?, devise=?, fournisseur_id=?, photos=?, statut=?, 
                           notes=?, date_modification=?
        WHERE id=?
      `;
      await this.db.run(query, [
        article.nom, article.categorie, article.description, article.taille,
        article.couleur, article.prix, article.devise, article.fournisseurId,
        article.photos?.join('|||'), article.statut, article.notes,
        new Date().toISOString(), id
      ]);
    }
  }

  async deleteArticle(id: string) {
    if (this.isWeb) {
      const articles = JSON.parse(localStorage.getItem('articles') || '[]');
      const filtered = articles.filter((a: any) => a.id !== id);
      localStorage.setItem('articles', JSON.stringify(filtered));
    } else {
      if (!this.db) return;
      await this.db.run('DELETE FROM articles WHERE id = ?', [id]);
    }
  }

  // FOURNISSEURS
  async createFournisseur(fournisseur: any) {
    if (this.isWeb) {
      const fournisseurs = JSON.parse(localStorage.getItem('fournisseurs') || '[]');
      fournisseurs.push(fournisseur);
      localStorage.setItem('fournisseurs', JSON.stringify(fournisseurs));
    } else {
      if (!this.db) return;
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
      
      return fournisseurs.sort((a: any, b: any) => a.nom.localeCompare(b.nom));
    } else {
      if (!this.db) return [];
      let query = 'SELECT * FROM fournisseurs';
      const params: any[] = [];

      if (search) {
        query += ' WHERE nom LIKE ? OR ville LIKE ? OR type LIKE ?';
        params.push(`%${search}%`, `%${search}%`, `%${search}%`);
      }

      query += ' ORDER BY nom ASC';
      const result = await this.db.query(query, params);
      return result.values || [];
    }
  }

  async updateFournisseur(id: string, fournisseur: any) {
    if (this.isWeb) {
      const fournisseurs = JSON.parse(localStorage.getItem('fournisseurs') || '[]');
      const index = fournisseurs.findIndex((f: any) => f.id === id);
      if (index !== -1) {
        fournisseurs[index] = {
          ...fournisseur,
          id,
          date_modification: new Date().toISOString()
        };
        localStorage.setItem('fournisseurs', JSON.stringify(fournisseurs));
      }
    } else {
      if (!this.db) return;
      const query = `
        UPDATE fournisseurs SET nom=?, type=?, pays=?, ville=?, adresse=?, localisation=?,
                               telephone=?, reseaux_sociaux=?, articles_principaux=?, notes=?,
                               date_modification=?
        WHERE id=?
      `;
      await this.db.run(query, [
        fournisseur.nom, fournisseur.type, fournisseur.pays, fournisseur.ville,
        fournisseur.adresse, fournisseur.localisation, fournisseur.telephone,
        fournisseur.reseauxSociaux, fournisseur.articlesPrincipaux, fournisseur.notes,
        new Date().toISOString(), id
      ]);
    }
  }

  async deleteFournisseur(id: string) {
    if (this.isWeb) {
      const fournisseurs = JSON.parse(localStorage.getItem('fournisseurs') || '[]');
      const filtered = fournisseurs.filter((f: any) => f.id !== id);
      localStorage.setItem('fournisseurs', JSON.stringify(filtered));
    } else {
      if (!this.db) return;
      await this.db.run('DELETE FROM fournisseurs WHERE id = ?', [id]);
    }
  }

  // TRANSPORT (même logique)
  async createTransport(transport: any) {
    if (this.isWeb) {
      const transports = JSON.parse(localStorage.getItem('transport') || '[]');
      transports.push(transport);
      localStorage.setItem('transport', JSON.stringify(transports));
    } else {
      if (!this.db) return;
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
      
      return transports.sort((a: any, b: any) => a.nom.localeCompare(b.nom));
    } else {
      if (!this.db) return [];
      let query = 'SELECT * FROM transport';
      const params: any[] = [];

      if (search) {
        query += ' WHERE nom LIKE ? OR ville_depart LIKE ? OR ville_arrivee LIKE ?';
        params.push(`%${search}%`, `%${search}%`, `%${search}%`);
      }

      query += ' ORDER BY nom ASC';
      const result = await this.db.query(query, params);
      return result.values || [];
    }
  }

  async updateTransport(id: string, transport: any) {
    if (this.isWeb) {
      const transports = JSON.parse(localStorage.getItem('transport') || '[]');
      const index = transports.findIndex((t: any) => t.id === id);
      if (index !== -1) {
        transports[index] = {
          ...transport,
          id,
          date_modification: new Date().toISOString()
        };
        localStorage.setItem('transport', JSON.stringify(transports));
      }
    } else {
      if (!this.db) return;
      const query = `
        UPDATE transport SET nom=?, type=?, ville_depart=?, pays_depart=?, ville_arrivee=?,
                            pays_arrivee=?, adresse=?, telephone=?, programme=?, duree_trajet=?,
                            mode_tarification=?, grille_tarifaire=?, services=?, notes=?,
                            date_modification=?
        WHERE id=?
      `;
      await this.db.run(query, [
        transport.nom, transport.type, transport.villeDepart, transport.paysDepart,
        transport.villeArrivee, transport.paysArrivee, transport.adresse, transport.telephone,
        transport.programme, transport.dureeTrajet, transport.modeTarification,
        transport.grilleTarifaire, transport.services, transport.notes,
        new Date().toISOString(), id
      ]);
    }
  }

  async deleteTransport(id: string) {
    if (this.isWeb) {
      const transports = JSON.parse(localStorage.getItem('transport') || '[]');
      const filtered = transports.filter((t: any) => t.id !== id);
      localStorage.setItem('transport', JSON.stringify(filtered));
    } else {
      if (!this.db) return;
      await this.db.run('DELETE FROM transport WHERE id = ?', [id]);
    }
  }

  // COMMANDES
  async createCommande(commande: any, lignes: any[]) {
    if (this.isWeb) {
      const commandes = JSON.parse(localStorage.getItem('commandes') || '[]');
      commandes.push(commande);
      localStorage.setItem('commandes', JSON.stringify(commandes));

      const allLignes = JSON.parse(localStorage.getItem('commande_lignes') || '[]');
      allLignes.push(...lignes.map(l => ({ ...l, commande_id: commande.id })));
      localStorage.setItem('commande_lignes', JSON.stringify(allLignes));
    } else {
      if (!this.db) return;
      const query = `
        INSERT INTO commandes (id, numero, date_commande, fournisseur_id, transport_id,
                              cout_transport, cout_total, devise, mode_paiement, statut,
                              notes, date_creation, date_modification)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;
      await this.db.run(query, [
        commande.id, commande.numero, commande.dateCommande, commande.fournisseurId,
        commande.transportId, commande.coutTransport, commande.coutTotal, commande.devise,
        commande.modePaiement, commande.statut, commande.notes,
        commande.dateCreation, commande.dateModification
      ]);

      for (const ligne of lignes) {
        await this.db.run(`
          INSERT INTO commande_lignes (id, commande_id, article_id, quantite, prix_unitaire, devise)
          VALUES (?, ?, ?, ?, ?, ?)
        `, [ligne.id, commande.id, ligne.articleId, ligne.quantite, ligne.prixUnitaire, ligne.devise]);
      }
    }
  }

  async getCommandes(filters?: any) {
    if (this.isWeb) {
      let commandes = JSON.parse(localStorage.getItem('commandes') || '[]');
      
      if (filters?.statut) {
        commandes = commandes.filter((c: any) => c.statut === filters.statut);
      }
      
      return commandes.sort((a: any, b: any) => 
        new Date(b.dateCommande).getTime() - new Date(a.dateCommande).getTime()
      );
    } else {
      if (!this.db) return [];
      let query = 'SELECT * FROM commandes WHERE 1=1';
      const params: any[] = [];

      if (filters?.statut) {
        query += ' AND statut = ?';
        params.push(filters.statut);
      }

      query += ' ORDER BY date_commande DESC';
      const result = await this.db.query(query, params);
      return result.values || [];
    }
  }

  async getCommandeById(id: string) {
    if (this.isWeb) {
      const commandes = JSON.parse(localStorage.getItem('commandes') || '[]');
      const commande = commandes.find((c: any) => c.id === id);
      
      if (!commande) return null;

      const allLignes = JSON.parse(localStorage.getItem('commande_lignes') || '[]');
      const lignes = allLignes.filter((l: any) => l.commande_id === id);

      return { ...commande, lignes };
    } else {
      if (!this.db) return null;
      const commande = await this.db.query('SELECT * FROM commandes WHERE id = ?', [id]);
      if (!commande.values?.[0]) return null;

      const lignes = await this.db.query('SELECT * FROM commande_lignes WHERE commande_id = ?', [id]);

      return {
        ...commande.values[0],
        lignes: lignes.values || []
      };
    }
  }

  async updateCommande(id: string, commande: any, lignes?: any[]) {
    if (this.isWeb) {
      const commandes = JSON.parse(localStorage.getItem('commandes') || '[]');
      const index = commandes.findIndex((c: any) => c.id === id);
      if (index !== -1) {
        commandes[index] = {
          ...commande,
          id,
          date_modification: new Date().toISOString()
        };
        localStorage.setItem('commandes', JSON.stringify(commandes));
      }

      if (lignes) {
        const allLignes = JSON.parse(localStorage.getItem('commande_lignes') || '[]');
        const filtered = allLignes.filter((l: any) => l.commande_id !== id);
        filtered.push(...lignes.map(l => ({ ...l, commande_id: id })));
        localStorage.setItem('commande_lignes', JSON.stringify(filtered));
      }
    } else {
      if (!this.db) return;
      const query = `
        UPDATE commandes SET date_commande=?, fournisseur_id=?, transport_id=?,
                            cout_transport=?, cout_total=?, devise=?, mode_paiement=?,
                            statut=?, notes=?, date_modification=?
        WHERE id=?
      `;
      await this.db.run(query, [
        commande.dateCommande, commande.fournisseurId, commande.transportId,
        commande.coutTransport, commande.coutTotal, commande.devise,
        commande.modePaiement, commande.statut, commande.notes,
        new Date().toISOString(), id
      ]);

      if (lignes) {
        await this.db.run('DELETE FROM commande_lignes WHERE commande_id = ?', [id]);
        for (const ligne of lignes) {
          await this.db.run(`
            INSERT INTO commande_lignes (id, commande_id, article_id, quantite, prix_unitaire, devise)
            VALUES (?, ?, ?, ?, ?, ?)
          `, [ligne.id, id, ligne.articleId, ligne.quantite, ligne.prixUnitaire, ligne.devise]);
        }
      }
    }
  }

  async deleteCommande(id: string) {
    if (this.isWeb) {
      const commandes = JSON.parse(localStorage.getItem('commandes') || '[]');
      const filtered = commandes.filter((c: any) => c.id !== id);
      localStorage.setItem('commandes', JSON.stringify(filtered));

      const allLignes = JSON.parse(localStorage.getItem('commande_lignes') || '[]');
      const filteredLignes = allLignes.filter((l: any) => l.commande_id !== id);
      localStorage.setItem('commande_lignes', JSON.stringify(filteredLignes));
    } else {
      if (!this.db) return;
      await this.db.run('DELETE FROM commande_lignes WHERE commande_id = ?', [id]);
      await this.db.run('DELETE FROM commandes WHERE id = ?', [id]);
    }
  }

  // STATISTIQUES
  async getStats() {
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
      if (!this.db) return null;

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
    if (this.isWeb) {
      const commandes = JSON.parse(localStorage.getItem('commandes') || '[]');
      return commandes
        .sort((a: any, b: any) => new Date(b.dateCommande).getTime() - new Date(a.dateCommande).getTime())
        .slice(0, limit);
    } else {
      if (!this.db) return [];
      const result = await this.db.query(
        'SELECT * FROM commandes ORDER BY date_commande DESC LIMIT ?',
        [limit]
      );
      return result.values || [];
    }
  }
}

export default new DatabaseService();
