# Capture FCD enrichie — `docs/fdc-staging/`

## Contexte

`docs/fdc/` et `docs/fdc-923/` documentent la séquence réseau du parcours « Bénéficier de ce service → OTV ». Les notes Mermaid mélangent faits observés et inférences sur le rôle de chaque appel ; le code AMI déclencheur est mentionné mais pas les logs serveur effectivement émis.

Objectif : refaire **une seule passe** Playwright sur le parcours utilisateur réel et produire un dossier `docs/fdc-staging/` qui :
1. n'agrège que des faits issus d'outils (Playwright, `scalingo logs`, grep, lecture de code) — **une seule colonne « Rôle » est explicitement marquée interprétée**,
2. fournit un diagramme de séquence où chaque appel porte en note Mermaid les fichiers/fonctions AMI exécutés **et** les lignes de log serveur correspondantes.

`★ Insight ─────────────────────────────────────`
- Le contrat « tout est outillé sauf une colonne » oblige à choisir un nommage de colonne qui dit *pourquoi* la donnée est mécanique : « Émetteur (initiator JS stack) », « Handler (urls.py → view) », « Logs back (scalingo, request-id) ». Le lecteur peut auditer chaque case en rejouant la même commande.
- Côté staging Scalingo, la corrélation log↔requête se fait via le `X-Request-ID` (entête posée par Scalingo Router) qu'on relit dans la réponse HTTP côté Playwright ET dans `scalingo logs`. C'est la pierre angulaire de l'analyse — sans elle, on retombe dans l'inférence par horodatage.
`─────────────────────────────────────────────────`

## Faits à collecter et outil dédié

| Fait | Outil déterministe | Sortie brute archivée |
|------|--------------------|-----------------------|
| Méthode, URL, statut, durée | Playwright `request`/`response` events | `network.jsonl` |
| Headers (referer, authorization, X-Request-ID) | Playwright `request.allHeaders()` / `response.allHeaders()` | `network.jsonl` |
| Bodies request/response (JSON ou form) | Playwright `request.postData()` / `response.body()` | `bodies/req-NNN.*.json` |
| Chaîne de redirections HTTP | Playwright `response.request().redirectedFrom()` récursif | `redirects.jsonl` |
| Initiator JS (fichier:ligne du `fetch`) | Playwright CDP `Network.requestWillBeSent` → `initiator.stack` | champ `initiator` dans `network.jsonl` |
| Handler back AMI (URL → view) | grep `urls.py` + `api_urls.py` puis lecture `api_views.py` | `mapping-back.md` |
| Logs back AMI émis pendant l'appel | `scalingo --app ami-back-staging logs --lines 5000` filtré par `X-Request-ID` | `scalingo-logs.txt` + extraits par appel |
| `logger.*` statiquement présents dans la chaîne d'exécution back | grep `logger\.` dans le fichier du handler et ses appelés | colonne « Logs (statique) » du tableau |
| **Rôle de l'appel** (flux / fond / doublon / analytique) | **INTERPRÉTÉ — case à case par l'humain** | colonne explicitement étiquetée |

Aucune autre colonne n'est interprétée. Si un fait manque (ex. `X-Request-ID` absent), la case reste vide avec mention `n/a` et le pourquoi.

## Approche d'exécution

### 1. Préparation (scripts dans `docs/fdc-staging/tools/`)

- `capture.mjs` — script Playwright Node (lance Chromium non-headless, attache CDP `Network.enable`, écrit `network.jsonl`, `redirects.jsonl`, dump bodies). Le script ouvre l'URL AMI staging puis **attend l'opérateur** : c'est moi qui pilote la session (login FC, navigation Notifications, clic « Et si on veillait… »). Arrêt sur Ctrl+C.
- `tail-scalingo.sh` — `scalingo --app ami-back-staging logs --follow > scalingo-logs.txt` lancé en parallèle pendant la capture.
- `correlate.mjs` — parcourt `network.jsonl`, lit `X-Request-ID` de chaque réponse AMI, extrait les lignes correspondantes de `scalingo-logs.txt` dans `logs-by-request/req-NNN.log`.

Pas besoin de Python LSP : le back AMI a une routage Django classique, grep sur `urls.py` + lecture directe des `api_views.py` suffit et est plus reproductible.

### 2. Capture du parcours

Le script `capture.mjs` est lancé, puis je joue le scénario utilisateur dans le navigateur ouvert :
1. Login AMI via FranceConnect
2. Page Notifications
3. Clic sur la notification « Et si on veillait sur votre logement ? »
4. Page « procédure » → clic « Bénéficier de ce service »
5. Arrivée sur formulaire OTV pré-rempli
6. Ctrl+C → arrêt scripts, fichiers bruts figés.

### 3. Production des artefacts

- `network.jsonl` + `bodies/` + `redirects.jsonl` + `scalingo-logs.txt` + `logs-by-request/` (bruts, commités).
- `mapping-back.md` — pour chaque endpoint AMI observé : route trouvée dans `ami/api/urls.py` (et sous-routes), fichier/ligne du handler, `logger.*` statiquement présents.
- `index.md` — tableau des appels (colonnes : `#`, `Méthode`, `URL`, `Statut`, `X-Request-ID`, `Initiator JS`, `Handler back`, `Logs back (runtime)`, **`Rôle (interprété)`**), suivi du diagramme Mermaid où chaque appel a une **note** avec :
  - file:line du fetch côté Svelte,
  - file:line du handler back,
  - 1–3 lignes de log saillantes extraites de `logs-by-request/req-NNN.log`.
- En tête d'`index.md`, un encadré « Comment ce document a été produit » qui liste les commandes exactes à rejouer.

## Fichiers à créer

```
docs/fdc-staging/
├── index.md
├── mapping-back.md
├── tools/
│   ├── capture.mjs
│   ├── tail-scalingo.sh
│   └── correlate.mjs
├── network.jsonl
├── redirects.jsonl
├── scalingo-logs.txt
├── bodies/req-NNN.*.json
└── logs-by-request/req-NNN.log
```

## Vérification end-to-end

1. `cd docs/fdc-staging/tools && node capture.mjs` (laisse Chromium ouvert).
2. Dans un autre shell, `./tail-scalingo.sh`.
3. Jouer le parcours utilisateur.
4. Ctrl+C sur les deux.
5. `node correlate.mjs` — produit `logs-by-request/`.
6. Rouvrir `docs/fdc-staging/index.md` et vérifier que :
   - chaque ligne du tableau a un `X-Request-ID` non vide pour les appels AMI (sinon noter `n/a — pas servi par Scalingo`),
   - chaque appel `[flux]` a une note Mermaid avec au minimum un file:line émetteur et un file:line handler,
   - la colonne « Rôle (interprété) » est la seule à porter le suffixe `(interprété)`.
7. `git diff docs/fdc-staging/` et `git status` pour confirmer qu'aucun fichier hors du dossier n'est touché.

## Hors périmètre

- Pas de modification des docs existantes `docs/fdc/` ni `docs/fdc-923/`.
- Pas de capture côté PSL/Keycloak des logs serveur (pas d'accès) — seules les redirections browser sont tracées.
- Pas de Python LSP : grep + lecture directe sont plus reproductibles et l'objectif est l'auditabilité, pas la couverture exhaustive.
