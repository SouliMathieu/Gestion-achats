<template>
  <ion-page>
    <ion-header>
      <ion-toolbar color="primary">
        <ion-title>Tableau de bord</ion-title>
        <ion-buttons slot="end">
          <ion-button @click="refresh">
            <ion-icon :icon="refreshOutline"></ion-icon>
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>

    <ion-content>
      <ion-refresher slot="fixed" @ionRefresh="handleRefresh">
        <ion-refresher-content></ion-refresher-content>
      </ion-refresher>

      <!-- Statistiques -->
      <div class="stats-grid">
        <ion-card class="stat-card" button @click="goTo('/articles')">
          <ion-card-content>
            <div class="stat-icon">📦</div>
            <h2>{{ stats.totalArticles }}</h2>
            <p>Articles</p>
          </ion-card-content>
        </ion-card>

        <ion-card class="stat-card" button @click="goTo('/fournisseurs')">
          <ion-card-content>
            <div class="stat-icon">🏪</div>
            <h2>{{ stats.totalFournisseurs }}</h2>
            <p>Fournisseurs</p>
          </ion-card-content>
        </ion-card>

        <ion-card class="stat-card" button @click="goTo('/commandes')">
          <ion-card-content>
            <div class="stat-icon">📋</div>
            <h2>{{ stats.totalCommandes }}</h2>
            <p>Commandes</p>
          </ion-card-content>
        </ion-card>

        <ion-card class="stat-card">
          <ion-card-content>
            <div class="stat-icon">💰</div>
            <div v-if="stats.totalAchats.length > 0">
              <h2 v-for="total in stats.totalAchats" :key="total.devise">
                {{ total.total.toFixed(0) }} {{ total.devise }}
              </h2>
            </div>
            <h2 v-else>0</h2>
            <p>Total achats</p>
          </ion-card-content>
        </ion-card>
      </div>

      <!-- Commandes récentes -->
      <ion-card>
        <ion-card-header>
          <ion-card-title>Commandes récentes</ion-card-title>
        </ion-card-header>
        <ion-card-content>
          <ion-list v-if="recentCommandes.length > 0">
            <ion-item 
              v-for="commande in recentCommandes" 
              :key="commande.id"
              button
              @click="goToCommande(commande.id)"
            >
              <ion-label>
                <h2>{{ commande.numero }}</h2>
                <p>{{ formatDate(commande.date_commande || commande.dateCommande) }}</p>
                <h3>{{ commande.cout_total || commande.coutTotal }} {{ commande.devise }}</h3>
              </ion-label>
              <ion-badge slot="end" :color="getStatusColor(commande.statut)">
                {{ getStatusLabel(commande.statut) }}
              </ion-badge>
            </ion-item>
          </ion-list>
          <p v-else class="ion-text-center ion-padding">Aucune commande</p>
        </ion-card-content>
      </ion-card>

      <!-- Actions rapides -->
      <ion-card>
        <ion-card-header>
          <ion-card-title>Actions rapides</ion-card-title>
        </ion-card-header>
        <ion-card-content>
          <div class="quick-actions">
            <ion-button expand="block" @click="goTo('/articles')">
              <ion-icon slot="start" :icon="addOutline"></ion-icon>
              Nouvel article
            </ion-button>
            <ion-button expand="block" @click="goTo('/commandes')">
              <ion-icon slot="start" :icon="cartOutline"></ion-icon>
              Nouvelle commande
            </ion-button>
          </div>
        </ion-card-content>
      </ion-card>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import {
  IonPage, IonHeader, IonToolbar, IonTitle, IonContent, IonButtons,
  IonButton, IonIcon, IonCard, IonCardHeader, IonCardTitle, IonCardContent,
  IonList, IonItem, IonLabel, IonBadge, IonRefresher, IonRefresherContent
} from '@ionic/vue';
import {
  refreshOutline, addOutline, cartOutline
} from 'ionicons/icons';
import DatabaseService from '@/services/database.service';

const router = useRouter();

const stats = ref({
  totalArticles: 0,
  totalFournisseurs: 0,
  totalCommandes: 0,
  totalAchats: [] as any[]
});

const recentCommandes = ref<any[]>([]);

const loadStats = async () => {
  const statsData = await DatabaseService.getStats();
  if (statsData) {
    stats.value = statsData;
  }
};

const loadRecentCommandes = async () => {
  recentCommandes.value = await DatabaseService.getRecentCommandes(5);
};

const formatDate = (dateStr: string) => {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  return date.toLocaleDateString('fr-FR');
};

const getStatusColor = (statut: string) => {
  const colors: any = {
    brouillon: 'medium',
    validee: 'primary',
    preparation: 'warning',
    envoyee: 'secondary',
    recue: 'success'
  };
  return colors[statut] || 'medium';
};

const getStatusLabel = (statut: string) => {
  const labels: any = {
    brouillon: 'Brouillon',
    validee: 'Validée',
    preparation: 'En préparation',
    envoyee: 'Envoyée',
    recue: 'Reçue'
  };
  return labels[statut] || statut;
};

const refresh = async () => {
  await loadStats();
  await loadRecentCommandes();
};

const handleRefresh = async (event: any) => {
  await refresh();
  event.target.complete();
};

const goTo = (path: string) => {
  router.push(path);
};

const goToCommande = (id: string) => {
  router.push(`/commandes/${id}`);
};

onMounted(async () => {
  await refresh();
});
</script>

<style scoped>
.stats-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 12px;
  padding: 16px;
}

.stat-card {
  margin: 0;
  cursor: pointer;
  transition: transform 0.2s;
}

.stat-card:active {
  transform: scale(0.98);
}

.stat-card ion-card-content {
  text-align: center;
  padding: 20px;
}

.stat-icon {
  font-size: 48px;
  margin-bottom: 8px;
}

.stat-card h2 {
  font-size: 32px;
  font-weight: bold;
  color: var(--ion-color-primary);
  margin: 8px 0;
}

.stat-card p {
  font-size: 14px;
  color: var(--ion-color-medium);
  margin: 0;
}

.quick-actions {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
</style>