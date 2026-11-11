import { afterEach, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import App from '../../src/App.vue';
import DatabaseService from '../../src/services/database.service';
import { DatabaseInitializationError } from '../../src/services/database-initialization';

const mountedPages = vi.hoisted(() => ({count: 0}));
vi.mock('@ionic/vue', async () => {
  const {defineComponent, h} = await import('vue');
  const names = ['IonApp', 'IonTabs', 'IonTabBar', 'IonTabButton', 'IonIcon', 'IonLabel', 'IonPage', 'IonContent', 'IonSpinner', 'IonButton'];
  return {
    ...Object.fromEntries(names.map(name => [name, defineComponent({setup: (_, {slots}) => () => h('div', slots.default?.())})])),
    useBackButton: () => undefined,
    IonRouterOutlet: defineComponent({setup() { mountedPages.count++; return () => h('div', 'TEST-pages'); }})
  };
});
afterEach(() => { vi.restoreAllMocks(); mountedPages.count = 0; });

it('ne monte aucune page tant que la base n’est pas prête', async () => {
  let finish!: (value: any) => void;
  vi.spyOn(DatabaseService, 'initDatabase').mockReturnValue(new Promise(resolve => { finish = resolve; }));
  const wrapper = mount(App);
  expect(wrapper.text()).toContain('Ouverture de vos données');
  expect(mountedPages.count).toBe(0);
  finish({kind: 'historical'});
  await flushPromises();
  expect(mountedPages.count).toBe(1);
  wrapper.unmount();
});

it('affiche une erreur sans monter les pages ni exposer le contenu technique des données', async () => {
  vi.spyOn(DatabaseService, 'initDatabase').mockRejectedValue(new DatabaseInitializationError('TEST',
    'La base doit être examinée.', undefined, new Error('TEST-contenu-confidentiel')));
  const wrapper = mount(App);
  await flushPromises();
  expect(wrapper.text()).toContain('La base doit être examinée.');
  expect(wrapper.text()).toContain('Ne désinstallez pas');
  expect(wrapper.text()).not.toContain('TEST-contenu-confidentiel');
  expect(mountedPages.count).toBe(0);
  wrapper.unmount();
});
