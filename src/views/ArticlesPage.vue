<template>
  <ion-page>
    <ion-header>
      <ion-toolbar color="primary">
        <ion-title>Articles</ion-title>
        <ion-buttons slot="end">
          <ion-button @click="openAddModal">
            <ion-icon :icon="addOutline"></ion-icon>
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
      <ion-toolbar>
        <ion-searchbar
          v-model="searchText"
          placeholder="Rechercher un article..."
          @ionInput="handleSearch"
          :debounce="300"
        ></ion-searchbar>
      </ion-toolbar>
      <ion-toolbar>
        <ion-segment v-model="selectedCategorie" @ionChange="filterArticles">
          <ion-segment-button value="">
            <ion-label>Tous</ion-label>
          </ion-segment-button>
          <ion-segment-button value="habits">
            <ion-label>Habits</ion-label>
          </ion-segment-button>
          <ion-segment-button value="sacs">
            <ion-label>Sacs</ion-label>
          </ion-segment-button>
          <ion-segment-button value="chaussures">
            <ion-label>Chaussures</ion-label>
          </ion-segment-button>
          <ion-segment-button value="accessoires">
            <ion-label>Accessoires</ion-label>
          </ion-segment-button>
        </ion-segment>
      </ion-toolbar>
    </ion-header>

    <ion-content>
      <ion-refresher slot="fixed" @ionRefresh="handleRefresh">
        <ion-refresher-content></ion-refresher-content>
      </ion-refresher>

      <ion-list v-if="filteredArticles.length > 0">
        <ion-item-sliding v-for="article in filteredArticles" :key="article.id">
          <ion-item @click="viewArticle(article.id)">
            <ion-thumbnail slot="start" v-if="getFirstPhoto(article.photos)">
              <img :src="getFirstPhoto(article.photos)" />
            </ion-thumbnail>
            <ion-thumbnail slot="start" v-else>
              <div class="placeholder-image">📦</div>
            </ion-thumbnail>
            <ion-label>
              <h2>{{ article.nom }}</h2>
              <p>{{ article.categorie }} • {{ article.taille }} • {{ article.couleur }}</p>
              <h3>{{ article.prix }} {{ article.devise }}</h3>
            </ion-label>
            <ion-badge slot="end" :color="getStatutColor(article.statut)">
              {{ getStatutLabel(article.statut) }}
            </ion-badge>
          </ion-item>

          <ion-item-options side="end">
            <ion-item-option color="primary" @click="closeSliding($event); editArticle(article)">
              <ion-icon slot="icon-only" :icon="createOutline"></ion-icon>
            </ion-item-option>
            <ion-item-option color="danger" @click="closeSliding($event); confirmDelete(article)">
              <ion-icon slot="icon-only" :icon="trashOutline"></ion-icon>
            </ion-item-option>
          </ion-item-options>
        </ion-item-sliding>
      </ion-list>

      <div v-else class="empty-state">
        <ion-icon :icon="cubeOutline" size="large"></ion-icon>
        <p>Aucun article trouvé</p>
        <ion-button @click="openAddModal">Ajouter un article</ion-button>
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
          <ion-title>{{ editingArticle ? 'Modifier' : 'Nouvel' }} Article</ion-title>
          <ion-buttons slot="end">
            <ion-button @click="closeModal">Fermer</ion-button>
          </ion-buttons>
        </ion-toolbar>
      </ion-header>
      <ion-content>
        <form @submit.prevent="saveArticle">
          <ion-list>
            <ion-item>
              <ion-input
                label="Nom de l'article *"
                label-placement="stacked"
                v-model="formData.nom"
                required
              ></ion-input>
            </ion-item>

            <ion-item>
              <ion-select
                label="Catégorie *"
                label-placement="stacked"
                v-model="formData.categorie"
                required
              >
                <ion-select-option value="habits">Habits</ion-select-option>
                <ion-select-option value="sacs">Sacs</ion-select-option>
                <ion-select-option value="chaussures">Chaussures</ion-select-option>
                <ion-select-option value="accessoires">Accessoires</ion-select-option>
              </ion-select>
            </ion-item>

            <ion-item>
              <ion-textarea
                label="Description"
                label-placement="stacked"
                v-model="formData.description"
                :rows="3"
              ></ion-textarea>
            </ion-item>

            <ion-item>
              <ion-input
                label="Taille/Pointure"
                label-placement="stacked"
                v-model="formData.taille"
              ></ion-input>
            </ion-item>

            <ion-item>
              <ion-input
                label="Couleur"
                label-placement="stacked"
                v-model="formData.couleur"
              ></ion-input>
            </ion-item>

            <ion-item>
              <ion-input
                label="Prix d'achat *"
                label-placement="stacked"
                type="number"
                step="0.01"
                v-model.number="formData.prix"
                required
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
                label="Fournisseur"
                label-placement="stacked"
                v-model="formData.fournisseurId"
              >
                <ion-select-option value="">Aucun</ion-select-option>
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
                label="Statut *"
                label-placement="stacked"
                v-model="formData.statut"
                required
              >
                <ion-select-option value="stock">En stock</ion-select-option>
                <ion-select-option value="commander">À commander</ion-select-option>
                <ion-select-option value="suivi">Plus suivi</ion-select-option>
              </ion-select>
            </ion-item>

            <ion-item>
              <ion-button expand="block" @click="showPhotoOptions">
                <ion-icon slot="start" :icon="cameraOutline"></ion-icon>
                Ajouter une photo
              </ion-button>
            </ion-item>

            <ion-item v-if="formData.photos.length > 0">
              <div class="photos-preview">
                <div v-for="(photo, index) in formData.photos" :key="index" class="photo-item">
                  <img :src="photo" />
                  <ion-button size="small" fill="clear" @click="removePhoto(index)">
                    <ion-icon :icon="closeCircleOutline"></ion-icon>
                  </ion-button>
                </div>
              </div>
            </ion-item>

            <ion-item>
              <ion-textarea
                label="Notes internes"
                label-placement="stacked"
                v-model="formData.notes"
                :rows="2"
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
import { useRouter } from 'vue-router';
import { onIonViewWillEnter } from '@ionic/vue';
import {
  IonPage, IonHeader, IonToolbar, IonTitle, IonContent, IonButtons, IonButton,
  IonIcon, IonSearchbar, IonSegment, IonSegmentButton, IonLabel, IonList,
  IonItem, IonItemSliding, IonItemOptions, IonItemOption, IonThumbnail,
  IonBadge, IonFab, IonFabButton, IonModal, IonInput, IonTextarea,
  IonSelect, IonSelectOption, IonRefresher, IonRefresherContent,
  alertController, toastController
} from '@ionic/vue';
import {
  addOutline, createOutline, trashOutline, cubeOutline, cameraOutline, closeCircleOutline
} from 'ionicons/icons';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import DatabaseService from '@/services/database.service';
import { v4 as uuidv4 } from 'uuid';

