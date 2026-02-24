<template>
  <ion-page>
    <ion-header>
      <ion-toolbar color="primary">
        <ion-buttons slot="start">
          <ion-back-button default-href="/fournisseurs"></ion-back-button>
        </ion-buttons>
        <ion-title>Détail Fournisseur</ion-title>
        <ion-buttons slot="end">
          <ion-button @click="editFournisseur">
            <ion-icon :icon="createOutline"></ion-icon>
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>

    <ion-content v-if="fournisseur">
      <!-- En-tête -->
      <div class="header-card">
        <div class="avatar">🏪</div>
        <h1>{{ fournisseur.nom }}</h1>
        <p>{{ fournisseur.type }} • {{ fournisseur.ville }}, {{ fournisseur.pays }}</p>
      </div>

      <!-- Coordonnées -->
      <ion-card>
        <ion-card-header>
          <ion-card-title>Coordonnées</ion-card-title>
        </ion-card-header>
        <ion-card-content>
          <ion-list lines="none">
            <ion-item v-if="fournisseur.adresse">
              <ion-icon :icon="locationOutline" slot="start"></ion-icon>
              <ion-label>
                <h3>Adresse</h3>
                <p>{{ fournisseur.adresse }}</p>
              </ion-label>
            </ion-item>

            <ion-item v-if="fournisseur.telephone">
              <ion-icon :icon="callOutline" slot="start"></ion-icon>
              <ion-label>
                <h3>Téléphone / WhatsApp</h3>
                <p>{{ fournisseur.telephone }}</p>
              </ion-label>
              <ion-button slot="end" fill="clear" :href="'tel:' + fournisseur.telephone">
                <ion-icon :icon="callOutline"></ion-icon>
              </ion-button>
            </ion-item>

            <ion-item v-if="fournisseur.reseaux_sociaux || fournisseur.reseauxSociaux">
              <ion-icon :icon="shareOutline" slot="start"></ion-icon>
              <ion-label>
                <h3>Réseaux sociaux</h3>
                <p>{{ fournisseur.reseaux_sociaux || fournisseur.reseauxSociaux }}</p>
              </ion-label>
            </ion-item>

            <ion-item v-if="fournisseur.localisation" button @click="openMaps">
              <ion-icon :icon="mapOutline" slot="start"></ion-icon>
              <ion-label>
                <h3>Localisation Google Maps</h3>
                <p>Voir sur la carte</p>
              </ion-label>
              <ion-icon :icon="arrowForwardOutline" slot="end"></ion-icon>
            </ion-item>
          </ion-list>
        </ion-card-content>
      </ion-card>

      <!-- Articles principaux -->
      <ion-card v-if="fournisseur.articles_principaux || fournisseur.articlesPrincipaux">
        <ion-card-header>
          <ion-card-title>Articles principaux</ion-card-title>
        </ion-card-header>
        <ion-card-content>
          <p>{{ fournisseur.articles_principaux || fournisseur.articlesPrincipaux }}</p>
        </ion-card-content>
      </ion-card>

      <!-- Notes -->
      <ion-card v-if="fournisseur.notes">
        <ion-card-header>
          <ion-card-title>Notes internes</ion-card-title>
        </ion-card-header>
        <ion-card-content>
          <p>{{ fournisseur.notes }}</p>
        </ion-card-content>
      </ion-card>

      <!-- Articles associés -->
      <ion-card>
        <ion-card-header>
          <ion-card-title>Articles de ce fournisseur</ion-card-title>
        </ion-card-header>
        <ion-card-content>
          <ion-list v-if="articlesAssocies.length > 0">
            <ion-item v-for="article in articlesAssocies" :key="article.id" 
                      button @click="goToArticle(article.id)">
              <ion-label>
                <h2>{{ article.nom }}</h2>
                <p>{{ article.prix }} {{ article.devise }}</p>
              </ion-label>
              <ion-badge slot="end" :color="getStatutColor(article.statut)">
                {{ getStatutLabel(article.statut) }}
              </ion-badge>
            </ion-item>
          </ion-list>
          <p v-else class="ion-text-center">Aucun article associé</p>
        </ion-card-content>
      </ion-card>

      <!-- Actions -->
      <div class="ion-padding">
        <ion-button expand="block" color="danger" @click="confirmDelete">
          <ion-icon slot="start" :icon="trashOutline"></ion-icon>
          Supprimer le fournisseur
        </ion-button>
      </div>
    </ion-content>

    <ion-content v-else>
      <div class="ion-padding ion-text-center">
        <ion-spinner></ion-spinner>
      </div>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import {
  IonPage, IonHeader, IonToolbar, IonTitle, IonContent, IonButtons,
  IonBackButton, IonButton, IonIcon, IonCard, IonCardHeader, IonCardTitle,
  IonCardContent, IonList, IonItem, IonLabel, IonBadge, IonSpinner,
  alertController, toastController
} from '@ionic/vue';
import {
  createOutline, trashOutline, locationOutline, callOutline, shareOutline,
  mapOutline, arrowForwardOutline
} from 'ionicons/icons';
import DatabaseService from '@/services/database.service';
import { Browser } from '@capacitor/browser';

const route = useRoute();
const router = useRouter();

const fournisseur = ref<any>(null);
const articlesAssocies = ref<any[]>([]);

const getStatutColor = (statut: string) => {
  const colors: any = { stock: 'success', commander: 'warning', suivi: 'medium' };
  return colors[statut] || 'medium';
};

const getStatutLabel = (statut: string) => {
  const labels: any = { stock: 'En stock', commander: 'À commander', suivi: 'Plus suivi' };
  return labels[statut] || statut;
};

const loadFournisseur = async () => {
  const id = route.params.id as string;
  const fournisseurs = await DatabaseService.getFournisseurs();
  fournisseur.value = fournisseurs.find((f: any) => f.id === id);

  if (fournisseur.value) {
    const articles = await DatabaseService.getArticles();
    articlesAssocies.value = articles.filter((a: any) => 
      (a.fournisseur_id || a.fournisseurId) === id
    );
  }
};

const editFournisseur = () => {
  sessionStorage.setItem('editingFournisseur', JSON.stringify(fournisseur.value));
  router.replace('/fournisseurs');
};

const goToArticle = (id: string) => {
  router.push(`/articles/${id}`);
};

const openMaps = async () => {
  if (fournisseur.value.localisation) {
    await Browser.open({ url: fournisseur.value.localisation });
  }
};

const confirmDelete = async () => {
  const alert = await alertController.create({
    header: 'Confirmer',
    message: `Supprimer le fournisseur "${fournisseur.value.nom}" ?`,
    buttons: [
      { text: 'Annuler', role: 'cancel' },
      {
        text: 'Supprimer',
        role: 'destructive',
        handler: async () => {
          await DatabaseService.deleteFournisseur(fournisseur.value.id);
          const toast = await toastController.create({
            message: 'Fournisseur supprimé',
            duration: 2000,
            color: 'success'
          });
          await toast.present();
          router.replace('/fournisseurs');
        }
      }
    ]
  });
  await alert.present();
};

onMounted(() => {
  loadFournisseur();
});
</script>

<style scoped>
.header-card {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  padding: 32px 16px;
  text-align: center;
}

.avatar {
  width: 80px;
  height: 80px;
  margin: 0 auto 16px;
  background: rgba(255, 255, 255, 0.2);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 40px;
}

.header-card h1 {
  margin: 0 0 8px 0;
  font-size: 24px;
}

.header-card p {
  margin: 0;
  opacity: 0.9;
}
</style>