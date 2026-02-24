<template>
  <ion-page>
    <ion-header>
      <ion-toolbar color="primary">
        <ion-title>Commandes</ion-title>
        <ion-buttons slot="end">
          <ion-button @click="openAddModal">
            <ion-icon :icon="addOutline"></ion-icon>
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
      <ion-toolbar>
        <ion-segment v-model="selectedStatut" @ionChange="filterCommandes">
          <ion-segment-button value="">
            <ion-label>Toutes</ion-label>
          </ion-segment-button>
          <ion-segment-button value="brouillon">
            <ion-label>Brouillon</ion-label>
          </ion-segment-button>
          <ion-segment-button value="validee">
            <ion-label>Validée</ion-label>
          </ion-segment-button>
          <ion-segment-button value="envoyee">
            <ion-label>Envoyée</ion-label>
          </ion-segment-button>
          <ion-segment-button value="recue">
            <ion-label>Reçue</ion-label>
          </ion-segment-button>
        </ion-segment>
      </ion-toolbar>
    </ion-header>

    <ion-content>
      <ion-refresher slot="fixed" @ionRefresh="handleRefresh">
        <ion-refresher-content></ion-refresher-content>
      </ion-refresher>

      <ion-list v-if="filteredCommandes.length > 0">
        <ion-item-sliding v-for="commande in filteredCommandes" :key="commande.id">
          <ion-item @click="viewCommande(commande.id)">
            <ion-label>
              <h2>{{ commande.numero }}</h2>
              <p>{{ formatDate(commande.date_commande || commande.dateCommande) }}</p>
              <h3>{{ commande.cout_total || commande.coutTotal }} {{ commande.devise }}</h3>
            </ion-label>
            <ion-badge slot="end" :color="getStatusColor(commande.statut)">
              {{ getStatusLabel(commande.statut) }}
            </ion-badge>
          </ion-item>

          <ion-item-options side="end">
            <ion-item-option color="primary" @click="editCommande(commande)">
              <ion-icon slot="icon-only" :icon="createOutline"></ion-icon>
            </ion-item-option>
            <ion-item-option color="danger" @click="confirmDelete(commande)">
              <ion-icon slot="icon-only" :icon="trashOutline"></ion-icon>
            </ion-item-option>
          </ion-item-options>
        </ion-item-sliding>
      </ion-list>

      <div v-else class="empty-state">
        <ion-icon :icon="cartOutline" size="large"></ion-icon>
        <p>Aucune commande</p>
        <ion-button @click="openAddModal">Créer une commande</ion-button>
      </div>

      <ion-fab vertical="bottom" horizontal="end" slot="fixed">
        <ion-fab-button @click="openAddModal">
          <ion-icon :icon="addOutline"></ion-icon>
        </ion-fab-button>
      </ion-fab>
    </ion-content>

    <!-- Modal Ajout/Edition -->
    <ion-modal :is-open="isModalOpen" @didDismiss="closeModal">
      <ion-header>
        <ion-toolbar color="primary">
          <ion-title>{{ editingCommande ? 'Modifier' : 'Nouvelle' }} Commande</ion-title>
          <ion-buttons slot="end">
            <ion-button @click="closeModal">Fermer</ion-button>
          </ion-buttons>
        </ion-toolbar>
      </ion-header>
      <ion-content>
        <form @submit.prevent="saveCommande">
          <ion-list>
            <ion-item>
              <ion-input
                label="Numéro de commande *"
                label-placement="stacked"
                v-model="formData.numero"
                required
                :disabled="!!editingCommande"
              ></ion-input>
            </ion-item>

            <ion-item>
              <ion-input
                label="Date de commande *"
                label-placement="stacked"
                type="date"
                v-model="formData.dateCommande"
                required
              ></ion-input>
            </ion-item>

            <ion-item>
              <ion-select
                label="Fournisseur *"
                label-placement="stacked"
                v-model="formData.fournisseurId"
                required
              >
                <ion-select-option value="">Sélectionner...</ion-select-option>
                <ion-select-option
                  v-for="f in fournisseurs"
                  :key="f.id"
                  :value="f.id"
                >
                  {{ f.nom }}
                </ion-select-option>
              </ion-select>
            </ion-item>

            <ion-item>
              <ion-select
                label="Agence de transport"
                label-placement="stacked"
                v-model="formData.transportId"
              >
                <ion-select-option value="">Aucune</ion-select-option>
                <ion-select-option
                  v-for="t in transports"
                  :key="t.id"
                  :value="t.id"
                >
                  {{ t.nom }}
                </ion-select-option>
              </ion-select>
            </ion-item>

            <ion-item>
              <ion-input
                label="Coût de transport"
                label-placement="stacked"
                type="number"
                step="0.01"
                v-model.number="formData.coutTransport"
              ></ion-input>
            </ion-item>

            <ion-item>
              <ion-select
                label="Devise *"
                label-placement="stacked"
                v-model="formData.devise"
                required
              >
                <ion-select-option value="MAD">MAD</ion-select-option>
                <ion-select-option value="FCFA">FCFA</ion-select-option>
              </ion-select>
            </ion-item>

            <ion-item>
              <ion-select
                label="Mode de paiement"
                label-placement="stacked"
                v-model="formData.modePaiement"
              >
                <ion-select-option value="">Non défini</ion-select-option>
                <ion-select-option value="cash">Cash</ion-select-option>
                <ion-select-option value="virement">Virement</ion-select-option>
                <ion-select-option value="mobile_money">Mobile Money</ion-select-option>
                <ion-select-option value="cheque">Chèque</ion-select-option>
              </ion-select>
            </ion-item>

            <ion-item>
              <ion-select
                label="Statut *"
                label-placement="stacked"
                v-model="formData.statut"
                required
              >
                <ion-select-option value="brouillon">Brouillon</ion-select-option>
                <ion-select-option value="validee">Validée</ion-select-option>
                <ion-select-option value="preparation">En préparation</ion-select-option>
                <ion-select-option value="envoyee">Envoyée</ion-select-option>
                <ion-select-option value="recue">Reçue</ion-select-option>
              </ion-select>
            </ion-item>

            <!-- Articles de la commande -->
            <ion-list-header>
              <ion-label>Articles</ion-label>
              <ion-button size="small" @click="addLigne">
                <ion-icon slot="start" :icon="addOutline"></ion-icon>
                Ajouter
              </ion-button>
            </ion-list-header>

            <div v-for="(ligne, index) in formData.lignes" :key="index" class="ligne-commande">
              <ion-card>
                <ion-card-content>
                  <ion-item>
                    <ion-select
                      label="Article *"
                      label-placement="stacked"
                      v-model="ligne.articleId"
                      @ionChange="onArticleChange(index, $event)"
                    >
                      <ion-select-option value="">Sélectionner...</ion-select-option>
                      <ion-select-option
                        v-for="a in articles"
                        :key="a.id"
                        :value="a.id"
                      >
                        {{ a.nom }} - {{ a.prix }} {{ a.devise }}
                      </ion-select-option>
                    </ion-select>
                  </ion-item>

                  <ion-item>
                    <ion-input
                      label="Quantité *"
                      label-placement="stacked"
                      type="number"
                      min="1"
                      v-model.number="ligne.quantite"
                      @ionChange="calculateTotal"
                    ></ion-input>
                  </ion-item>

                  <ion-item>
                    <ion-input
                      label="Prix unitaire *"
                      label-placement="stacked"
                      type="number"
                      step="0.01"
                      v-model.number="ligne.prixUnitaire"
                      @ionChange="calculateTotal"
                    ></ion-input>
                  </ion-item>

                  <ion-item>
                    <ion-label>Sous-total: {{ (ligne.quantite * ligne.prixUnitaire).toFixed(2) }}</ion-label>
                    <ion-button slot="end" color="danger" fill="clear" @click="removeLigne(index)">
                      <ion-icon :icon="trashOutline"></ion-icon>
                    </ion-button>
                  </ion-item>
                </ion-card-content>
              </ion-card>
            </div>

            <!-- Total -->
            <ion-item>
              <ion-label>
                <h2>Coût total articles</h2>
                <p>{{ totalArticles.toFixed(2) }} {{ formData.devise }}</p>
              </ion-label>
            </ion-item>

            <ion-item v-if="formData.coutTransport > 0">
              <ion-label>
                <h2>Coût transport</h2>
                <p>{{ formData.coutTransport.toFixed(2) }} {{ formData.devise }}</p>
              </ion-label>
            </ion-item>

            <ion-item color="light">
              <ion-label>
                <h2><strong>TOTAL COMMANDE</strong></h2>
                <h1><strong>{{ coutTotal.toFixed(2) }} {{ formData.devise }}</strong></h1>
              </ion-label>
            </ion-item>

            <ion-item>
              <ion-textarea
                label="Notes"
                label-placement="stacked"
                v-model="formData.notes"
                rows="2"
              ></ion-textarea>
            </ion-item>
          </ion-list>

          <div class="ion-padding">
            <ion-button expand="block" type="submit" color="primary">
              Enregistrer
            </ion-button>
          </div>
        </form>
      </ion-content>
    </ion-modal>
  </ion-page>
