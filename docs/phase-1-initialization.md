# Phase 1 — Initialisation et reconnaissance du schéma

Base de travail : `6efaa0ce7da76fee119376126862c9066e6ad336`, branche `feat/backup-restore-v2`.
Implémentation proposée pour revue, sans commit ni push. Aucun fichier natif, identifiant,
paramètre de signature, manifeste de dépendances ou workflow n'a été modifié.

## Comportement

Chaque méthode publique du service attend une même promesse d'initialisation. Les appels
concurrents partagent cette promesse, y compris lorsqu'elle échoue. Aucun appel métier
ne déclenche un nouvel essai après erreur. Le rechargement demandé par l'utilisateur
permet un nouvel examen, sans supprimer ni recréer une base existante.

L'application monte les pages uniquement après succès. Avant cela, elle affiche un
chargement ou une erreur compréhensible. Les causes techniques restent dans l'erreur
du service ; leur contenu brut n'est pas affiché et aucune donnée métier n'est journalisée.

### SQLite

Le nom de la base reste `gestion_achats`, sans chiffrement comme dans la version d'origine.
Une connexion enregistrée est réutilisée ; une connexion fermée est rouverte.
`checkConnectionsConsistency()` n'est pas appelé : cette API peut fermer d'autres connexions.
Les erreurs d'existence ou d'ouverture ne sont jamais assimilées à une absence de fichier.

Pour une base existante, une ouverture en lecture seule précède toute ouverture en écriture.
L'inspection contrôle `quick_check`, la version, `sqlite_master`, les colonnes, les clés
étrangères et le nombre de lignes. Le SQL des tables est comparé à celui du commit de référence.

| État | Décision |
| --- | --- |
| Fichier absent, aucune table applicative, version 0 | Création transactionnelle des cinq tables historiques et version 1 |
| Schéma historique complet, version 0 | Protection indépendante vérifiée, puis reconnaissance en version 1 |
| Schéma historique complet, version 1 | Lecture normale, aucune migration ni protection supplémentaire |
| Fichier déjà existant mais vide, ou tables manquantes | Blocage `SCHEMA_PARTIAL`, sans réparation automatique |
| Colonnes, contraintes, tables ou déclencheurs inconnus ; version supérieure à 1 | Blocage `SCHEMA_UNKNOWN`, sans modification |
| Base illisible ou contrôle d'intégrité en échec | Erreur explicite, sans nouvelle base de remplacement |

La table système Android `android_metadata` est tolérée et incluse dans la protection.
Les index sur les tables connues sont préservés. Une base dont le SQL diffère, même si
elle paraît compatible, peut être bloquée : cette prudence nécessite alors un examen
de son schéma, jamais une suppression de données.

Le catalogue versionné contient uniquement `recognize-historical-schema`, de 0 vers 1.
Cette migration écrit **seulement `PRAGMA user_version = 1`**. Aucun enregistrement métier,
champ, prix, date, relation ou contenu de photo n'est réécrit.

### Protection préalable

1. Commencer une transaction SQLite et réexaminer le schéma sous verrou.
2. Lire le schéma et tous les champs de toutes les tables applicatives reconnues.
3. Persister un document canonique et son SHA-256 dans une base SQLite indépendante :
   `gestion_achats_initialization_protections`, table `protections`.
4. Chaque protection a un UUID distinct. Un `INSERT` est utilisé ; aucune ancienne
   protection n'est remplacée, supprimée ou purgée.
5. Fermer cette connexion, la rouvrir en lecture seule et relire le document persisté.
   Comparer les octets logiques, le SHA-256 et le résultat de `quick_check`.
6. Seulement après ces vérifications, appliquer la migration de version.
7. Relire et comparer toutes les données et le schéma, en neutralisant uniquement
   la différence de version attendue, puis valider la transaction.

La migration exige un journal SQLite persistant et `synchronous >= FULL`.
La protection utilise `synchronous = FULL` et vérifie son mode de journalisation.
Une erreur de capture, de stockage, de relecture ou de comparaison interrompt la migration.
Une erreur après écriture de la version provoque un rollback. Si la clôture ne peut pas
être vérifiée, l'application reste bloquée avec l'erreur `ROLLBACK` ; elle ne restaure,
ne supprime et ne réinitialise rien automatiquement.

Un arrêt du processus avant le commit laisse SQLite récupérer la transaction au prochain
démarrage. Après commit, la base est déjà complètement en version 1. Les protections
partiellement créées ou déjà validées restent conservées. Une création neuve interrompue
peut laisser un fichier vide : au redémarrage il est classé partiel et bloqué, pas recréé.

