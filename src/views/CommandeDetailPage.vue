<template>
  <ion-page>
    <ion-header>
      <ion-toolbar color="primary">
        <ion-buttons slot="start">
          <ion-back-button default-href="/commandes"></ion-back-button>
        </ion-buttons>
        <ion-title>Détail Commande</ion-title>
        <ion-buttons slot="end">
          <ion-button @click="editCommande">
            <ion-icon :icon="createOutline"></ion-icon>
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>

    <ion-content v-if="commande">
      <!-- En-tête -->
      <div class="header-card">
        <h1>{{ commande.numero }}</h1>
        <p>{{ formatDate(commande.date_commande || commande.dateCommande) }}</p>
        <ion-badge :color="getStatusColor(commande.statut)" style="margin-top: 12px;">
          {{ getStatusLabel(commande.statut) }}
        </ion-badge>
      </div>

      <!-- Informations générales -->
      <ion-card>
        <ion-card-header>
          <ion-card-title>Informations</ion-card-title>
        </ion-card-header>
        <ion-card-content>
          <ion-list lines="none">
            <ion-item v-if="fournisseur" button @click="goToFournisseur">
              <ion-label>
                <h3>Fournisseur</h3>
                <p>{{ fournisseur.nom }}</p>
              </ion-label>
              <ion-icon :icon="arrowForwardOutline" slot="end"></ion-icon>
            </ion-item>

            <ion-item v-if="transportAgence" button @click="goToTransport">
              <ion-label>
                <h3>Agence de transport</h3>
                <p>{{ transportAgence.nom }}</p>
              </ion-label>
              <ion-icon :icon="arrowForwardOutline" slot="end"></ion-icon>
            </ion-item>

            <ion-item v-if="commande.mode_paiement || commande.modePaiement">
              <ion-label>
                <h3>Mode de paiement</h3>
                <p>{{ getModePaiementLabel(commande.mode_paiement || commande.modePaiement) }}</p>
              </ion-label>
            </ion-item>
          </ion-list>
        </ion-card-content>
      </ion-card>

      <!-- Articles commandés -->
      <ion-card>
        <ion-card-header>
          <ion-card-title>Articles ({{ lignes.length }})</ion-card-title>
        </ion-card-header>
        <ion-card-content>
          <ion-list v-if="lignes.length > 0">
            <ion-item v-for="ligne in lignes" :key="ligne.id">
              <ion-label>
                <h2>{{ getArticleName(ligne.article_id || ligne.articleId) }}</h2>
                <p>{{ ligne.quantite }} × {{ ligne.prix_unitaire || ligne.prixUnitaire }} {{ ligne.devise }}</p>
              </ion-label>
              <ion-note slot="end">
                {{ (ligne.quantite * (ligne.prix_unitaire || ligne.prixUnitaire)).toFixed(2) }} {{ ligne.devise }}
              </ion-note>
            </ion-item>
          </ion-list>
          <p v-else class="ion-text-center">Aucun article</p>
        </ion-card-content>
      </ion-card>

      <!-- Récapitulatif financier -->
      <ion-card>
        <ion-card-header>
          <ion-card-title>Récapitulatif</ion-card-title>
        </ion-card-header>
        <ion-card-content>
          <ion-list lines="none">
            <ion-item>
              <ion-label>Total articles</ion-label>
              <ion-note slot="end">{{ totalArticles.toFixed(2) }} {{ commande.devise }}</ion-note>
            </ion-item>

            <ion-item v-if="(commande.cout_transport || commande.coutTransport) > 0">
              <ion-label>Transport</ion-label>
              <ion-note slot="end">{{ (commande.cout_transport || commande.coutTransport).toFixed(2) }} {{ commande.devise }}</ion-note>
            </ion-item>

            <ion-item color="light">
              <ion-label>
                <h2><strong>TOTAL</strong></h2>
              </ion-label>
              <ion-note slot="end">
                <h2><strong>{{ (commande.cout_total || commande.coutTotal).toFixed(2) }} {{ commande.devise }}</strong></h2>
              </ion-note>
            </ion-item>
          </ion-list>
        </ion-card-content>
      </ion-card>

      <!-- Notes -->
      <ion-card v-if="commande.notes">
        <ion-card-header>
          <ion-card-title>Notes</ion-card-title>
        </ion-card-header>
        <ion-card-content>
          <p>{{ commande.notes }}</p>
        </ion-card-content>
      </ion-card>

      <!-- Changer le statut -->
      <ion-card>
        <ion-card-header>
          <ion-card-title>Changer le statut</ion-card-title>
        </ion-card-header>
        <ion-card-content>
          <ion-list>
            <ion-item>
              <ion-select
                v-model="nouveauStatut"
                placeholder="Sélectionner un statut"
                @ionChange="updateStatut"
              >
                <ion-select-option value="brouillon">Brouillon</ion-select-option>
                <ion-select-option value="validee">Validée</ion-select-option>
                <ion-select-option value="preparation">En préparation</ion-select-option>
                <ion-select-option value="envoyee">Envoyée</ion-select-option>
                <ion-select-option value="recue">Reçue</ion-select-option>
              </ion-select>
            </ion-item>
          </ion-list>
        </ion-card-content>
      </ion-card>

      <!-- Actions -->
      <div class="ion-padding">
        <ion-button expand="block" color="danger" @click="confirmDelete">
          <ion-icon slot="start" :icon="trashOutline"></ion-icon>
          Supprimer la commande
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
import { ref, onMounted, computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import {
  IonPage, IonHeader, IonToolbar, IonTitle, IonContent, IonButtons,
  IonBackButton, IonButton, IonIcon, IonCard, IonCardHeader, IonCardTitle,
  IonCardContent, IonList, IonItem, IonLabel, IonNote, IonBadge, IonSelect,
  IonSelectOption, IonSpinner, alertController, toastController
} from '@ionic/vue';
import {
  createOutline, trashOutline, arrowForwardOutline
} from 'ionicons/icons';
import DatabaseService from '@/services/database.service';

const route = useRoute();
const router = useRouter();

const commande = ref<any>(null);
const lignes = ref<any[]>([]);
const fournisseur = ref<any>(null);
const transportAgence = ref<any>(null);
const articles = ref<any[]>([]);
const nouveauStatut = ref('');

const totalArticles = computed(() => {
  return lignes.value.reduce((sum, ligne) => {
    return sum + (ligne.quantite * (ligne.prix_unitaire || ligne.prixUnitaire));
  }, 0);
});

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

const getModePaiementLabel = (mode: string) => {
  const labels: any = {
    cash: 'Cash',
    virement: 'Virement',
    mobile_money: 'Mobile Money',
    cheque: 'Chèque'
  };
  return labels[mode] || mode;
};

const formatDate = (dateStr: string) => {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  return date.toLocaleDateString('fr-FR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
};

const getArticleName = (articleId: string) => {
  const article = articles.value.find(a => a.id === articleId);
  return article ? article.nom : 'Article inconnu';
};

const loadCommande = async () => {
  const id = route.params.id as string;
  const commandeData = await DatabaseService.getCommandeById(id);
  
  if (commandeData) {
    commande.value = commandeData;
    lignes.value = commandeData.lignes || [];
    nouveauStatut.value = commandeData.statut;

    // Charger le fournisseur
    const fournisseurs = await DatabaseService.getFournisseurs();
    fournisseur.value = fournisseurs.find((f: any) => 
      f.id === (commandeData.fournisseur_id || commandeData.fournisseurId)
    );

    // Charger le transport
    if (commandeData.transport_id || commandeData.transportId) {
      const transports = await DatabaseService.getTransports();
      transportAgence.value = transports.find((t: any) => 
        t.id === (commandeData.transport_id || commandeData.transportId)
      );
    }

    // Charger les articles pour afficher les noms
    articles.value = await DatabaseService.getArticles();
  }
};

const editCommande = () => {
  sessionStorage.setItem('editingCommande', JSON.stringify(commande.value));
  router.replace('/commandes');
};

const goToFournisseur = () => {
  if (fournisseur.value) {
    router.push(`/fournisseurs/${fournisseur.value.id}`);
  }
};

const goToTransport = () => {
  if (transportAgence.value) {
    router.push(`/transport/${transportAgence.value.id}`);
  }
};

const updateStatut = async () => {
  try {
    const commandeData = {
      dateCommande: commande.value.date_commande || commande.value.dateCommande,
      fournisseurId: commande.value.fournisseur_id || commande.value.fournisseurId,
      transportId: commande.value.transport_id || commande.value.transportId,
      coutTransport: commande.value.cout_transport || commande.value.coutTransport || 0,
      coutTotal: commande.value.cout_total || commande.value.coutTotal,
      devise: commande.value.devise,
      modePaiement: commande.value.mode_paiement || commande.value.modePaiement,
      statut: nouveauStatut.value,
      notes: commande.value.notes
    };

    await DatabaseService.updateCommande(commande.value.id, commandeData);

    const toast = await toastController.create({
      message: 'Statut mis à jour',
      duration: 2000,
      color: 'success'
    });
    await toast.present();

    commande.value.statut = nouveauStatut.value;
  } catch (error) {
    console.error('Erreur mise à jour statut:', error);
  }
};

const confirmDelete = async () => {
  const alert = await alertController.create({
    header: 'Confirmer',
    message: `Supprimer la commande "${commande.value.numero}" ?`,
    buttons: [
      { text: 'Annuler', role: 'cancel' },
      {
        text: 'Supprimer',
        role: 'destructive',
        handler: async () => {
          await DatabaseService.deleteCommande(commande.value.id);
          const toast = await toastController.create({
            message: 'Commande supprimée',
            duration: 2000,
            color: 'success'
          });
          await toast.present();
          router.replace('/commandes');
        }
      }
    ]
  });
  await alert.present();
};

onMounted(() => {
  loadCommande();
});
</script>

<style scoped>
.header-card {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  padding: 32px 16px;
  text-align: center;
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