const router = useRouter();

const articles = ref<any[]>([]);
const fournisseurs = ref<any[]>([]);
const searchText = ref('');
const selectedCategorie = ref('');
const isModalOpen = ref(false);
const editingArticle = ref<any>(null);

const formData = ref({
  nom: '',
  categorie: '',
  description: '',
  taille: '',
  couleur: '',
  prix: 0,
  devise: 'MAD',
  fournisseurId: '',
  photos: [] as string[],
  statut: 'stock',
  notes: ''
});

const filteredArticles = computed(() => {
  let result = articles.value;

  if (selectedCategorie.value) {
    result = result.filter(a => a.categorie === selectedCategorie.value);
  }

  if (searchText.value) {
    const search = searchText.value.toLowerCase();
    result = result.filter(a =>
      a.nom.toLowerCase().includes(search) ||
      a.description?.toLowerCase().includes(search)
    );
  }

  return result;
});

const getFirstPhoto = (photosStr: string): string | undefined => {
  if (!photosStr) return undefined;
  const photos = photosStr.split('|||');
  return photos[0] || undefined;
};

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

const loadArticles = async () => {
  articles.value = await DatabaseService.getArticles();
};

const loadFournisseurs = async () => {
  fournisseurs.value = await DatabaseService.getFournisseurs();
};

const handleSearch = () => {
  // Le computed s'occupe du filtrage
};

const filterArticles = () => {
  // Le computed s'occupe du filtrage
};

const handleRefresh = async (event: any) => {
  await loadArticles();
  event.target.complete();
};

// Ferme le tiroir de glissement (ion-item-sliding) avant toute action ;
// sans ça, Ionic laisse l'item dans un état visuel figé après suppression
// et la liste ne se met pas à jour tant que la page n'est pas rechargée.
const closeSliding = (event: Event) => {
  const target = event.target as HTMLElement;
  const sliding = target.closest('ion-item-sliding') as any;
  sliding?.close();
};

const openAddModal = () => {
  editingArticle.value = null;
  resetForm();
  isModalOpen.value = true;
};

