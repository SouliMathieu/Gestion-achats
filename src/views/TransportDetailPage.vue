<template>
  <ion-page>
    <ion-header>
      <ion-toolbar color="primary">
        <ion-buttons slot="start">
          <ion-back-button default-href="/transport"></ion-back-button>
        </ion-buttons>
        <ion-title>Détail Transport</ion-title>
        <ion-buttons slot="end">
          <ion-button @click="editTransport">
            <ion-icon :icon="createOutline"></ion-icon>
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>

    <ion-content v-if="transport">
      <!-- En-tête -->
      <div class="header-card">
        <div class="avatar">{{ getTypeIcon(transport.type) }}</div>
        <h1>{{ transport.nom }}</h1>
        <p>{{ transport.type }}</p>
      </div>

      <!-- Trajet -->
      <ion-card>
        <ion-card-header>
          <ion-card-title>Trajet</ion-card-title>
        </ion-card-header>
        <ion-card-content>
          <div class="trajet">
            <div class="point">
              <ion-icon :icon="locationOutline"></ion-icon>
              <div>
                <h3>Départ</h3>
                <p>{{ transport.ville_depart || transport.villeDepart }}, {{ transport.pays_depart || transport.paysDepart }}</p>
              </div>
            </div>
            <div class="arrow">
              <ion-icon :icon="arrowDownOutline"></ion-icon>
            </div>
            <div class="point">
              <ion-icon :icon="locationOutline"></ion-icon>
              <div>
                <h3>Arrivée</h3>
                <p>{{ transport.ville_arrivee || transport.villeArrivee }}, {{ transport.pays_arrivee || transport.paysArrivee }}</p>
              </div>
            </div>
          </div>

          <ion-list lines="none" class="ion-margin-top">
            <ion-item v-if="transport.duree_trajet || transport.dureeTrajet">
              <ion-icon :icon="timeOutline" slot="start"></ion-icon>
              <ion-label>
                <h3>Durée estimée</h3>
                <p>{{ transport.duree_trajet || transport.dureeTrajet }}</p>
              </ion-label>
            </ion-item>
          </ion-list>
        </ion-card-content>
      </ion-card>

      <!-- Coordonnées -->
      <ion-card>
        <ion-card-header>
          <ion-card-title>Coordonnées</ion-card-title>
        </ion-card-header>
        <ion-card-content>
          <ion-list lines="none">
            <ion-item v-if="transport.adresse">
              <ion-icon :icon="locationOutline" slot="start"></ion-icon>
              <ion-label>
                <h3>Adresse</h3>
                <p>{{ transport.adresse }}</p>
              </ion-label>
            </ion-item>

            <ion-item v-if="transport.telephone">
              <ion-icon :icon="callOutline" slot="start"></ion-icon>
              <ion-label>
                <h3>Téléphone / WhatsApp</h3>
                <p>{{ transport.telephone }}</p>
              </ion-label>
              <ion-button slot="end" fill="clear" :href="'tel:' + transport.telephone">
                <ion-icon :icon="callOutline"></ion-icon>
              </ion-button>
            </ion-item>
          </ion-list>
        </ion-card-content>
      </ion-card>

      <!-- Programme -->
      <ion-card v-if="transport.programme">
        <ion-card-header>
          <ion-card-title>Programme de départ</ion-card-title>
        </ion-card-header>
        <ion-card-content>
          <p>{{ transport.programme }}</p>
        </ion-card-content>
      </ion-card>

      <!-- Tarification -->
      <ion-card>
        <ion-card-header>
          <ion-card-title>Tarification</ion-card-title>
        </ion-card-header>
        <ion-card-content>
          <ion-list lines="none">
            <ion-item v-if="transport.mode_tarification || transport.modeTarification">
              <ion-label>
                <h3>Mode de tarification</h3>
                <p>{{ transport.mode_tarification || transport.modeTarification }}</p>
              </ion-label>
            </ion-item>

            <ion-item v-if="transport.grille_tarifaire || transport.grilleTarifaire">
              <ion-label>
                <h3>Grille tarifaire</h3>
                <p style="white-space: pre-line;">{{ transport.grille_tarifaire || transport.grilleTarifaire }}</p>
              </ion-label>
            </ion-item>
          </ion-list>
        </ion-card-content>
      </ion-card>

      <!-- Services -->
      <ion-card v-if="transport.services">
        <ion-card-header>
          <ion-card-title>Services complémentaires</ion-card-title>
        </ion-card-header>
        <ion-card-content>
          <p>{{ transport.services }}</p>
        </ion-card-content>
      </ion-card>

      <!-- Notes -->
      <ion-card v-if="transport.notes">
        <ion-card-header>
          <ion-card-title>Notes internes</ion-card-title>
        </ion-card-header>
        <ion-card-content>
          <p>{{ transport.notes }}</p>
        </ion-card-content>
      </ion-card>

      <!-- Commandes utilisant ce transport -->
      <ion-card>
        <ion-card-header>
          <ion-card-title>Commandes avec ce transport</ion-card-title>
        </ion-card-header>
        <ion-card-content>
          <ion-list v-if="commandesAssociees.length > 0">
            <ion-item v-for="commande in commandesAssociees" :key="commande.id"
                      button @click="goToCommande(commande.id)">
              <ion-label>
                <h2>{{ commande.numero }}</h2>
                <p>{{ formatDate(commande.date_commande || commande.dateCommande) }}</p>
              </ion-label>
              <ion-note slot="end">{{ commande.cout_total || commande.coutTotal }} {{ commande.devise }}</ion-note>
            </ion-item>
          </ion-list>
          <p v-else class="ion-text-center">Aucune commande</p>
        </ion-card-content>
      </ion-card>

      <!-- Actions -->
      <div class="ion-padding">
        <ion-button expand="block" color="danger" @click="confirmDelete">
          <ion-icon slot="start" :icon="trashOutline"></ion-icon>
          Supprimer l'agence
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
  IonCardContent, IonList, IonItem, IonLabel, IonNote, IonSpinner,
  alertController, toastController
} from '@ionic/vue';
import {
  createOutline, trashOutline, locationOutline, callOutline,
  arrowDownOutline, timeOutline
} from 'ionicons/icons';
import DatabaseService from '@/services/database.service';

