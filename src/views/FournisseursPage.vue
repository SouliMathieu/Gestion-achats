<template>
  <ion-page>
    <ion-header>
      <ion-toolbar color="primary">
        <ion-title>Fournisseurs</ion-title>
        <ion-buttons slot="end">
          <ion-button @click="openAddModal">
            <ion-icon :icon="addOutline"></ion-icon>
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
      <ion-toolbar>
        <ion-searchbar
          v-model="searchText"
          placeholder="Rechercher un fournisseur..."
          @ionInput="handleSearch"
          debounce="300"
        ></ion-searchbar>
      </ion-toolbar>
    </ion-header>

    <ion-content>
      <ion-refresher slot="fixed" @ionRefresh="handleRefresh">
        <ion-refresher-content></ion-refresher-content>
      </ion-refresher>

      <ion-list v-if="filteredFournisseurs.length > 0">
        <ion-item-sliding v-for="fournisseur in filteredFournisseurs" :key="fournisseur.id">
          <ion-item @click="viewFournisseur(fournisseur.id)">
            <ion-avatar slot="start">
              <div class="avatar-placeholder">🏪</div>
            </ion-avatar>
            <ion-label>
              <h2>{{ fournisseur.nom }}</h2>
              <p>{{ fournisseur.type }} • {{ fournisseur.ville }}, {{ fournisseur.pays }}</p>
              <p v-if="fournisseur.telephone">📞 {{ fournisseur.telephone }}</p>
            </ion-label>
          </ion-item>

          <ion-item-options side="end">
            <ion-item-option color="primary" @click="editFournisseur(fournisseur)">
              <ion-icon slot="icon-only" :icon="createOutline"></ion-icon>
            </ion-item-option>
            <ion-item-option color="danger" @click="confirmDelete(fournisseur)">
              <ion-icon slot="icon-only" :icon="trashOutline"></ion-icon>
            </ion-item-option>
          </ion-item-options>
        </ion-item-sliding>
      </ion-list>

      <div v-else class="empty-state">
        <ion-icon :icon="storefrontOutline" size="large"></ion-icon>
        <p>Aucun fournisseur trouvé</p>
        <ion-button @click="openAddModal">Ajouter un fournisseur</ion-button>
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
          <ion-title>{{ editingFournisseur ? 'Modifier' : 'Nouveau' }} Fournisseur</ion-title>
          <ion-buttons slot="end">
            <ion-button @click="closeModal">Fermer</ion-button>
          </ion-buttons>
        </ion-toolbar>
      </ion-header>
      <ion-content>
        <form @submit.prevent="saveFournisseur">
          <ion-list>
            <ion-item>
              <ion-input
                label="Nom du fournisseur *"
                label-placement="stacked"
                v-model="formData.nom"
                required
              ></ion-input>
            </ion-item>

            <ion-item>
              <ion-select
                label="Type *"
                label-placement="stacked"
                v-model="formData.type"
                required
              >
                <ion-select-option value="">Sélectionner...</ion-select-option>
                <ion-select-option value="grossiste">Grossiste</ion-select-option>
                <ion-select-option value="detaillant">Détaillant</ion-select-option>
                <ion-select-option value="friperie">Friperie</ion-select-option>
                <ion-select-option value="fabricant">Fabricant</ion-select-option>
              </ion-select>
            </ion-item>

            <ion-item>
              <ion-input
                label="Pays *"
                label-placement="stacked"
                v-model="formData.pays"
                required
              ></ion-input>
            </ion-item>

            <ion-item>
              <ion-input
                label="Ville *"
                label-placement="stacked"
                v-model="formData.ville"
                required
              ></ion-input>
            </ion-item>

            <ion-item>
              <ion-textarea
                label="Adresse complète"
                label-placement="stacked"
                v-model="formData.adresse"
                rows="2"
              ></ion-textarea>
            </ion-item>

            <ion-item>
              <ion-input
                label="Localisation (Google Maps)"
                label-placement="stacked"
                type="url"
                v-model="formData.localisation"
                placeholder="https://maps.google.com/..."
              ></ion-input>
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
              <ion-input
                label="Réseaux sociaux"
                label-placement="stacked"
                v-model="formData.reseauxSociaux"
                placeholder="Instagram, Facebook..."
              ></ion-input>
            </ion-item>

            <ion-item>
              <ion-textarea
                label="Articles principaux"
                label-placement="stacked"
                v-model="formData.articlesPrincipaux"
                rows="2"
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
import { onIonViewWillEnter } from '@ionic/vue';
import { useRoute, useRouter } from 'vue-router';
import {
  IonPage, IonHeader, IonToolbar, IonTitle, IonContent, IonButtons, IonButton,
  IonIcon, IonSearchbar, IonList, IonItem, IonItemSliding, IonItemOptions,
  IonItemOption, IonAvatar, IonLabel, IonFab, IonFabButton, IonModal,
  IonInput, IonTextarea, IonSelect, IonSelectOption, IonRefresher,
  IonRefresherContent, alertController, toastController
} from '@ionic/vue';
import {
  addOutline, createOutline, trashOutline, storefrontOutline
} from 'ionicons/icons';
import DatabaseService from '@/services/database.service';
import { v4 as uuidv4 } from 'uuid';

