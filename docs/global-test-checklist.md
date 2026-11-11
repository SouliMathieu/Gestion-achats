# Préparation du test global — Afriki Achats

## Fonctionnalités livrées dans la branche
- Initialisation SQLite/Web avec contrôle d'intégrité et protection préalable des schémas historiques.
- Migration additive du schéma v0/v1 vers v2 : ajout de l'archivage des commandes, sans supprimer ni recalculer les commandes existantes.
- Sauvegarde JSON vérifiée (SHA-256, structure, identifiants et références), instantanés quotidiens locaux, copie de sécurité avant restauration et vérification après restauration.
- Compatibilité d'import des sauvegardes JSON v1, converties en v2 avec les commandes considérées actives.
- Archivage réversible des commandes ; les lignes et le statut métier sont conservés.
- Statistiques fournisseurs regroupées par devise, avec coût total de commande (transport inclus une seule fois) ; MAD et FCFA ne sont jamais additionnés entre eux.
- Validation des quantités, prix, transport et devise ; aucune conversion implicite MAD/FCFA.
- Retour Android : fermeture des overlays par Ionic, navigation vers l'écran précédent, sortie uniquement depuis le tableau de bord.
- Version Android incrémentée à 2 / 1.1 ; applicationId, namespace et certificat inchangés.

## Contrôles CI avant APK final
1. TypeScript : vue-tsc --noEmit.
2. Tous les tests unitaires, y compris interruptions SQLite, migration v2, archivage et restauration.
3. ESLint.
4. Build Web.
5. Build du renderer Electron.
6. Build Android debug et upload de l'APK uniquement sur la branche de release finale.

## Test global sur appareil Android dédié
- Installer par-dessus une version test signée de manière compatible ; ne pas désinstaller et ne pas effacer les données.
- Vérifier les cinq collections historiques, les photos, les champs facultatifs, les valeurs zéro/null et les deux devises.
- Vérifier la migration de version 0/1 à 2, la protection préalable, fermeture forcée puis redémarrage.
- Créer, modifier, archiver, restaurer et supprimer une commande ; vérifier que les lignes restent liées.
- Vérifier les totaux fournisseurs en MAD et FCFA séparément et la prise en compte du transport une seule fois.
- Exporter une sauvegarde, altérer un fichier de test pour vérifier le rejet, restaurer une sauvegarde valide et contrôler les cinq collections.
- Tester le retour Android : modal/alerte, écran détail, liste, tableau de bord et sortie.
- Répéter avec mode avion, manque d'espace simulé sur environnement de test et fermeture complète de l'application.
