import { createRouter, createWebHistory, createWebHashHistory } from '@ionic/vue-router';
import { RouteRecordRaw } from 'vue-router';

const routes: Array<RouteRecordRaw> = [
  {
    path: '/',
    redirect: '/dashboard'
  },
  {
    path: '/dashboard',
    component: () => import('@/views/DashboardPage.vue')
  },
  {
    path: '/articles',
    component: () => import('@/views/ArticlesPage.vue')
  },
  {
    path: '/articles/:id',
    component: () => import('@/views/ArticleDetailPage.vue')
  },
  {
    path: '/fournisseurs',
    component: () => import('@/views/FournisseursPage.vue')
  },
  {
    path: '/fournisseurs/:id',
    component: () => import('@/views/FournisseurDetailPage.vue')
  },
  {
    path: '/transport',
    component: () => import('@/views/TransportPage.vue')
  },
  {
    path: '/transport/:id',
    component: () => import('@/views/TransportDetailPage.vue')
  },
  {
    path: '/commandes',
    component: () => import('@/views/CommandesPage.vue')
  },
  {
    path: '/commandes/:id',
    component: () => import('@/views/CommandeDetailPage.vue')
  }
];

// En Electron, l'app est chargée via file:// : le mode history HTML5 ne
// fonctionne pas dans ce contexte (pas de vrai "chemin" serveur), donc on
// bascule sur le mode hash. Sur le web (Netlify, http/https), on garde le
// mode history classique pour des URLs propres.
const isFileProtocol = window.location.protocol === 'file:';

const router = createRouter({
  history: isFileProtocol
    ? createWebHashHistory()
    : createWebHistory(import.meta.env.BASE_URL),
  routes
});

export default router;
