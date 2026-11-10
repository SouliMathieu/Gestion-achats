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
            <p>Aucune réinitialisation automatique n’est effectuée. Ne désinstallez pas l’application et ne videz pas son stockage.</p>
            <ion-button @click="reloadApplication">Réessayer l’ouverture</ion-button>
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
const reloadApplication = () => window.location.reload();

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
    databaseState.value = 'error';
  }
});
</script>

<style>
.database-state {
  max-width: 40rem;
  margin: 12vh auto;
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