La protection est un instantané logique interne, **pas une copie physique du fichier SQLite
ni le système utilisateur Backup & Restore**. Elle contient le schéma et les valeurs, pas
les fichiers externes référencés par des chemins photo, les profils navigateur ou les
identifiants internes SQLite non utilisés par les modèles de l'application. La migration
ne modifie aucun de ces éléments. Les BLOB et nombres non représentables sans risque
en JavaScript bloquent la migration plutôt que d'être convertis silencieusement.

Cette protection n'est pas chiffrée ; elle bénéficie de l'isolation du stockage privé de
l'application, comme la base historique. Sa lecture complète peut consommer beaucoup
de mémoire avec de nombreuses photos. Aucun mécanisme d'export, mot de passe, purge ou
restauration utilisateur n'a été ajouté dans cette phase.

### Web et Electron

Electron continue à utiliser la même branche localStorage que le Web, sans nouveau plugin.
L'initialisation lit et valide les cinq collections avant la première écriture. Un JSON
non reconnu ou une erreur d'accès bloque le service. Les chaînes JSON déjà enregistrées
restent strictement inchangées, y compris leurs champs historiques et leurs alias.

Une clé réellement absente peut être créée avec `[]`, sans remplacer une collection
existante. Une initialisation partielle est ainsi reconnue et complétée ; ce comportement
diffère du traitement d'un schéma SQLite partiel. Les écritures sont relues. Une erreur
de quota laisse toutes les anciennes valeurs intactes et remonte à l'écran.

La coordination atomique entre onglets et les transactions métier localStorage restent
prévues en phase 3. Aucune normalisation des objets ou correction de modification partielle
n'est effectuée ici : le problème historique de modification de statut reste à traiter en phase 2.

## Résultats exécutés

Les tests utilisent exclusivement des répertoires temporaires et des données `TEST`.
Le jeu SQLite contient six enregistrements liés, toutes les colonnes, une photo synthétique,
des dates fixes, des valeurs NULL et zéro, du texte accentué, MAD et FCFA.

| Vérification | Résultat |
| --- | --- |
| Initialisation native, moteur SQLite réel via Node 24 et adaptateur du contrat Capacitor | 26 tests réussis |
| Arrêts réels SIGKILL : six points d'une migration historique et création neuve interrompue | 7 tests réussis |
| Initialisation localStorage, erreurs d'accès et quota, préservation des anciens JSON | 12 tests réussis |
| Montage différé des pages et écran d'erreur | 2 tests réussis |
| Ancien test HomePage, conservé | 1 test réussi |
| Chromium réel : neuf, historique, partiel, corrompu, accès refusé, quota | 6 scénarios réussis |
| Fermeture/réouverture de page dans le même contexte Chromium, cas valides | Données identiques |
| TypeScript et lint des fichiers de la phase 1 | Réussis |
| Compilations Vite Web et mode Electron, sorties en mémoire | Réussies |

Le test de protection reconstruit également une base synthétique vierge à partir du
document réellement persisté, puis compare chaque enregistrement, le schéma et la version
à l'original. Les tests d'interruption relisent les fichiers après la mort du processus,
vérifient le retour à la version 0 ou le commit complet en version 1, puis redémarrent
l'initialisation sans retirer les protections précédentes.

La première exécution des tests d'interruption a échoué car le bac à sable empêchait
`spawnSync`. La relance avec l'autorisation d'exécution des sous-processus a réussi ;
aucune assertion n'a été désactivée. Aucun processus autre que les enfants des tests
n'a été interrompu.

Le lint global conserve les six erreurs de phase 0 : variables/imports inutilisés dans
quatre vues et deux types `{}` dans `src/vite-env.d.ts`. Elles ne sont pas corrigées ici.
Les avertissements Browserslist préexistants restent présents.

## Compatibilité et limites de validation

- Web : tests Chromium et compilation exécutés. Aucun profil ou stockage utilisateur utilisé.
- Android : API comparée au plugin SQLite installé 8.0.0 ; tests du moteur SQLite et du
  contrat exécutés, **pas du pont Java/SQLCipher réel**. SDK, adb et émulateur absents.
  Aucun APK construit et aucune mise à jour sur une installation existante testée.
- Electron : logique localStorage et compilation du renderer validées ; exécutable empaqueté,
  fermeture complète du processus et comportement Windows/macOS non testés, binaire absent.
- iOS : non testé. Aucun paramètre iOS modifié.
- WebCrypto SHA-256 et `crypto.randomUUID()` sont nécessaires pour la protection native ;
  leur indisponibilité bloque la migration avant toute écriture de version.
