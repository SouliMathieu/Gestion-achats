<template>
  <ion-app>
    <ion-page v-if="databaseState !== 'ready'">
      <ion-content class="ion-padding">
        <div role="status" aria-live="polite" class="database-state">
          <template v-if="databaseState === 'loading'">
            <ion-spinner aria-label="Chargement" />
            <h1>Ouverture de vos données…</h1>
          </template>
          <template v-else>
            <h1>Vos données sont indisponibles</h1>
            <p>{{ databaseError }}</p>
            <section v-if="databaseDiagnostic" class="database-diagnostic">
              <p><strong>Diagnostic technique</strong></p>
              <p>Code : {{ databaseDiagnostic.code }}</p>
              <p v-if="databaseDiagnostic.stage">Étape : {{ databaseDiagnostic.stage }}</p>
              <p v-if="databaseDiagnostic.cause">Cause : {{ databaseDiagnostic.cause }}</p>
              <p v-if="databaseDiagnostic.kind">Schéma détecté : {{ databaseDiagnostic.kind }}</p>
              <p v-if="databaseDiagnostic.version !== null">Version SQLite : {{ databaseDiagnostic.version }}</p>
              <p v-if="databaseDiagnostic.counts">Tables et enregistrements : {{ databaseDiagnostic.counts }}</p>
              <p>Build : {{ buildCommit }}</p>
            </section>
            <p>Aucune réinitialisation automatique n’est effectuée. Ne désinstallez pas l’application et ne videz pas son stockage.</p>
            <template v-if="databaseNeedsConfirmation">
              <p>La structure SQLite est incomplète. Une copie de protection sera créée et vérifiée avant l’ajout des tables manquantes. Les tables et enregistrements existants seront contrôlés avant validation. En cas d’échec, la transaction sera annulée.</p>
              <ion-button :disabled="confirmingDatabase" @click="confirmEmptyDatabase">
                {{ confirmingDatabase ? 'Protection et réparation…' : 'Protéger et compléter la base' }}
              </ion-button>
            </template>
            <ion-button v-else @click="reloadApplication">Réessayer l’ouverture</ion-button>
          </template>
        </div>
      </ion-content>
    </ion-page>
    <ion-tabs v-else>
      <ion-router-outlet></ion-router-outlet>
      <ion-tab-bar slot="bottom">
        <ion-tab-button tab="dashboard" href="/dashboard">
          <ion-icon :icon="pieChartOutline" />
          <ion-label>Tableau</ion-label>
        </ion-tab-button>

        <ion-tab-button tab="articles" href="/articles">
          <ion-icon :icon="cubeOutline" />
          <ion-label>Articles</ion-label>
        </ion-tab-button>

        <ion-tab-button tab="fournisseurs" href="/fournisseurs">
          <ion-icon :icon="storefrontOutline" />
          <ion-label>Fournisseurs</ion-label>
        </ion-tab-button>

        <ion-tab-button tab="transport" href="/transport">
          <ion-icon :icon="airplaneOutline" />
          <ion-label>Transport</ion-label>
        </ion-tab-button>

        <ion-tab-button tab="commandes" href="/commandes">
          <ion-icon :icon="cartOutline" />
          <ion-label>Commandes</ion-label>
        </ion-tab-button>
      </ion-tab-bar>
    </ion-tabs>
  </ion-app>
</template>

<script setup lang="ts">
import { IonApp, IonRouterOutlet, IonTabs, IonTabBar, IonTabButton, IonIcon, IonLabel, IonPage, IonContent, IonSpinner, IonButton } from '@ionic/vue';
import { pieChartOutline, cubeOutline, storefrontOutline, airplaneOutline, cartOutline } from 'ionicons/icons';
import { onMounted, ref } from 'vue';
import DatabaseService from '@/services/database.service';
import { DatabaseInitializationError } from '@/services/database-initialization';
import { backupService } from '@/services/backup.service';

const databaseState = ref<'loading' | 'ready' | 'error'>('loading');
const databaseError = ref('');
const databaseDiagnostic = ref<{code: string; stage?: string; cause?: string; kind?: string; version: number | null; counts?: string} | null>(null);
const buildCommit = import.meta.env.VITE_BUILD_COMMIT || 'non renseigné';
const databaseNeedsConfirmation = ref(false);
const confirmingDatabase = ref(false);
const reloadApplication = () => window.location.reload();

