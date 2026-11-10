# Sauvegarde et restauration — Afriki Achats

## Format portable
- Fichier JSON versionné : \`afriki-achats-backup\`, version 1.
- Contient les cinq collections : articles, fournisseurs, transport, commandes et lignes de commande.
- Inclut la date, la plateforme d'origine, la version de schéma et une empreinte SHA-256 du contenu.
- La validation contrôle le format, l'empreinte, les identifiants, les références entre collections et la taille du fichier (50 Mo maximum).
- Les données historiques imbriquées sont conservées dans les sauvegardes Web. Une restauration vers SQLite refuse explicitement les champs non représentables plutôt que de les supprimer.

## Export
- Sur les navigateurs et plateformes prenant en charge le partage de fichiers, l'application propose la feuille de partage native.
- Sinon, elle déclenche le téléchargement d'un fichier JSON.
- L'utilisateur doit conserver ce fichier hors de l'appareil (ordinateur, clé USB ou stockage cloud) pour se protéger contre la perte ou la panne de l'appareil.

## Copies automatiques locales
- Une copie quotidienne est créée au démarrage après initialisation de la base.
- Les copies sont stockées dans IndexedDB, séparément des cinq collections métier.
- Les dix copies les plus récentes sont conservées.
- Ces copies sont locales à l'appareil/profil navigateur : elles ne constituent pas une sauvegarde hors site.
- Si IndexedDB est indisponible ou saturé, l'accès à l'application reste possible ; l'échec est signalé dans la console et sur la page Sauvegardes.

## Restauration
1. Lire le fichier et valider sa structure et son empreinte.
2. Contrôler les identifiants et les relations entre les cinq collections.
3. Créer une copie de sécurité indépendante des données actuelles dans IndexedDB.
4. Adapter les alias connus vers les colonnes SQLite lorsque nécessaire.
5. Remplacer les cinq collections dans une transaction SQLite ou via le journal write-ahead Web.
6. Vérifier les relations, l'intégrité SQLite et relire les données restaurées.
7. Recharger l'application après confirmation.

Si une étape antérieure à l'écriture échoue, les données actuelles ne sont pas touchées. Une transaction SQLite en échec est annulée. Pour le Web, le journal permet de reprendre une écriture interrompue ; les transactions trop volumineuses sont refusées avant modification pour préserver la marge du quota local.

## Limites
- SHA-256 détecte l'altération accidentelle ou la corruption du fichier ; ce n'est pas un chiffrement ni une signature d'identité.
- Les copies IndexedDB peuvent disparaître si les données du navigateur/de l'application sont effacées ou si l'appareil est perdu.
- Les sauvegardes externes nécessitent une action de l'utilisateur : partage ou téléchargement puis conservation hors appareil.
- Le format version 1 ne migre pas automatiquement les sauvegardes de schémas futurs.
