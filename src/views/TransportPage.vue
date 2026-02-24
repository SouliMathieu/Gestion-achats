<template>
  <ion-page>
    <ion-header>
      <ion-toolbar color="primary">
        <ion-title>Agences de Transport</ion-title>
        <ion-buttons slot="end">
          <ion-button @click="openAddModal">
            <ion-icon :icon="addOutline"></ion-icon>
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
      <ion-toolbar>
        <ion-searchbar
          v-model="searchText"
          placeholder="Rechercher une agence..."
          @ionInput="handleSearch"
          debounce="300"
        ></ion-searchbar>
      </ion-toolbar>
    </ion-header>

    <ion-content>
      <ion-refresher slot="fixed" @ionRefresh="handleRefresh">
        <ion-refresher-content></ion-refresher-content>
      </ion-refresher>

      <ion-list v-if="filteredTransports.length > 0">
        <ion-item-sliding v-for="transport in filteredTransports" :key="transport.id">
          <ion-item @click="viewTransport(transport.id)">
            <ion-avatar slot="start">
              <div class="avatar-placeholder">{{ getTypeIcon(transport.type) }}</div>
            </ion-avatar>
            <ion-label>
              <h2>{{ transport.nom }}</h2>
              <p>{{ transport.ville_depart }} → {{ transport.ville_arrivee }}</p>
              <p>{{ transport.type }} • {{ transport.duree_trajet || 'N/A' }}</p>
            </ion-label>
          </ion-item>

          <ion-item-options side="end">
            <ion-item-option color="primary" @click="editTransport(transport)">
              <ion-icon slot="icon-only" :icon="createOutline"></ion-icon>
            </ion-item-option>
            <ion-item-option color="danger" @click="confirmDelete(transport)">
              <ion-icon slot="icon-only" :icon="trashOutline"></ion-icon>
            </ion-item-option>
          </ion-item-options>
        </ion-item-sliding>
      </ion-list>

      <div v-else class="empty-state">
        <ion-icon :icon="airplaneOutline" size="large"></ion-icon>
        <p>Aucune agence de transport</p>
        <ion-button @click="openAddModal">Ajouter une agence</ion-button>
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
          <ion-title>{{ editingTransport ? 'Modifier' : 'Nouvelle' }} Agence</ion-title>
          <ion-buttons slot="end">
            <ion-button @click="closeModal">Fermer</ion-button>
          </ion-buttons>
        </ion-toolbar>
      </ion-header>
      <ion-content>
        <form @submit.prevent="saveTransport">
          <ion-list>
            <ion-item>
              <ion-input
                label="Nom de l'agence *"
                label-placement="stacked"
                v-model="formData.nom"
                required
              ></ion-input>
            </ion-item>

            <ion-item>
              <ion-select
                label="Type de transport *"
                label-placement="stacked"
                v-model="formData.type"
                required
              >
                <ion-select-option value="">Sélectionner...</ion-select-option>
                <ion-select-option value="aerien">Aérien</ion-select-option>
                <ion-select-option value="terrestre">Terrestre</ion-select-option>
                <ion-select-option value="maritime">Maritime</ion-select-option>
              </ion-select>
            </ion-item>

            <ion-list-header>
              <ion-label>Départ</ion-label>
            </ion-list-header>

            <ion-item>
              <ion-input
                label="Ville de départ *"
                label-placement="stacked"
                v-model="formData.villeDepart"
                required
              ></ion-input>
            </ion-item>

            <ion-item>
              <ion-input
                label="Pays de départ *"
                label-placement="stacked"
                v-model="formData.paysDepart"
                required
              ></ion-input>
            </ion-item>

            <ion-list-header>
              <ion-label>Arrivée</ion-label>
            </ion-list-header>

            <ion-item>
              <ion-input
                label="Ville d'arrivée *"
                label-placement="stacked"
                v-model="formData.villeArrivee"
                required
              ></ion-input>
            </ion-item>

            <ion-item>
              <ion-input
                label="Pays d'arrivée *"
                label-placement="stacked"
                v-model="formData.paysArrivee"
                required
              ></ion-input>
            </ion-item>

            <ion-list-header>
              <ion-label>Informations</ion-label>
            </ion-list-header>

            <ion-item>
              <ion-textarea
                label="Adresse"
                label-placement="stacked"
                v-model="formData.adresse"
                rows="2"
              ></ion-textarea>
            </ion-item>

            <ion-item>
              <ion-input
                label="Téléphone / WhatsApp"
                label-placement="stacked"
                type="tel"
                v-model="formData.telephone"
              ></ion-input>
            </ion-item>

            <ion-item>
              <ion-textarea
                label="Programme (jours et fréquence)"
                label-placement="stacked"
                v-model="formData.programme"
                rows="2"
                placeholder="Ex: Lundi, Mercredi, Vendredi"
              ></ion-textarea>
            </ion-item>

            <ion-item>
              <ion-input
                label="Durée estimée du trajet"
                label-placement="stacked"
                v-model="formData.dureeTrajet"
                placeholder="Ex: 3 jours, 5 heures..."
              ></ion-input>
            </ion-item>

            <ion-item>
              <ion-input
                label="Mode de tarification"
                label-placement="stacked"
                v-model="formData.modeTarification"
                placeholder="Ex: Par kilo, par colis..."
              ></ion-input>
            </ion-item>

            <ion-item>
              <ion-textarea
                label="Grille tarifaire"
                label-placement="stacked"
                v-model="formData.grilleTarifaire"
                rows="3"
                placeholder="Ex: 0-10kg: 50 MAD/kg, 10-50kg: 40 MAD/kg..."
              ></ion-textarea>
            </ion-item>

            <ion-item>
              <ion-textarea
                label="Services complémentaires"
                label-placement="stacked"
                v-model="formData.services"
                rows="2"
                placeholder="Ex: Assurance, suivi, livraison..."
              ></ion-textarea>
            </ion-item>

            <ion-item>
              <ion-textarea
                label="Notes internes"
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
import { useRoute, useRouter } from 'vue-router';
import {
  IonPage, IonHeader, IonToolbar, IonTitle, IonContent, IonButtons, IonButton,
  IonIcon, IonSearchbar, IonList, IonListHeader, IonItem, IonItemSliding,
  IonItemOptions, IonItemOption, IonAvatar, IonLabel, IonFab, IonFabButton,
  IonModal, IonInput, IonTextarea, IonSelect, IonSelectOption, IonRefresher,
  IonRefresherContent, alertController, toastController
} from '@ionic/vue';
import {
  addOutline, createOutline, trashOutline, airplaneOutline
} from 'ionicons/icons';
import DatabaseService from '@/services/database.service';
import { v4 as uuidv4 } from 'uuid';