const route = useRoute();
const router = useRouter();

const transport = ref<any>(null);
const commandesAssociees = ref<any[]>([]);

const getTypeIcon = (type: string) => {
  const icons: any = { aerien: '✈️', terrestre: '🚚', maritime: '🚢' };
  return icons[type] || '🚚';
};

const formatDate = (dateStr: string) => {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  return date.toLocaleDateString('fr-FR');
};

const loadTransport = async () => {
  const id = route.params.id as string;
  const transports = await DatabaseService.getTransports();
  transport.value = transports.find((t: any) => t.id === id);

  if (transport.value) {
    const commandes = await DatabaseService.getCommandes();
    commandesAssociees.value = commandes.filter((c: any) => 
      (c.transport_id || c.transportId) === id
    );
  }
};

const editTransport = () => {
  sessionStorage.setItem('editingTransport', JSON.stringify(transport.value));
  router.replace('/transport');
};

const goToCommande = (id: string) => {
  router.push(`/commandes/${id}`);
};

const confirmDelete = async () => {
  const alert = await alertController.create({
    header: 'Confirmer',
    message: `Supprimer l'agence "${transport.value.nom}" ?`,
    buttons: [
      { text: 'Annuler', role: 'cancel' },
      {
        text: 'Supprimer',
        role: 'destructive',
        handler: async () => {
          await DatabaseService.deleteTransport(transport.value.id);
          const toast = await toastController.create({
            message: 'Agence supprimée',
            duration: 2000,
            color: 'success'
          });
          await toast.present();
          router.replace('/transport');
        }
      }
    ]
  });
  await alert.present();
};

onMounted(() => {
  loadTransport();
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

.trajet {
  padding: 16px 0;
}

.point {
  display: flex;
  align-items: flex-start;
  gap: 12px;
}

.point ion-icon {
  font-size: 24px;
  color: var(--ion-color-primary);
  margin-top: 4px;
}

.point h3 {
  margin: 0 0 4px 0;
  font-size: 14px;
  font-weight: 600;
  color: var(--ion-color-medium);
}

.point p {
  margin: 0;
  font-size: 16px;
}

.arrow {
  text-align: center;
  margin: 8px 0;
}

.arrow ion-icon {
  font-size: 24px;
  color: var(--ion-color-medium);
}
</style>