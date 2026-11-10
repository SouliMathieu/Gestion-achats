// Exécuter avec un Chromium de test et un serveur Vite, jamais dans un profil utilisateur.
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

async function run() {
  const browser = await chromium.launch({headless: true,
    ...(process.env.CHROMIUM_EXECUTABLE ? {executablePath: process.env.CHROMIUM_EXECUTABLE} : {})});
  const baseURL = process.env.PHASE1_TEST_URL || 'http://127.0.0.1:5173';
  const results = [];
  try {
    for (const scenario of ['new', 'historical', 'partial', 'corrupt', 'denied', 'quota']) {
      const context = await browser.newContext();
      try {
        await context.addInitScript(({scenario}) => {
          const names = ['articles', 'fournisseurs', 'transport', 'commandes', 'commande_lignes'];
          if (localStorage.getItem('__phase1_test_seeded__') === 'yes') return;
          localStorage.setItem('__phase1_test_seeded__', 'yes');
          const historical = {
            articles: [{id: 'TEST-A', nom: 'TEST-article', prix: 0, devise: 'FCFA', ancien: {photo: 'TEST-photo'}}],
            fournisseurs: [{id: 'TEST-F', nom: 'TEST-fournisseur'}], transport: [],
            commandes: [{id: 'TEST-C', numero: 'TEST-001', dateCommande: '2020-01-01', fournisseurId: 'TEST-F',
              coutTotal: 42, coutTransport: 2, devise: 'MAD', statut: 'en_cours', dateCreation: '2020-01-01', historique: 'TEST-notes'}],
            commande_lignes: []
          };
          if (scenario === 'historical') for (const name of names) localStorage.setItem(name, JSON.stringify(historical[name]));
          if (scenario === 'partial' || scenario === 'quota') localStorage.setItem('articles', JSON.stringify(historical.articles));
          if (scenario === 'corrupt') localStorage.setItem('commandes', 'TEST-corrompu');
          window.__TEST_RAW_BEFORE__ = Object.fromEntries(names.map(n => [n, localStorage.getItem(n)]));
          if (scenario === 'denied') {
            const original = Storage.prototype.getItem;
            Storage.prototype.getItem = function(key) {
              if (names.includes(key)) throw new DOMException('TEST accès refusé', 'SecurityError');
              return original.call(this, key);
            };
          }
          if (scenario === 'quota') {
            const original = Storage.prototype.setItem;
            Storage.prototype.setItem = function(key, value) {
              if (names.includes(key)) throw new DOMException('TEST stockage plein', 'QuotaExceededError');
              return original.call(this, key, value);
            };
          }
        }, {scenario});
        const page = await context.newPage();
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        await page.goto(baseURL);
        const failing = ['corrupt', 'denied', 'quota'].includes(scenario);
        if (failing) {
          await page.getByRole('heading', {name: 'Vos données sont indisponibles'}).waitFor();
          assert.equal(await page.locator('ion-tabs').count(), 0);
          const failed = await page.evaluate(async () => {
            const {default: service} = await import('/src/services/database.service.ts');
            try { await service.getArticles(); return false; } catch { return true; }
          });
          assert.equal(failed, true);
        } else {
          await page.locator('ion-tabs').waitFor();
          await page.getByText('Tableau de bord', {exact: true}).first().waitFor();
          const state = await page.evaluate(async () => {
            const {default: service} = await import('/src/services/database.service.ts');
            const report = await service.initDatabase();
            const names = ['articles', 'fournisseurs', 'transport', 'commandes', 'commande_lignes'];
            const before = window.__TEST_RAW_BEFORE__;
            return {kind: report.kind, preserved: names.every(n => before[n] === null || before[n] === localStorage.getItem(n))};
          });
          assert.equal(state.kind, scenario === 'historical' ? 'historical' : scenario);
          assert.equal(state.preserved, true);
          const saved = await page.evaluate(() => Object.fromEntries(
            ['articles', 'fournisseurs', 'transport', 'commandes', 'commande_lignes'].map(n => [n, localStorage.getItem(n)])));
          await page.close();
          const restarted = await context.newPage();
          restarted.on('pageerror', error => errors.push(error.message));
          await restarted.goto(baseURL);
          await restarted.locator('ion-tabs').waitFor();
          const reopened = await restarted.evaluate(() => Object.fromEntries(
            ['articles', 'fournisseurs', 'transport', 'commandes', 'commande_lignes'].map(n => [n, localStorage.getItem(n)])));
          assert.deepEqual(reopened, saved);
        }
        if (scenario === 'corrupt') assert.equal(await page.evaluate(() => localStorage.getItem('commandes')), 'TEST-corrompu');
        if (scenario === 'quota') assert.equal(await page.evaluate(() => localStorage.getItem('articles')), JSON.stringify([{id:'TEST-A',nom:'TEST-article',prix:0,devise:'FCFA',ancien:{photo:'TEST-photo'}}]));
        assert.deepEqual(errors, []);
        results.push({scenario, passed: true});
      } finally { await context.close(); }
    }
  } finally { await browser.close(); }
  console.log(JSON.stringify({browser: 'Chromium', results}, null, 2));
}
run().catch(error => { console.error(error); process.exitCode = 1; });
