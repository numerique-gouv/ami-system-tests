/**
 * capture.mjs — Capture réseau Playwright pour le parcours FCD AMI
 *
 * Usage :
 *   cd docs/fdc-staging/tools && npm install && node capture.mjs
 *
 * Le navigateur s'ouvre. Jouez le parcours utilisateur complet :
 *   1. Connexion AMI via FranceConnect
 *   2. Page Notifications
 *   3. Clic "Et si on veillait sur votre logement ?"
 *   4. Page procédure → clic "Bénéficier de ce service"
 *   5. Arrivée sur formulaire OTV pré-rempli
 * Appuyez sur Ctrl+C pour arrêter la capture et écrire les fichiers.
 *
 * Sorties :
 *   ../network.jsonl        — une ligne JSON par requête (headers + initiator CDP)
 *   ../redirects.jsonl      — chaîne de redirections HTTP
 *   ../bodies/req-NNN.*     — bodies request/response (JSON ou form)
 */

import { chromium } from 'playwright';
import { createWriteStream, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = resolve(__dirname, '..');
const BODIES_DIR = resolve(OUT_DIR, 'bodies');

mkdirSync(BODIES_DIR, { recursive: true });

const networkLog = createWriteStream(resolve(OUT_DIR, 'network.jsonl'), { flags: 'w' });
const redirectsLog = createWriteStream(resolve(OUT_DIR, 'redirects.jsonl'), { flags: 'w' });

const AMI_STAGING = 'https://ami-back-staging.osc-fr1.scalingo.io';

// Domaines pour lesquels on veut les bodies complets
const CAPTURE_BODY_DOMAINS = [
  'ami-back-staging.osc-fr1.scalingo.io',
  'qualif.demarches.service-public.gouv.fr',
];

// requestId CDP → initiator stack
const initiatorMap = new Map();

function shouldCaptureBody(url) {
  return CAPTURE_BODY_DOMAINS.some((d) => url.includes(d));
}

async function main() {
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({
    // Conserve les cookies de session entre les navigations
    ignoreHTTPSErrors: false,
  });

  const page = await context.newPage();

  // Attache CDP pour récupérer les initiators JS (callstack du fetch)
  const client = await context.newCDPSession(page);
  await client.send('Network.enable');

  client.on('Network.requestWillBeSent', (params) => {
    initiatorMap.set(params.requestId, params.initiator);
  });

  // Compteur séquentiel sur les requêtes Playwright
  const requestIndexMap = new Map(); // playwrightRequestId → index
  let seq = 1;

  page.on('request', async (request) => {
    const idx = seq++;
    // On utilise l'URL comme clé partielle pour retrouver le CDP requestId
    requestIndexMap.set(request.url(), idx);

    const entry = {
      index: idx,
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
        const suffix = pd.startsWith('{') ? 'json' : 'form';
        const fname = `req-${String(idx).padStart(3, '0')}-request-body.${suffix}`;
        import('fs').then(({ writeFileSync }) =>
          writeFileSync(resolve(BODIES_DIR, fname), pd)
        );
      }
    }

    const redirectedFrom = request.redirectedFrom();
    if (redirectedFrom) {
      const rdEntry = {
        index: idx,
        fromUrl: redirectedFrom.url(),
        toUrl: request.url(),
        timestamp: Date.now(),
      };
      redirectsLog.write(JSON.stringify(rdEntry) + '\n');
      entry.redirectedFrom = redirectedFrom.url();
    }

    networkLog.write(JSON.stringify(entry) + '\n');
  });

  page.on('response', async (response) => {
    const url = response.url();
    const idx = requestIndexMap.get(url) ?? 0;

    const entry = {
      index: idx,
      url,
      status: response.status(),
      timestamp: Date.now(),
      responseHeaders: await response.allHeaders().catch(() => ({})),
      xRequestId: null,
    };

    // Extrait X-Request-ID posé par Scalingo Router
    const headers = await response.allHeaders().catch(() => ({}));
    entry.xRequestId = headers['x-request-id'] ?? null;

      if (shouldCaptureBody(url) && response.status() !== 204) {
      try {
        const body = await response.body();
        if (body.length < 500_000) {
          const text = body.toString('utf8');
          const suffix = text.startsWith('{') || text.startsWith('[') ? 'json' : 'txt';
          const fname = `req-${String(idx).padStart(3, '0')}-response-body.${suffix}`;
          import('fs').then(({ writeFileSync }) =>
            writeFileSync(resolve(BODIES_DIR, fname), text)
        );
        }
      } catch {
        // body déjà consommé ou erreur réseau
      }
    }

    networkLog.write(JSON.stringify({ type: 'response', ...entry }) + '\n');
  });

  // Écrit les initiators CDP collectés à la fin (liés par URL)
  async function flushInitiators() {
    const fname = resolve(OUT_DIR, 'initiators-cdp.jsonl');
    const { writeFileSync } = await import('fs');
    const lines = [];
    for (const [cdpId, initiator] of initiatorMap.entries()) {
      lines.push(JSON.stringify({ cdpId, initiator }));
    }
    writeFileSync(fname, lines.join('\n') + '\n');
  }

  // Ouvre AMI staging
  await page.goto(AMI_STAGING, { waitUntil: 'domcontentloaded' });
  console.log(`\n✓ Navigateur ouvert sur ${AMI_STAGING}`);
  console.log('  → Jouez le parcours utilisateur complet dans la fenêtre.');
  console.log('  → Appuyez sur Ctrl+C quand le formulaire OTV est affiché.\n');

  // Attend Ctrl+C
  await new Promise((resolve) => process.on('SIGINT', resolve));

  console.log('\n⏹ Arrêt — écriture des fichiers...');
  await flushInitiators();
  networkLog.end();
  redirectsLog.end();
  await browser.close();
  console.log(`✓ network.jsonl, redirects.jsonl, initiators-cdp.jsonl, bodies/ écrits dans ${OUT_DIR}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