</template>

<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import { onIonViewWillEnter } from '@ionic/vue';
import { useRoute, useRouter } from 'vue-router';
import {
  IonPage, IonHeader, IonToolbar, IonTitle, IonContent, IonButtons, IonButton,
  IonIcon, IonSegment, IonSegmentButton, IonLabel, IonList, IonListHeader,
  IonItem, IonItemSliding, IonItemOptions, IonItemOption, IonBadge,
  IonFab, IonFabButton, IonModal, IonInput, IonTextarea, IonSelect,
  IonSelectOption, IonRefresher, IonRefresherContent, IonCard, IonCardContent,
  alertController, toastController
} from '@ionic/vue';
import {
  addOutline, createOutline, trashOutline, cartOutline
} from 'ionicons/icons';
import DatabaseService from '@/services/database.service';
import { v4 as uuidv4 } from 'uuid';

const route = useRoute();
const router = useRouter();

const commandes = ref<any[]>([]);
const articles = ref<any[]>([]);
const fournisseurs = ref<any[]>([]);
const transports = ref<any[]>([]);
const selectedStatut = ref('');
const isModalOpen = ref(false);
const editingCommande = ref<any>(null);

const formData = ref({
  numero: '',
  dateCommande: new Date().toISOString().split('T')[0],
  fournisseurId: '',
  transportId: '',
  coutTransport: 0,
  devise: 'MAD',
  modePaiement: '',
  statut: 'brouillon',
  notes: '',
  lignes: [] as any[]
});