const editArticle = (article: any) => {
  editingArticle.value = article;
  formData.value = {
    nom: article.nom,
    categorie: article.categorie,
    description: article.description || '',
    taille: article.taille || '',
    couleur: article.couleur || '',
    prix: article.prix,
    devise: article.devise,
    fournisseurId: article.fournisseur_id || '',
    photos: article.photos ? article.photos.split('|||').filter((p: string) => p) : [],
    statut: article.statut,
    notes: article.notes || ''
  };
  isModalOpen.value = true;
};

const closeModal = () => {
  isModalOpen.value = false;
  editingArticle.value = null;
  resetForm();
};

const resetForm = () => {
  formData.value = {
    nom: '',
    categorie: '',
    description: '',
    taille: '',
    couleur: '',
    prix: 0,
    devise: 'MAD',
    fournisseurId: '',
    photos: [],
    statut: 'stock',
    notes: ''
  };
};

const showPhotoOptions = async () => {
  const alert = await alertController.create({
    header: 'Ajouter une photo',
    message: 'Choisissez une option',
    buttons: [
      {
        text: 'Appareil photo',
        handler: async () => {
          await capturePhoto(CameraSource.Camera);
        }
      },
      {
        text: 'Galerie',
        handler: async () => {
          await capturePhoto(CameraSource.Photos);
        }
      },
      {
        text: 'Annuler',
        role: 'cancel'
      }
    ]
  });
  await alert.present();
};

const capturePhoto = async (source: CameraSource) => {
  try {
    const image = await Camera.getPhoto({
      quality: 80,
      allowEditing: false,
      resultType: CameraResultType.DataUrl,
      source: source
    });

    if (image.dataUrl) {
      formData.value.photos.push(image.dataUrl);
    }
  } catch (error) {
    console.error('Erreur capture photo:', error);
  }
};

const removePhoto = (index: number) => {
  formData.value.photos.splice(index, 1);
};

const saveArticle = async () => {
  try {
    const articleData = {
      id: editingArticle.value?.id || uuidv4(),
      nom: formData.value.nom,
      categorie: formData.value.categorie,
      description: formData.value.description,
      taille: formData.value.taille,
      couleur: formData.value.couleur,
      prix: formData.value.prix,
      devise: formData.value.devise,
      fournisseurId: formData.value.fournisseurId || null,
      photos: formData.value.photos,
      statut: formData.value.statut,
      notes: formData.value.notes,
      dateCreation: editingArticle.value?.date_creation || new Date().toISOString(),
      dateModification: new Date().toISOString()
    };

    if (editingArticle.value) {
      await DatabaseService.updateArticle(articleData.id, articleData);
    } else {
      await DatabaseService.createArticle(articleData);
    }

    const toast = await toastController.create({
      message: editingArticle.value ? 'Article modifié' : 'Article créé',
      duration: 2000,
      color: 'success'
    });
    await toast.present();

    closeModal();
    await loadArticles();
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

const confirmDelete = async (article: any) => {
  const alert = await alertController.create({
    header: 'Confirmer',
    message: `Supprimer l'article "${article.nom}" ?`,
    buttons: [
      { text: 'Annuler', role: 'cancel' },
      {
        text: 'Supprimer',
        role: 'destructive',
        handler: () => deleteArticle(article.id)
      }
    ]
  });
  await alert.present();
};

const deleteArticle = async (id: string) => {
  try {
    await DatabaseService.deleteArticle(id);
    const toast = await toastController.create({
      message: 'Article supprimé',
      duration: 2000,
      color: 'success'
    });
    await toast.present();
    await loadArticles();
  } catch (error) {
    console.error('Erreur suppression:', error);
  }
};

const viewArticle = (id: string) => {
  router.push(`/articles/${id}`);
};

onMounted(async () => {
  await loadArticles();
  await loadFournisseurs();
});

onIonViewWillEnter(() => {
  const articleToEditStr = sessionStorage.getItem('editingArticle');
  if (articleToEditStr) {
    sessionStorage.removeItem('editingArticle');
    const articleData = JSON.parse(articleToEditStr);
    
    setTimeout(() => {
      const articleToEdit = articles.value.find(a => a.id === articleData.id);
      if (articleToEdit) {
        editArticle(articleToEdit);
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

.placeholder-image {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--ion-color-light);
  font-size: 32px;
}

.photos-preview {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
  width: 100%;
  padding: 8px 0;
}

.photo-item {
  position: relative;
  aspect-ratio: 1;
}

.photo-item img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  border-radius: 8px;
}

.photo-item ion-button {
  position: absolute;
  top: -8px;
  right: -8px;
}
</style>
