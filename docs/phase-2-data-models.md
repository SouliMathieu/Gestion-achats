# Phase 2 — Modèles communs et mises à jour non destructives

Branche : feat/backup-restore-v2.

## Objectif
Unifier les noms de champs renvoyés aux vues sur Web, Electron et SQLite, tout en conservant la compatibilité avec les données historiques. Les lectures normalisent à la volée sans réécrire les JSON historiques. Les mises à jour partielles n'effacent plus les champs absents.

## Changements
- Ajout de \`src/services/database-models.ts\` : alias centralisés, normalisation, conversion explicite des photos, fusion Web non destructive et génération d'UPDATE SQL à colonnes contrôlées.
- Les lectures des cinq collections renvoient les propriétés camelCase attendues par les formulaires.
- Les mises à jour partielles Web conservent les propriétés historiques et inconnues ; les alias historiques existants sont actualisés.
- Les mises à jour SQLite ne modifient que les propriétés fournies ; \`null\` et zéro sont explicites, \`undefined\` et les propriétés absentes sont ignorées.
- \`updateCommandeStatus\` met à jour uniquement le statut.
- Le remplacement des lignes d'une commande SQLite est dans la même transaction que l'en-tête.
- Les formulaires article, fournisseur et transport lisent les deux formes de champs et préservent la date de création.

## Limites
- Les écritures de commande et de lignes dans localStorage ne sont pas atomiques ; cela reste la phase 3.
- Les suppressions référencées et la politique de devise restent à traiter.
- Cette phase ne constitue pas un système de sauvegarde externe. Les sauvegardes automatiques et l'export/restauration restent à construire.
- Aucun identifiant Android, namespace, certificat ou paramètre natif n'est modifié.

## Tests
Jeux synthétiques TEST couvrant les alias, champs inconnus, dates historiques, valeurs nulles et zéro, photos et mises à jour partielles. Les résultats d'exécution sont à confirmer par CI.