const route = useRoute();
const router = useRouter();

const transports = ref<any[]>([]);
const searchText = ref('');
const isModalOpen = ref(false);
const editingTransport = ref<any>(null);

const formData = ref({
  nom: '',
  type: '',
  villeDepart: '',
  paysDepart: 'Maroc',
  villeArrivee: '',
  paysArrivee: 'Burkina Faso',
  adresse: '',
  telephone: '',
  programme: '',
  dureeTrajet: '',
  modeTarification: '',
  grilleTarifaire: '',
  services: '',
  notes: ''
});

const filteredTransports = computed(() => {
  if (!searchText.value) return transports.value;

  const search = searchText.value.toLowerCase();
  return transports.value.filter(t =>
    t.nom.toLowerCase().includes(search) ||
    t.ville_depart.toLowerCase().includes(search) ||
    t.ville_arrivee.toLowerCase().includes(search)
  );
});

const getTypeIcon = (type: string) => {
  const icons: any = {
    aerien: '✈️',
    terrestre: '🚚',
    maritime: '🚢'
  };
  return icons[type] || '🚚';
};

const loadTransports = async () => {
  transports.value = await DatabaseService.getTransports();
};

const handleSearch = () => {
  // Le computed s'occupe du filtrage
};

const handleRefresh = async (event: any) => {
  await loadTransports();
  event.target.complete();
};

