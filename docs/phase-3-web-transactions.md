# Phase 3 — Transactions et reprise des écritures multi-collections

Branche : feat/backup-restore-v2.

## Objectif
Éviter qu'une commande soit enregistrée sans ses lignes, ou supprimée sans supprimer ses lignes associées, notamment si l'application Web/Electron est interrompue entre deux écritures.

## Mécanisme Web/Electron
- Un journal write-ahead est écrit dans localStorage avant toute modification des collections concernées.
- Chaque collection est ensuite écrite et relue pour vérification.
- Le journal n'est supprimé qu'après application et vérification de toutes les écritures.
- Au démarrage, l'initialisation relit le journal et rejoue les écritures prévues (roll-forward).
- Le rejeu est idempotent : une interruption répétée peut reprendre la même transaction.
- Un journal illisible ou incohérent bloque l'initialisation au lieu d'effacer ou de recréer les données.

## Opérations couvertes
- Création d'une commande et de ses lignes.
- Modification d'une commande avec remplacement éventuel de ses lignes.
- Suppression d'une commande et de ses lignes.
- Création SQLite d'une commande et de ses lignes dans une transaction native.
- Suppression SQLite d'une commande et de ses lignes dans une transaction native.
- Refus de supprimer un article utilisé par une ligne de commande, un fournisseur référencé par des articles/commandes, ou un transport référencé par une commande.

## Limites à ce stade
- localStorage ne fournit pas de transaction native ni de verrou inter-onglets. Le journal protège les interruptions d'écriture et la reprise au redémarrage, mais une concurrence simultanée entre plusieurs onglets doit être traitée séparément.
- Les opérations multi-tables SQLite utilisent les transactions natives et annulent l'ensemble si une écriture échoue.
- Les suppressions référencées sont refusées explicitement côté Web/Electron et SQLite ; aucune suppression en cascade métier n'est appliquée.
- Ce journal n'est pas une sauvegarde indépendante : il ne protège pas contre la désinstallation, la perte du téléphone ou la suppression du stockage local. Le système Backup & Restore reste indispensable.

## Tests
Tests synthétiques couvrant le commit normal, l'interruption après une première collection, la reprise au redémarrage, les journaux corrompus et les clés interdites.