- La compatibilité du certificat Android existant ne peut pas être prouvée sans l'APK et
  la chaîne de signature d'origine. Aucun identifiant ou paramètre natif n'a été modifié.

## Vérification reproductible

Prérequis : Node 24 (module `node:sqlite`), dépendances du verrou existant, possibilité
de lancer des sous-processus pour les tests d'interruption. Les artefacts temporaires
sont conservés, pas nettoyés par les tests.

```sh
git status -sb
git rev-parse HEAD
./node_modules/.bin/vue-tsc --noEmit
npm run test:unit -- --run --threads=false
./node_modules/.bin/eslint src/services/database*.ts src/App.vue tests/unit/database*.ts tests/helpers/*.ts tests/browser/*.cjs
git diff --check
```

La compilation peut être vérifiée sans remplacer `dist` :

```sh
node - <<'JS'
(async () => {
  const {build} = await import('vite');
  for (const mode of ['production', 'electron']) await build({mode, build: {write: false}});
})().catch(error => {console.error(error); process.exitCode = 1;});
JS
```

Pour le navigateur, démarrer Vite dans un terminal, puis lancer le script dans un autre.
Le script crée ses propres contextes Chromium jetables et n'utilise aucun profil existant.
Il nécessite un module Playwright accessible ; aucune dépendance n'a été ajoutée au projet.

```sh
npm run dev -- --host 127.0.0.1 --port 5173 --strictPort
PLAYWRIGHT_MODULE=/opt/codex/cua_node/lib/node_modules/playwright CHROMIUM_EXECUTABLE=/usr/bin/chromium node tests/browser/database-startup.cjs
```

Ces chemins sont ceux de l'environnement cloud actuel ; sur une autre machine, adapter
`PLAYWRIGHT_MODULE` et `CHROMIUM_EXECUTABLE` à l'installation locale.

### Vérifications Android restant à exécuter

Utiliser exclusivement un émulateur ou appareil dédié rempli de données TEST. Ne pas
installer sur l'application commerciale, ne pas la désinstaller, ne pas vider son stockage.
Ne modifier aucun applicationId, namespace ou certificat pour faire réussir l'essai.

1. Sur cette copie de test, préparer le schéma original avec version 0 et les six données
   synthétiques. Conserver un instantané de l'émulateur et une copie externe de ses données.
2. Installer une compilation de test de cette branche avec la même identité et une signature
   compatible sur l'installation synthétique ; aucune commande de désinstallation préalable.
3. Vérifier le chargement, l'accès aux cinq types de données, tous les champs et les photos.
   Constater la version 1 et la présence d'une protection dans la base indépendante.
4. Fermer complètement puis rouvrir l'application : données identiques, pas de nouvelle migration.
5. Dans des variantes synthétiques séparées, vérifier schéma partiel/inconnu, manque d'espace,
   impossibilité d'ouverture et arrêts forcés pendant la migration. Comparer les données
   et la version après reprise ; conserver toutes les protections produites.
6. Vérifier le pont natif pour `getVersion`, les PRAGMA en lecture seule, les transactions,
   l'ouverture de deux bases distinctes et la relecture de la protection après fermeture.

Ces essais restent nécessaires avant de qualifier la migration sur Android. Les tests
Node/Chromium ne les remplacent pas. Une phase ultérieure ne doit pas être engagée avant
la revue de ces résultats et la validation de cette proposition.

## Fichiers concernés

Modifiés : `src/App.vue`, `src/services/database.service.ts`.

Ajoutés :

- `src/services/database-schema.ts`
- `src/services/database-initialization.ts`
- `src/services/database-sqlite-support.ts`
- `src/services/database-migration-protection.ts`
- `src/services/database-web-initialization.ts`
- `tests/fixtures/historical-schema.sql`
- `tests/helpers/native-sqlite.ts`
- `tests/helpers/migration-interruption.ts`
- `tests/unit/database-initialization.spec.ts`
- `tests/unit/database-interruption.spec.ts`
- `tests/unit/database-web-initialization.spec.ts`
- `tests/unit/database-startup-ui.spec.ts`
- `tests/browser/database-startup.cjs`
- `docs/phase-1-initialization.md`

Le DDL a été déplacé sans changement de colonnes. Dans les méthodes métier existantes,
seuls l'attente de l'initialisation et les retours silencieux en absence de connexion
ont changé. Les SQL CRUD, formats d'objets et limites transactionnelles métier sont identiques.
`src/main.ts` n'a pas besoin de modification : le verrouillage du service et le montage
conditionnel des pages dans App suffisent à couvrir les accès.