const route = useRoute();
const router = useRouter();

const fournisseurs = ref<any[]>([]);
const searchText = ref('');
const isModalOpen = ref(false);
const editingFournisseur = ref<any>(null);

const formData = ref({
  nom: '',
  type: '',
  pays: 'Maroc',
  ville: '',
  adresse: '',
  localisation: '',
  telephone: '',
  reseauxSociaux: '',
  articlesPrincipaux: '',
  notes: ''
});

const filteredFournisseurs = computed(() => {
  if (!searchText.value) return fournisseurs.value;

  const search = searchText.value.toLowerCase();
  return fournisseurs.value.filter(f =>
    f.nom.toLowerCase().includes(search) ||
    f.ville.toLowerCase().includes(search) ||
    f.type.toLowerCase().includes(search)
  );
});

const loadFournisseurs = async () => {
  fournisseurs.value = await DatabaseService.getFournisseurs();
};

const handleSearch = () => {
  // Le computed s'occupe du filtrage
};

const handleRefresh = async (event: any) => {
  await loadFournisseurs();
  event.target.complete();
};

const openAddModal = () => {
  editingFournisseur.value = null;
  resetForm();
  isModalOpen.value = true;
};

const editFournisseur = (fournisseur: any) => {
  editingFournisseur.value = fournisseur;
  formData.value = {
    nom: fournisseur.nom,
    type: fournisseur.type,
    pays: fournisseur.pays,
    ville: fournisseur.ville,
    adresse: fournisseur.adresse || '',
    localisation: fournisseur.localisation || '',
    telephone: fournisseur.telephone || '',
    reseauxSociaux: fournisseur.reseaux_sociaux || '',
    articlesPrincipaux: fournisseur.articles_principaux || '',
    notes: fournisseur.notes || ''
  };
  isModalOpen.value = true;
};

const closeModal = () => {
  isModalOpen.value = false;
  editingFournisseur.value = null;
  resetForm();
};

const resetForm = () => {
  formData.value = {
    nom: '',
    type: '',
    pays: 'Maroc',
    ville: '',
    adresse: '',
    localisation: '',
    telephone: '',
    reseauxSociaux: '',
    articlesPrincipaux: '',
    notes: ''
  };
};

const saveFournisseur = async () => {
  try {
    const fournisseurData = {
      id: editingFournisseur.value?.id || uuidv4(),
      nom: formData.value.nom,
      type: formData.value.type,
      pays: formData.value.pays,
      ville: formData.value.ville,
      adresse: formData.value.adresse,
      localisation: formData.value.localisation,
      telephone: formData.value.telephone,
      reseauxSociaux: formData.value.reseauxSociaux,
      articlesPrincipaux: formData.value.articlesPrincipaux,
      notes: formData.value.notes,
      dateCreation: editingFournisseur.value?.date_creation || new Date().toISOString(),
      dateModification: new Date().toISOString()
    };

    if (editingFournisseur.value) {
      await DatabaseService.updateFournisseur(fournisseurData.id, fournisseurData);
    } else {
      await DatabaseService.createFournisseur(fournisseurData);
    }

    const toast = await toastController.create({
      message: editingFournisseur.value ? 'Fournisseur modifié' : 'Fournisseur créé',
      duration: 2000,
      color: 'success'
    });
    await toast.present();

    closeModal();
    await loadFournisseurs();
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

const confirmDelete = async (fournisseur: any) => {
  const alert = await alertController.create({
    header: 'Confirmer',
    message: `Supprimer le fournisseur "${fournisseur.nom}" ?`,
    buttons: [
      { text: 'Annuler', role: 'cancel' },
      {
        text: 'Supprimer',
        role: 'destructive',
        handler: () => deleteFournisseur(fournisseur.id)
      }
    ]
  });
  await alert.present();
};

const deleteFournisseur = async (id: string) => {
  try {
    await DatabaseService.deleteFournisseur(id);
    const toast = await toastController.create({
      message: 'Fournisseur supprimé',
      duration: 2000,
      color: 'success'
    });
    await toast.present();
    await loadFournisseurs();
  } catch (error) {
    console.error('Erreur suppression:', error);
  }
};

const viewFournisseur = (id: string) => {
  router.push(`/fournisseurs/${id}`);
};

onMounted(async () => {
  await loadFournisseurs();
});

onIonViewWillEnter(() => {
  const fournisseurToEditStr = sessionStorage.getItem('editingFournisseur');
  if (fournisseurToEditStr) {
    sessionStorage.removeItem('editingFournisseur');
    const fournisseurData = JSON.parse(fournisseurToEditStr);
    
    setTimeout(() => {
      const fournisseurToEdit = fournisseurs.value.find(f => f.id === fournisseurData.id);
      if (fournisseurToEdit) {
        editFournisseur(fournisseurToEdit);
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