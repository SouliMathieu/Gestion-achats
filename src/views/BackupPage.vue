<template>
  <ion-page>
    <ion-header>
      <ion-toolbar color="primary">
        <ion-buttons slot="start">
          <ion-back-button default-href="/dashboard"></ion-back-button>
        </ion-buttons>
        <ion-title>Sauvegardes et restauration</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content class="ion-padding">
      <ion-card>
        <ion-card-header>
          <ion-card-title>Créer une sauvegarde</ion-card-title>
          <ion-card-subtitle>Exporter les cinq collections de l’application dans un fichier JSON vérifié.</ion-card-subtitle>
        </ion-card-header>
        <ion-card-content>
          <p>La sauvegarde contient les articles, fournisseurs, transports, commandes et lignes de commande.</p>
          <ion-button expand="block" :disabled="busy" @click="createAndExport">
            <ion-icon slot="start" :icon="downloadOutline"></ion-icon>
            Créer et télécharger
          </ion-button>
        </ion-card-content>
      </ion-card>

      <ion-card>
        <ion-card-header>
          <ion-card-title>Restaurer une sauvegarde</ion-card-title>
          <ion-card-subtitle>Choisir un fichier JSON précédemment exporté.</ion-card-subtitle>
        </ion-card-header>
        <ion-card-content>
          <p>Le fichier sera vérifié avant toute modification. Une copie de sécurité des données actuelles sera créée avant la restauration.</p>
          <input ref="fileInput" class="file-input" type="file" accept=".json,application/json" @change="onFileSelected">
          <ion-button expand="block" fill="outline" :disabled="busy" @click="chooseFile">
            <ion-icon slot="start" :icon="cloudUploadOutline"></ion-icon>
            Choisir un fichier de sauvegarde
          </ion-button>
          <div v-if="pending" class="ion-margin-top">
            <ion-item lines="none">
              <ion-icon slot="start" :icon="shieldCheckmarkOutline" color="success"></ion-icon>
              <ion-label>
                <h2>Fichier vérifié</h2>
                <p>{{ formatDate(pending.report.createdAt) }}</p>
                <p>Origine : {{ pending.report.sourceStorage }}</p>
              </ion-label>
            </ion-item>
            <ion-list>
              <ion-item v-for="table in tableLabels" :key="table.key">
                <ion-label>{{ table.label }}</ion-label>
                <ion-note slot="end">{{ pending.report.counts[table.key] }}</ion-note>
              </ion-item>
            </ion-list>
            <ion-button expand="block" color="danger" :disabled="busy" @click="confirmRestore">
              Restaurer cette sauvegarde
            </ion-button>
          </div>
        </ion-card-content>
      </ion-card>

      <ion-card>
        <ion-card-header>
          <ion-card-title>Copies automatiques locales</ion-card-title>
          <ion-card-subtitle>Jusqu’à 10 instantanés quotidiens conservés sur cet appareil.</ion-card-subtitle>
        </ion-card-header>
        <ion-card-content>
          <ion-button fill="clear" size="small" :disabled="busy" @click="loadSnapshots">
            <ion-icon slot="start" :icon="refreshOutline"></ion-icon>
            Actualiser
          </ion-button>
          <ion-list v-if="snapshots.length">
            <ion-item v-for="snapshot in snapshots" :key="snapshot.createdAt">
              <ion-icon slot="start" :icon="timeOutline"></ion-icon>
              <ion-label>
                <h2>{{ formatDate(snapshot.createdAt) }}</h2>
                <p>{{ totalRows(snapshot.counts) }} enregistrements · {{ snapshot.sourceStorage }}</p>
              </ion-label>
              <ion-button slot="end" size="small" fill="outline" :disabled="busy" @click="confirmSnapshotRestore(snapshot.id)">
                Restaurer
              </ion-button>
            </ion-item>
          </ion-list>
          <p v-else class="ion-text-center ion-padding">Aucune copie automatique disponible.</p>
        </ion-card-content>
      </ion-card>

      <ion-card color="light">
        <ion-card-content>
          <ion-icon :icon="informationCircleOutline" color="primary"></ion-icon>
          <strong>Important</strong>
          <p>Les copies automatiques restent sur cet appareil. Pour protéger les données en cas de perte, de panne ou de réinitialisation du téléphone, téléchargez régulièrement une sauvegarde et conservez-la ailleurs (ordinateur, clé USB ou espace cloud).</p>
          <p>Une restauration remplace les données actuelles. Vérifiez le fichier et les quantités avant de confirmer.</p>
        </ion-card-content>
      </ion-card>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';