function describeOriginalError(value: unknown, depth = 0): string {
  if (value === null || value === undefined) return '';
  if (depth > 3) return 'Détails supplémentaires indisponibles';
  if (value instanceof Error) return `${value.name}: ${value.message}`;
  if (typeof value === 'string') return value;
  if (typeof value !== 'object') return String(value);
  const item = value as Record<string, unknown>;
  const parts: string[] = [];
  for (const key of ['stage', 'message']) {
    if (typeof item[key] === 'string' && item[key]) parts.push(String(item[key]));
  }
  for (const key of ['originalError', 'cause', 'error', 'rollbackError']) {
    if (item[key] !== undefined) {
      const detail = describeOriginalError(item[key], depth + 1);
      if (detail && !parts.includes(detail)) parts.push(detail);
    }
  }
  if (parts.length) return parts.join(' → ').slice(0, 900);
  try { return JSON.stringify(value).slice(0, 900); }
  catch { return 'Erreur technique non sérialisable'; }
}

const confirmEmptyDatabase = async () => {
  if (confirmingDatabase.value) return;
  confirmingDatabase.value = true;
  databaseError.value = '';
  try {
    await DatabaseService.confirmEmptyDatabaseInitialization();
    databaseNeedsConfirmation.value = false;
    databaseState.value = 'ready';
    void backupService.ensureDailySnapshot().catch(error => {
      console.warn('Sauvegarde automatique locale indisponible :', error);
    });
  } catch (error) {
    databaseError.value = error instanceof Error ? error.message : 'L’initialisation confirmée a échoué.';
    databaseNeedsConfirmation.value = error instanceof DatabaseInitializationError &&
      (error.code === 'EMPTY_DATABASE_CONFIRMATION' || error.code === 'SCHEMA_COMPLETION_CONFIRMATION');
  } finally {
    confirmingDatabase.value = false;
  }
};

onMounted(async () => {
  try {
    await DatabaseService.initDatabase();
    databaseState.value = 'ready';
    // Une seule copie automatique par jour ; son échec ne bloque jamais l'accès aux données.
    void backupService.ensureDailySnapshot().catch(error => {
      console.warn('Sauvegarde automatique locale indisponible :', error);
    });
  } catch (error) {
    databaseError.value = error instanceof DatabaseInitializationError ? error.message : 'L’ouverture du stockage a échoué.';
    if (error instanceof DatabaseInitializationError) {
      const report = error.report;
      databaseDiagnostic.value = {
        code: error.code,
        stage: error.originalError && typeof error.originalError === 'object' &&
          typeof (error.originalError as Record<string, unknown>).stage === 'string'
          ? String((error.originalError as Record<string, unknown>).stage) : undefined,
        cause: describeOriginalError(error.originalError),
        kind: report?.kind,
        version: report?.version ?? null,
        counts: report ? JSON.stringify(report.counts) : undefined
      };
    } else {
      databaseDiagnostic.value = {code: 'UNEXPECTED', version: null};
    }
    databaseNeedsConfirmation.value = error instanceof DatabaseInitializationError &&
      (error.code === 'EMPTY_DATABASE_CONFIRMATION' || error.code === 'SCHEMA_COMPLETION_CONFIRMATION');
    databaseState.value = 'error';
  }
});
</script>

<style>
.database-state {
  max-width: 40rem;
  margin: 8vh auto;
}

.database-diagnostic {
  margin-top: 1rem;
  padding: 0.75rem;
  border: 1px solid var(--ion-color-step-300);
  border-radius: 8px;
  overflow-wrap: anywhere;
  font-size: 0.9rem;
}

:root {
  --ion-color-primary: #667eea;
  --ion-color-primary-rgb: 102, 126, 234;
  --ion-color-primary-contrast: #ffffff;
  --ion-color-primary-contrast-rgb: 255, 255, 255;
  --ion-color-primary-shade: #5a6fce;
  --ion-color-primary-tint: #758dec;
}

ion-tab-bar {
  --background: var(--ion-color-step-50);
  border-top: 1px solid var(--ion-color-step-150);
}
</style>
