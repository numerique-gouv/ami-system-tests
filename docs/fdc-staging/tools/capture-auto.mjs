/**
 * capture-auto.mjs — Capture réseau Playwright AUTOMATISÉE pour le parcours FCD AMI
 *
 * Usage :
 *   cd docs/fdc-staging/tools && npm install && node capture-auto.mjs
 *
 * Effectue automatiquement :
 *   1. Login FranceConnect (avec_nom_dusage / 123)
 *   2. Navigation vers la page Notifications
 *   3. Clic sur la notification "Et si on veillait"
 *   4. Clic sur "Bénéficier de ce service"
 *   5. Attente du formulaire OTV pré-rempli
 *
 * Sorties :
 *   ../network.jsonl        — une ligne JSON par requête (headers complets)
 *   ../redirects.jsonl      — chaîne de redirections HTTP
 *   ../initiators-cdp.jsonl — callstacks initiators JS (via CDP)
 *   ../bodies/req-NNN.*     — bodies request/response (JSON ou form)
 */

import { chromium } from 'playwright';
import { createWriteStream, mkdirSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = resolve(__dirname, '..');
const BODIES_DIR = resolve(OUT_DIR, 'bodies');
mkdirSync(BODIES_DIR, { recursive: true });

const networkLog = createWriteStream(resolve(OUT_DIR, 'network.jsonl'), { flags: 'w' });
const redirectsLog = createWriteStream(resolve(OUT_DIR, 'redirects.jsonl'), { flags: 'w' });

const AMI_STAGING = 'https://ami-back-staging.osc-fr1.scalingo.io';
const FC_LOGIN = 'avec_nom_dusage';
const FC_PASSWORD = '123';

const CAPTURE_BODY_DOMAINS = [
  'ami-back-staging.osc-fr1.scalingo.io',
  'qualif.demarches.service-public.gouv.fr',
];

function shouldCaptureBody(url) {
  return CAPTURE_BODY_DOMAINS.some((d) => url.includes(d));
}

// requestId CDP → initiator stack
const initiatorMap = new Map();
// URL → index séquentiel
const urlToIndex = new Map();
let seq = 1;

async function main() {
  const browser = await chromium.launch({ headless: false, slowMo: 200 });
  const context = await browser.newContext({ ignoreHTTPSErrors: false });
  const page = await context.newPage();

  // CDP pour les initiators JS
  const client = await context.newCDPSession(page);
  await client.send('Network.enable');
  client.on('Network.requestWillBeSent', (p) => {
    initiatorMap.set(p.requestId, { url: p.request.url, initiator: p.initiator });
  });

  // Capture réseau Playwright
  page.on('request', async (request) => {
    const idx = seq++;
    urlToIndex.set(request.url(), idx);

    const entry = {
      index: idx,
      type: 'request',
      method: request.method(),
      url: request.url(),
      timestamp: Date.now(),
      requestHeaders: await request.allHeaders().catch(() => ({})),
      postData: null,
      redirectedFrom: null,
    };

    if (shouldCaptureBody(request.url())) {
      const pd = request.postData();
      if (pd) {
        entry.postData = pd;
        const suffix = pd.trim().startsWith('{') ? 'json' : 'form';
        writeFileSync(resolve(BODIES_DIR, `req-${String(idx).padStart(3, '0')}-request-body.${suffix}`), pd);
      }
    }

    const redirectedFrom = request.redirectedFrom();
    if (redirectedFrom) {
      entry.redirectedFrom = redirectedFrom.url();
      redirectsLog.write(JSON.stringify({ index: idx, fromUrl: redirectedFrom.url(), toUrl: request.url(), timestamp: Date.now() }) + '\n');
    }

    networkLog.write(JSON.stringify(entry) + '\n');
  });

  page.on('response', async (response) => {
    const url = response.url();
    const idx = urlToIndex.get(url) ?? 0;
    const responseHeaders = await response.allHeaders().catch(() => ({}));

    const entry = {
      index: idx,
      type: 'response',
      url,
      status: response.status(),
      timestamp: Date.now(),
      responseHeaders,
      xRequestId: responseHeaders['x-request-id'] ?? null,
    };

    if (shouldCaptureBody(url) && response.status() !== 204) {
      try {
        const body = await response.body();
        if (body.length < 500_000) {
          const text = body.toString('utf8');
          const suffix = text.trim().startsWith('{') || text.trim().startsWith('[') ? 'json' : 'txt';
          writeFileSync(resolve(BODIES_DIR, `req-${String(idx).padStart(3, '0')}-response-body.${suffix}`), text);
        }
      } catch { /* body déjà consommé */ }
    }

    networkLog.write(JSON.stringify(entry) + '\n');
  });

  try {
    // ── Étape 1 : Page d'accueil AMI ──────────────────────────────────────────
    console.log('1/6 → Accueil AMI...');
    await page.goto(AMI_STAGING, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForSelector('#fr-connect-button', { timeout: 15000 });

    // ── Étape 2 : Clic FranceConnect ──────────────────────────────────────────
    console.log('2/6 → Clic FranceConnect...');
    await page.click('#fr-connect-button');

    // FranceConnect : sélection eIDAS faible [id^="idp-"]
    await page.waitForSelector('[id^="idp-"]', { timeout: 20000 });
    console.log('     → page eIDAS visible, clic eIDAS faible...');
    await page.click('[id^="idp-"]:first-child');

    // Formulaire FCP-LOW (#mire avec #login, #password)
    await page.waitForSelector('#mire', { timeout: 20000 });
    console.log('     → formulaire FCP-LOW visible, remplissage...');
    await page.fill('#login', FC_LOGIN);
    await page.fill('#password', FC_PASSWORD);
    await page.click('button[type="submit"]');

    // ── Étape 3 : Retour sur AMI après callback FC ────────────────────────────
    console.log('3/6 → Attente callback FC → AMI...');
    // Attend que l'URL revienne sur AMI (is_logged_in=true ou /)
    await page.waitForURL((url) => url.hostname.includes('ami-back-staging'), { timeout: 30000 });
    // Attend que la SPA home soit prête (lien "Suivi" visible)
    await page.waitForFunction(
      () => Array.from(document.querySelectorAll('a')).some(a => a.textContent?.trim() === 'Suivi' && a.offsetParent !== null),
      { timeout: 60000, polling: 500 }
    );
    console.log('     → SPA home prête');

    // ── Étape 4 : Navigation vers Notifications ───────────────────────────────
    console.log('4/6 → Navigation vers /#/notifications...');
    await page.evaluate(() => { window.location.hash = '/notifications'; });
    // Attend que la liste notifications soit visible
    await page.waitForFunction(
      () => document.body.innerText.includes('notification'),
      { timeout: 15000, polling: 500 }
    );
    console.log('     → page notifications chargée');

    // ── Étape 5 : Clic sur la notification OTV ────────────────────────────────
    console.log('5/6 → Clic sur notification "Et si on veillait"...');
    const notifLocator = page.locator('a, button, [role="link"]').filter({ hasText: /veillait/i }).first();
    await notifLocator.waitFor({ timeout: 15000 });
    await notifLocator.click();

    // Attend la page procédure (/#/procedure)
    await page.waitForFunction(
      () => window.location.hash.includes('procedure'),
      { timeout: 15000, polling: 300 }
    );
    console.log('     → page procédure visible');

    // Attend que le bouton "Bénéficier" soit activé (procedureUrl chargée)
    const beneficierBtn = page.locator('button').filter({ hasText: /bénéficier/i }).first();
    await beneficierBtn.waitFor({ timeout: 20000 });
    await page.waitForFunction(
      () => {
        const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent?.toLowerCase().includes('bénéficier'));
        return btn && !btn.disabled;
      },
      { timeout: 30000, polling: 500 }
    );
    console.log('     → bouton "Bénéficier de ce service" actif');

    // ── Étape 6 : Clic "Bénéficier de ce service" ────────────────────────────
    console.log('6/6 → Clic "Bénéficier de ce service"...');
    await beneficierBtn.click();

    // Attend l'arrivée sur PSL
    await page.waitForURL((url) => url.hostname.includes('demarches.service-public'), { timeout: 30000 });
    console.log('     → arrivée sur service-public.fr');

    // Attend le formulaire OTV pré-rempli (brouillon créé)
    await page.waitForFunction(
      () => document.body.innerText.toLowerCase().includes('brouillon') || document.body.innerText.toLowerCase().includes('tranquillité'),
      { timeout: 60000, polling: 1000 }
    ).catch(() => console.log('     ⚠ Attente formulaire PSL expirée — capture terminée quand même'));

    console.log('\n✓ Parcours terminé — formulaire OTV affiché');
    // Pause 3s pour laisser les dernières requêtes PSL se terminer
    await new Promise(r => setTimeout(r, 3000));

  } catch (err) {
    console.error('\n✗ Erreur pendant le parcours :', err.message);
    console.error('  La capture partielle est disponible dans network.jsonl');
  } finally {
    // Flush initiators CDP
    const lines = [];
    for (const [cdpId, data] of initiatorMap.entries()) {
      lines.push(JSON.stringify({ cdpId, ...data }));
    }
    writeFileSync(resolve(OUT_DIR, 'initiators-cdp.jsonl'), lines.join('\n') + '\n');

    networkLog.end();
    redirectsLog.end();
    await browser.close();
    console.log(`\n✓ Fichiers écrits dans ${OUT_DIR}`);
    console.log('  → network.jsonl, redirects.jsonl, initiators-cdp.jsonl, bodies/');
  }
}

main().catch((err) => { console.error(err); process.exit(1); });