import {
  IonPage, IonHeader, IonToolbar, IonTitle, IonButtons, IonBackButton, IonContent,
  IonCard, IonCardHeader, IonCardTitle, IonCardSubtitle, IonCardContent, IonButton,
  IonIcon, IonItem, IonLabel, IonList, IonNote, alertController, toastController
} from '@ionic/vue';
import {
  downloadOutline, cloudUploadOutline, shieldCheckmarkOutline, timeOutline,
  refreshOutline, informationCircleOutline
} from 'ionicons/icons';
import { backupService, type BackupDocument, type BackupValidation } from '@/services/backup.service';

const busy = ref(false);
const fileInput = ref<HTMLInputElement | null>(null);
const pending = ref<{doc: BackupDocument; report: BackupValidation} | null>(null);
const snapshots = ref<Array<BackupValidation & {id:string}>>([]);
const tableLabels = [
  {key:'articles',label:'Articles'},
  {key:'fournisseurs',label:'Fournisseurs'},
  {key:'transport',label:'Transports'},
  {key:'commandes',label:'Commandes'},
  {key:'commande_lignes',label:'Lignes de commande'}
] as const;

const formatDate = (value: string) => new Date(value).toLocaleString('fr-FR');
const totalRows = (counts: Record<string,number>) => Object.values(counts).reduce((sum,n)=>sum+n,0);
const notify = async (message: string, color: 'success'|'warning'|'danger' = 'success') => {
  const toast = await toastController.create({message,duration:3500,color});
  await toast.present();
};

const createAndExport = async () => {
  busy.value = true;
  try {
    const doc = await backupService.createBackup();
    const result = await backupService.exportFile(doc);
    if (result === 'shared') await notify('Sauvegarde vérifiée et partagée.');
    else if (result === 'downloaded') await notify('Sauvegarde vérifiée. Le téléchargement a été lancé.');
    else await notify('Export annulé. Aucune donnée n’a été modifiée.', 'warning');
  } catch (error) {
    await notify(error instanceof Error ? error.message : 'Impossible de créer la sauvegarde.', 'danger');
  } finally { busy.value = false; }
};

const chooseFile = () => fileInput.value?.click();

const onFileSelected = async (event: Event) => {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  if (!file) return;
  busy.value = true;
  pending.value = null;
  try {
    pending.value = await backupService.importFile(file);
    await notify('Fichier valide. Vérifiez les quantités avant de restaurer.', 'success');
  } catch (error) {
    await notify(error instanceof Error ? error.message : 'Fichier de sauvegarde invalide.', 'danger');
  } finally { busy.value = false; }
};

const confirmRestore = async () => {
  if (!pending.value) return;
  const alert = await alertController.create({
    header: 'Confirmer la restauration',
    message: 'Toutes les données actuelles seront remplacées par celles de cette sauvegarde. Une copie de sécurité locale sera créée avant l’opération. Voulez-vous continuer ?',
    buttons: [
      {text:'Annuler',role:'cancel'},
      {text:'Restaurer',role:'destructive',handler:()=>{ void performRestore(); }}
    ]
  });
  await alert.present();
};

const performRestore = async () => {
  if (!pending.value) return;
  busy.value = true;
  try {
    await backupService.restoreBackup(pending.value.doc);
    pending.value = null;
    await loadSnapshots();
    await notify('Restauration terminée et vérifiée.', 'success');
    window.location.reload();
  } catch (error) {
    await notify(error instanceof Error ? error.message : 'La restauration a échoué.', 'danger');
  } finally { busy.value = false; }
};

const confirmSnapshotRestore = async (id: string) => {
  const alert = await alertController.create({
    header: 'Restaurer cette copie ?',
    message: 'Les données actuelles seront remplacées. Une copie de sécurité sera créée avant la restauration.',
    buttons: [
      {text:'Annuler',role:'cancel'},
      {text:'Restaurer',role:'destructive',handler:()=>{ void performSnapshotRestore(id); }}
    ]
  });
  await alert.present();
};

const performSnapshotRestore = async (id: string) => {
  busy.value = true;
  try {
    await backupService.restoreAutomaticSnapshot(id);
    pending.value = null;
    await loadSnapshots();
    await notify('Copie automatique restaurée et vérifiée.', 'success');
    window.location.reload();
  } catch (error) {
    await notify(error instanceof Error ? error.message : 'La restauration de la copie a échoué.', 'danger');
  } finally { busy.value = false; }
};

const loadSnapshots = async () => {
  try { snapshots.value = await backupService.listAutomaticSnapshots(); }
  catch (error) { await notify(error instanceof Error ? error.message : 'Lecture des copies automatiques impossible.', 'warning'); }
};

onMounted(loadSnapshots);
</script>

<style scoped>
.file-input { display: none; }
</style>
