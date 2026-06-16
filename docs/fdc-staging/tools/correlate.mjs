/**
 * correlate.mjs — Corrèle network.jsonl et scalingo-logs.txt par X-Request-ID
 *
 * Usage (après capture + tail-scalingo) :
 *   cd docs/fdc-staging/tools && node correlate.mjs
 *
 * Sortie :
 *   ../logs-by-request/req-NNN-<x-request-id>.log  pour chaque appel AMI
 *   ../summary.md                                    tableau récapitulatif prêt à coller
 */

import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = resolve(__dirname, '..');
const LOGS_BY_REQ = resolve(OUT_DIR, 'logs-by-request');

mkdirSync(LOGS_BY_REQ, { recursive: true });

const AMI_HOST = 'ami-back-staging.osc-fr1.scalingo.io';

// Lit network.jsonl
const networkLines = readFileSync(resolve(OUT_DIR, 'network.jsonl'), 'utf8')
  .split('\n')
  .filter(Boolean)
  .map((l) => JSON.parse(l));

// Lit scalingo-logs.txt
const scalingoLines = readFileSync(resolve(OUT_DIR, 'scalingo-logs.txt'), 'utf8').split('\n');

// Construit un index X-Request-ID → lignes Scalingo
// Format Scalingo router : "... [router] ... request_id=c3278627-... ..."
// Format Scalingo app    : "... [web-1]  ... "GET /path HTTP/1.1" 200" (pas de rid direct)
// On indexe d'abord les lignes [router] par request_id, puis on associate [web-1]
// par horodatage immédiat (même seconde, même chemin).
const scalingoByRequestId = new Map();
// Index path → list of (requestId, line) pour les lignes router
const routerPathToRid = new Map();

for (const line of scalingoLines) {
  // Lignes router : contiennent request_id=<uuid>
  const routerMatch = line.match(/\[router\].*?request_id=([a-f0-9-]{36})/);
  if (routerMatch) {
    const rid = routerMatch[1];
    if (!scalingoByRequestId.has(rid)) scalingoByRequestId.set(rid, []);
    scalingoByRequestId.get(rid).push(line);

    // Extrait aussi le path pour cross-référencer les lignes [web-1]
    const pathMatch = line.match(/path="([^"]+)"/);
    if (pathMatch) {
      const path = pathMatch[1];
      if (!routerPathToRid.has(path)) routerPathToRid.set(path, []);
      routerPathToRid.get(path).push({ rid, line });
    }
    continue;
  }

  // Lignes web-1 : "GET /path HTTP/1.1" 200 — on cherche le rid via le path
  const webMatch = line.match(/\[web-\d+\].*?"(GET|POST|PATCH|PUT|DELETE) ([^ ]+) HTTP/);
  if (webMatch) {
    const path = webMatch[2];
    const candidates = routerPathToRid.get(path) || [];
    for (const { rid } of candidates) {
      if (!scalingoByRequestId.has(rid)) scalingoByRequestId.set(rid, []);
      if (!scalingoByRequestId.get(rid).includes(line)) {
        scalingoByRequestId.get(rid).push(line);
      }
    }
  }
}

// Traite les réponses AMI (qui ont un X-Request-ID)
const responses = networkLines.filter(
  (e) => e.type === 'response' && e.url?.includes(AMI_HOST) && e.xRequestId
);

const summaryRows = [];

for (const resp of responses) {
  const rid = resp.xRequestId;
  const logLines = scalingoByRequestId.get(rid) ?? [];

  const fname = `req-${String(resp.index).padStart(3, '0')}-${rid}.log`;
  const content = logLines.length
    ? logLines.join('\n')
    : `# Aucune ligne Scalingo trouvée pour X-Request-ID=${rid}\n# Vérifiez que tail-scalingo.sh tournait pendant la capture.`;

  writeFileSync(resolve(LOGS_BY_REQ, fname), content);

  summaryRows.push({
    index: resp.index,
    status: resp.status,
    url: resp.url.replace(`https://${AMI_HOST}`, ''),
    xRequestId: rid,
    logLines: logLines.length,
    logFile: `logs-by-request/${fname}`,
  });
}

// Écriture du tableau summary.md
const header = `# Résumé corrélation réseau ↔ logs Scalingo

Produit par \`correlate.mjs\` le ${new Date().toISOString()}.

| # | Statut | Chemin | X-Request-ID | Lignes log | Fichier log |
|---|--------|--------|--------------|------------|-------------|
`;
const rows = summaryRows.map(
  (r) =>
    `| ${r.index} | ${r.status} | \`${r.url}\` | \`${r.xRequestId}\` | ${r.logLines} | [${r.logFile}](${r.logFile}) |`
);

writeFileSync(resolve(OUT_DIR, 'summary.md'), header + rows.join('\n') + '\n');

console.log(`✓ ${summaryRows.length} requêtes AMI corrélées`);
console.log(`✓ Fichiers écrits dans logs-by-request/ et summary.md`);
if (summaryRows.some((r) => r.logLines === 0)) {
  console.warn('⚠ Certaines requêtes AMI n\'ont aucune ligne de log Scalingo correspondante.');
  console.warn('  → Vérifiez que tail-scalingo.sh était actif pendant toute la capture.');
}