const filteredCommandes = computed(() => {
  if (!selectedStatut.value) return commandes.value;
  return commandes.value.filter(c => c.statut === selectedStatut.value);
});

const totalArticles = computed(() => {
  return formData.value.lignes.reduce((sum, ligne) => {
    return sum + (ligne.quantite * ligne.prixUnitaire);
  }, 0);
});

const coutTotal = computed(() => {
  return totalArticles.value + (formData.value.coutTransport || 0);
});

const formatDate = (dateStr: string) => {
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

const loadCommandes = async () => {
  commandes.value = await DatabaseService.getCommandes();
};

const loadArticles = async () => {
  articles.value = await DatabaseService.getArticles();
};

const loadFournisseurs = async () => {
  fournisseurs.value = await DatabaseService.getFournisseurs();
};

const loadTransports = async () => {
  transports.value = await DatabaseService.getTransports();
};

const filterCommandes = () => {
  // Le computed s'occupe du filtrage
};

const handleRefresh = async (event: any) => {
  await loadCommandes();
  event.target.complete();
};

const generateNumero = () => {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
  return `CMD-${year}${month}-${random}`;
};

const openAddModal = () => {
  editingCommande.value = null;
  resetForm();
  formData.value.numero = generateNumero();
  isModalOpen.value = true;
};

const editCommande = async (commande: any) => {
  editingCommande.value = commande;
  const details = await DatabaseService.getCommandeById(commande.id);
  
  formData.value = {
    numero: details.numero,
    dateCommande: details.date_commande ? details.date_commande.split('T')[0] : details.dateCommande.split('T')[0],
    fournisseurId: details.fournisseur_id || details.fournisseurId,
    transportId: details.transport_id || details.transportId || '',
    coutTransport: details.cout_transport || details.coutTransport || 0,
    devise: details.devise,
    modePaiement: details.mode_paiement || details.modePaiement || '',
    statut: details.statut,
    notes: details.notes || '',
    lignes: details.lignes.map((l: any) => ({
      id: l.id,
      articleId: l.article_id || l.articleId,
      quantite: l.quantite,
      prixUnitaire: l.prix_unitaire || l.prixUnitaire,
      devise: l.devise
    }))
  };
  
  isModalOpen.value = true;
};

const closeModal = () => {
  isModalOpen.value = false;
  editingCommande.value = null;
  resetForm();
};

const resetForm = () => {
  formData.value = {
    numero: '',
    dateCommande: new Date().toISOString().split('T')[0],
    fournisseurId: '',
    transportId: '',
    coutTransport: 0,
    devise: 'MAD',
    modePaiement: '',
    statut: 'brouillon',
    notes: '',
    lignes: []
  };
};

const addLigne = () => {
  formData.value.lignes.push({
    id: uuidv4(),
    articleId: '',
    quantite: 1,
    prixUnitaire: 0,
    devise: formData.value.devise
  });
};

const removeLigne = (index: number) => {
  formData.value.lignes.splice(index, 1);
  calculateTotal();
};

const onArticleChange = (index: number, event: any) => {
  const articleId = event.detail.value;
  const article = articles.value.find(a => a.id === articleId);
  if (article) {
    formData.value.lignes[index].prixUnitaire = article.prix;
    formData.value.lignes[index].devise = article.devise;
    calculateTotal();
  }
};

const calculateTotal = () => {
  // Les computed font le calcul automatiquement
};

const saveCommande = async () => {
  if (formData.value.lignes.length === 0) {
    const toast = await toastController.create({
      message: 'Veuillez ajouter au moins un article',
      duration: 2000,
      color: 'warning'
    });
    await toast.present();
    return;
  }

  try {
    const commandeData = {
      id: editingCommande.value?.id || uuidv4(),
      numero: formData.value.numero,
      dateCommande: formData.value.dateCommande,
      fournisseurId: formData.value.fournisseurId,
      transportId: formData.value.transportId || null,
      coutTransport: formData.value.coutTransport || 0,
      coutTotal: coutTotal.value,
      devise: formData.value.devise,
      modePaiement: formData.value.modePaiement || null,
      statut: formData.value.statut,
      notes: formData.value.notes,
      dateCreation: editingCommande.value?.date_creation || new Date().toISOString(),
      dateModification: new Date().toISOString()
    };

    const lignes = formData.value.lignes.map(l => ({
      id: l.id || uuidv4(),
      articleId: l.articleId,
      quantite: l.quantite,
      prixUnitaire: l.prixUnitaire,
      devise: l.devise
    }));

    if (editingCommande.value) {
      await DatabaseService.updateCommande(commandeData.id, commandeData, lignes);
    } else {
      await DatabaseService.createCommande(commandeData, lignes);
    }

    const toast = await toastController.create({
      message: editingCommande.value ? 'Commande modifiée' : 'Commande créée',
      duration: 2000,
      color: 'success'
    });
    await toast.present();

    closeModal();
    await loadCommandes();
  } catch (error) {
    console.error('Erreur sauvegarde:', error);
    const toast = await toastController.create({
      message: 'Erreur lors de l\'enregistrement',
      duration: 2000,
      color: 'danger'
    });
    await toast.present();
  }
};

const confirmDelete = async (commande: any) => {
  const alert = await alertController.create({
    header: 'Confirmer',
    message: `Supprimer la commande "${commande.numero}" ?`,
    buttons: [
      { text: 'Annuler', role: 'cancel' },
      {
        text: 'Supprimer',
        role: 'destructive',
        handler: () => deleteCommande(commande.id)
      }
    ]
  });
  await alert.present();
};

const deleteCommande = async (id: string) => {
  try {
    await DatabaseService.deleteCommande(id);
    const toast = await toastController.create({
      message: 'Commande supprimée',
      duration: 2000,
      color: 'success'
    });
    await toast.present();
    await loadCommandes();
  } catch (error) {
    console.error('Erreur suppression:', error);
  }
};

const viewCommande = (id: string) => {
  router.push(`/commandes/${id}`);
};

onMounted(async () => {
  await loadCommandes();
  await loadArticles();
  await loadFournisseurs();
  await loadTransports();
});

onIonViewWillEnter(() => {
  const commandeToEditStr = sessionStorage.getItem('editingCommande');
  if (commandeToEditStr) {
    sessionStorage.removeItem('editingCommande');
    const commandeData = JSON.parse(commandeToEditStr);
    
    setTimeout(async () => {
      const commandeToEdit = commandes.value.find(c => c.id === commandeData.id);
      if (commandeToEdit) {
        await editCommande(commandeToEdit);
      }
    }, 200);
  }
});
</script>

<style scoped>
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 50vh;
  color: var(--ion-color-medium);
}

.empty-state ion-icon {
  font-size: 64px;
  margin-bottom: 16px;
}

.ligne-commande {
  margin: 8px 16px;
}

.ligne-commande ion-card {
  margin: 0;
}
</style>