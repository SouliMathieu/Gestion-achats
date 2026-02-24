<template>
  <ion-app>
    <ion-tabs>
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
import { IonApp, IonRouterOutlet, IonTabs, IonTabBar, IonTabButton, IonIcon, IonLabel } from '@ionic/vue';
import { pieChartOutline, cubeOutline, storefrontOutline, airplaneOutline, cartOutline } from 'ionicons/icons';
import { onMounted } from 'vue';
import DatabaseService from '@/services/database.service';

onMounted(async () => {
  await DatabaseService.initDatabase();
});
</script>

<style>
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