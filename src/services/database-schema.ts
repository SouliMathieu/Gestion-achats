// Schéma historique du commit 6efaa0ce ; aucun changement de colonne.
export const HISTORICAL_SCHEMA = {
  articles: `CREATE TABLE IF NOT EXISTS articles (
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
      )`,
  fournisseurs: `CREATE TABLE IF NOT EXISTS fournisseurs (
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
      )`,
  transport: `CREATE TABLE IF NOT EXISTS transport (
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
      )`,
  commandes: `CREATE TABLE IF NOT EXISTS commandes (
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
      )`,
  commande_lignes: `CREATE TABLE IF NOT EXISTS commande_lignes (
        id TEXT PRIMARY KEY,
        commande_id TEXT NOT NULL,
        article_id TEXT NOT NULL,
        quantite INTEGER NOT NULL,
        prix_unitaire REAL NOT NULL,
        devise TEXT NOT NULL,
        FOREIGN KEY (commande_id) REFERENCES commandes(id) ON DELETE CASCADE,
        FOREIGN KEY (article_id) REFERENCES articles(id)
      )`,
} as const;

export type TableName = keyof typeof HISTORICAL_SCHEMA;
export const TABLE_NAMES = Object.keys(HISTORICAL_SCHEMA) as TableName[];


// Schéma courant v2 : l’archivage est indépendant du statut métier.
export const CURRENT_SCHEMA = {
  ...HISTORICAL_SCHEMA,
  commandes: HISTORICAL_SCHEMA.commandes.replace(
    'notes TEXT,',
    'notes TEXT,\n        archivee INTEGER NOT NULL DEFAULT 0,\n        date_archivage TEXT,'
  )
} as const;
