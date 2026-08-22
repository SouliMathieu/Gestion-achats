<template>
  <ion-page>
    <ion-header>
      <ion-toolbar color="primary">
        <ion-buttons slot="start">
          <ion-back-button default-href="/articles"></ion-back-button>
        </ion-buttons>
        <ion-title>Détail Article</ion-title>
        <ion-buttons slot="end">
          <ion-button @click="editArticle">
            <ion-icon :icon="createOutline"></ion-icon>
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>

    <ion-content v-if="article">
      <!-- Photos -->
      <div class="photos-carousel" v-if="photos.length > 0">
        <img :src="photos[0]" />
      </div>
      <div class="no-photo" v-else>
        <ion-icon :icon="imageOutline" size="large"></ion-icon>
        <p>Aucune photo</p>
      </div>

      <!-- Informations principales -->
      <ion-card>
        <ion-card-header>
          <ion-card-title>{{ article.nom }}</ion-card-title>
          <ion-card-subtitle>
            <ion-badge :color="getStatutColor(article.statut)">
              {{ getStatutLabel(article.statut) }}
            </ion-badge>
          </ion-card-subtitle>
        </ion-card-header>
        <ion-card-content>
          <ion-list lines="none">
            <ion-item>
              <ion-label>
                <h3>Catégorie</h3>
                <p>{{ article.categorie }}</p>
              </ion-label>
            </ion-item>

            <ion-item v-if="article.description">
              <ion-label>
                <h3>Description</h3>
                <p>{{ article.description }}</p>
              </ion-label>
            </ion-item>

            <ion-item v-if="article.taille">
              <ion-label>
                <h3>Taille / Pointure</h3>
                <p>{{ article.taille }}</p>
              </ion-label>
            </ion-item>

            <ion-item v-if="article.couleur">
              <ion-label>
                <h3>Couleur</h3>
                <p>{{ article.couleur }}</p>
              </ion-label>
            </ion-item>

            <ion-item>
              <ion-label>
                <h3>Prix d'achat</h3>
                <h2 class="price">{{ article.prix }} {{ article.devise }}</h2>
              </ion-label>
            </ion-item>

            <ion-item v-if="fournisseur" button @click="goToFournisseur">
              <ion-label>
                <h3>Fournisseur</h3>
                <p>{{ fournisseur.nom }}</p>
              </ion-label>
              <ion-icon :icon="arrowForwardOutline" slot="end"></ion-icon>
            </ion-item>

            <ion-item v-if="article.notes">
              <ion-label>
                <h3>Notes</h3>
                <p>{{ article.notes }}</p>
              </ion-label>
            </ion-item>
          </ion-list>
        </ion-card-content>
      </ion-card>

      <!-- Métadonnées -->
      <ion-card>
        <ion-card-header>
          <ion-card-subtitle>Informations</ion-card-subtitle>
        </ion-card-header>
        <ion-card-content>
          <ion-list lines="none">
            <ion-item>
              <ion-label>
                <h3>Date de création</h3>
                <p>{{ formatDate(article.date_creation || article.dateCreation) }}</p>
              </ion-label>
            </ion-item>
            <ion-item>
              <ion-label>
                <h3>Dernière modification</h3>
                <p>{{ formatDate(article.date_modification || article.dateModification) }}</p>
              </ion-label>
            </ion-item>
          </ion-list>
        </ion-card-content>
      </ion-card>

      <!-- Actions -->
      <div class="ion-padding">
        <ion-button expand="block" color="danger" @click="confirmDelete">
          <ion-icon slot="start" :icon="trashOutline"></ion-icon>
          Supprimer l'article
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
import { onIonViewWillEnter } from '@ionic/vue';
import {
  IonPage, IonHeader, IonToolbar, IonTitle, IonContent, IonButtons,
  IonBackButton, IonButton, IonIcon, IonCard, IonCardHeader, IonCardTitle,
  IonCardSubtitle, IonCardContent, IonList, IonItem, IonLabel, IonBadge,
  IonSpinner, alertController, toastController
} from '@ionic/vue';
import {
  createOutline, trashOutline, imageOutline, arrowForwardOutline
} from 'ionicons/icons';
import DatabaseService from '@/services/database.service';

const route = useRoute();
const router = useRouter();

const article = ref<any>(null);
const fournisseur = ref<any>(null);
const photos = ref<string[]>([]);

const getStatutColor = (statut: string) => {
  const colors: any = {
    stock: 'success',
    commander: 'warning',
    suivi: 'medium'
  };
  return colors[statut] || 'medium';
};

const getStatutLabel = (statut: string) => {
  const labels: any = {
    stock: 'En stock',
    commander: 'À commander',
    suivi: 'Plus suivi'
  };
  return labels[statut] || statut;
};

const formatDate = (dateStr: string) => {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  return date.toLocaleDateString('fr-FR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
};

const loadArticle = async () => {
  const id = route.params.id as string;
  const articles = await DatabaseService.getArticles();
  article.value = articles.find((a: any) => a.id === id);

  if (article.value) {
    // Charger les photos
    const photosStr = article.value.photos;
    if (photosStr) {
      photos.value = photosStr.split('|||').filter((p: string) => p);
    }

    // Charger le fournisseur
    const fournisseurId = article.value.fournisseur_id || article.value.fournisseurId;
    if (fournisseurId) {
      const fournisseurs = await DatabaseService.getFournisseurs();
      fournisseur.value = fournisseurs.find((f: any) => f.id === fournisseurId);
    }
  }
};

const editArticle = () => {
  // Stocker l'article complet dans sessionStorage
  sessionStorage.setItem('editingArticle', JSON.stringify(article.value));
  router.replace('/articles');
};

const goToFournisseur = () => {
  if (fournisseur.value) {
    router.push(`/fournisseurs/${fournisseur.value.id}`);
  }
};

const confirmDelete = async () => {
  const alert = await alertController.create({
    header: 'Confirmer',
    message: `Supprimer l'article "${article.value.nom}" ?`,
    buttons: [
      { text: 'Annuler', role: 'cancel' },
      {
        text: 'Supprimer',
        role: 'destructive',
        handler: async () => {
          await DatabaseService.deleteArticle(article.value.id);
          const toast = await toastController.create({
            message: 'Article supprimé',
            duration: 2000,
            color: 'success'
          });
          await toast.present();
          router.replace('/articles');
        }
      }
    ]
  });
  await alert.present();
};

onMounted(() => {
  loadArticle();
});
</script>

<style scoped>
.photos-carousel {
  height: 300px;
  background: var(--ion-color-light);
}

.photos-carousel img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.no-photo {
  height: 300px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: var(--ion-color-light);
  color: var(--ion-color-medium);
}

.no-photo ion-icon {
  font-size: 64px;
  margin-bottom: 16px;
}

.price {
  color: var(--ion-color-primary);
  font-size: 24px;
  font-weight: bold;
}
</style>