const openAddModal = () => {
  editingTransport.value = null;
  resetForm();
  isModalOpen.value = true;
};

const editTransport = (transport: any) => {
  editingTransport.value = transport;
  formData.value = {
    nom: transport.nom,
    type: transport.type,
    villeDepart: transport.ville_depart,
    paysDepart: transport.pays_depart,
    villeArrivee: transport.ville_arrivee,
    paysArrivee: transport.pays_arrivee,
    adresse: transport.adresse || '',
    telephone: transport.telephone || '',
    programme: transport.programme || '',
    dureeTrajet: transport.duree_trajet || '',
    modeTarification: transport.mode_tarification || '',
    grilleTarifaire: transport.grille_tarifaire || '',
    services: transport.services || '',
    notes: transport.notes || ''
  };
  isModalOpen.value = true;
};

const closeModal = () => {
  isModalOpen.value = false;
  editingTransport.value = null;
  resetForm();
};

const resetForm = () => {
  formData.value = {
    nom: '',
    type: '',
    villeDepart: '',
    paysDepart: 'Maroc',
    villeArrivee: '',
    paysArrivee: 'Burkina Faso',
    adresse: '',
    telephone: '',
    programme: '',
    dureeTrajet: '',
    modeTarification: '',
    grilleTarifaire: '',
    services: '',
    notes: ''
  };
};

const saveTransport = async () => {
  try {
    const transportData = {
      id: editingTransport.value?.id || uuidv4(),
      nom: formData.value.nom,
      type: formData.value.type,
      villeDepart: formData.value.villeDepart,
      paysDepart: formData.value.paysDepart,
      villeArrivee: formData.value.villeArrivee,
      paysArrivee: formData.value.paysArrivee,
      adresse: formData.value.adresse,
      telephone: formData.value.telephone,
      programme: formData.value.programme,
      dureeTrajet: formData.value.dureeTrajet,
      modeTarification: formData.value.modeTarification,
      grilleTarifaire: formData.value.grilleTarifaire,
      services: formData.value.services,
      notes: formData.value.notes,
      dateCreation: editingTransport.value?.date_creation || new Date().toISOString(),
      dateModification: new Date().toISOString()
    };

    if (editingTransport.value) {
      await DatabaseService.updateTransport(transportData.id, transportData);
    } else {
      await DatabaseService.createTransport(transportData);
    }

    const toast = await toastController.create({
      message: editingTransport.value ? 'Agence modifiée' : 'Agence créée',
      duration: 2000,
      color: 'success'
    });
    await toast.present();

    closeModal();
    await loadTransports();
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

const confirmDelete = async (transport: any) => {
  const alert = await alertController.create({
    header: 'Confirmer',
    message: `Supprimer l'agence "${transport.nom}" ?`,
    buttons: [
      { text: 'Annuler', role: 'cancel' },
      {
        text: 'Supprimer',
        role: 'destructive',
        handler: () => deleteTransport(transport.id)
      }
    ]
  });
  await alert.present();
};

const deleteTransport = async (id: string) => {
  try {
    await DatabaseService.deleteTransport(id);
    const toast = await toastController.create({
      message: 'Agence supprimée',
      duration: 2000,
      color: 'success'
    });
    await toast.present();
    await loadTransports();
  } catch (error) {
    console.error('Erreur suppression:', error);
  }
};

const viewTransport = (id: string) => {
  router.push(`/transport/${id}`);
};

onMounted(async () => {
  await loadTransports();
});

onIonViewWillEnter(() => {
  const transportToEditStr = sessionStorage.getItem('editingTransport');
  if (transportToEditStr) {
    sessionStorage.removeItem('editingTransport');
    const transportData = JSON.parse(transportToEditStr);
    
    setTimeout(() => {
      const transportToEdit = transports.value.find(t => t.id === transportData.id);
      if (transportToEdit) {
        editTransport(transportToEdit);
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

.avatar-placeholder {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--ion-color-light);
  font-size: 24px;
}
</style>