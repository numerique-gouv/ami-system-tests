# Automatiser un scénario de test à la main, de la spécification au test WDIO

**Sans IA, sans LLM.** Tout se fait avec trois outils déterministes : `wdio session` (explorer et enregistrer), `curl` (l'API
partenaire) et un éditeur. Le code que `wdio session` affiche est celui qu'il vient d'exécuter, pas une suggestion : c'est un
enregistreur. Ne pas utiliser `browser.act()` ni `wdio-ai`.

Public : un testeur qui sait lire du TypeScript mais n'a jamais utilisé WDIO. Plateforme : la webapp (Chrome), sans émulateur ;
la dernière section dit ce qui change en Android et iOS.

> **Statut des preuves.** Les sorties citées ont été observées le 2026-10-12 sur le staging, avec les commandes ci-dessous. Le
> déroulé avec le squelette de test et la session en pause (étape 3, voie B) a été exécuté de bout en bout. Ce qui n'a pas été
> exécuté est marqué « non vérifié ». Les jetons, mots de passe et `fc_hash` sont remplacés par des `…` : ne les
> recopiez jamais dans un document.

## Le scénario fil rouge

Le consentement est celui de l'usager envers le partenaire (API `/api/v1/consent/{fc_hash}`). Une démarche est un événement
`PUT /api/v2/event` avec des champs `item_*` ; elle s'affiche dans **Suivi** et la notification dans **Notifications**.

| # | Action | Résultat attendu (spécification) |
|---|---|---|
| 1 | Retirer le consentement | — |
| 2 | Envoyer la création de la démarche **D1** | — |
| 3 | Donner le consentement | — |
| 4 | Envoyer la création de la démarche **D2** | — |
| 5 | Observer | seule D2 est reçue |
| 6 | Envoyer une mise à jour de D1, puis de D2 | — |
| 7 | Observer | seule D2 est reçue |
| 8 | Retirer le consentement | — |
| 9 | Envoyer la fin de D1 et de D2 | — |
| 10 | Observer | rien n'est reçu |

## Le déroulé en 8 étapes

| Étape | Ce qu'on fait | Outil |
|---|---|---|
| 0 | Préparer l'environnement | `just`, `.env.local` |
| 1 | Spécifier : lever les ambiguïtés avant tout code | papier |
| 2 | Explorer l'API à la main | `curl` |
| 3 | Explorer l'app, page par page | `wdio session` (voie A : session vierge ; voie B : app connectée par le `before` d'un test) |
| 4 | Choisir un locator par élément | `find`, `snapshot`, règle de `CONTRIBUTING.md` §2 |
| 5 | Récupérer le code | sortie `→ await …`, `history`, `explore-export` |
| 6 | Le ranger dans les 3 niveaux de Page Objects | éditeur |
| 7 | Itérer, comparer attendu et observé | `just test-webapp` |

Les étapes 3 à 5 se répètent **pour chaque page**, puis on passe à la suivante (étape 6 en continu).

---

## Étape 0 — Préparer

`.env.local` contient les secrets du partenaire (`NOTIF_PARTNER_ID`, `NOTIF_PARTNER_SECRET`) et `WEB_APP_ACCESS_KEYS` (code
d'accès du staging). Dans **votre** terminal, chargez-les pour la durée de la session, sans les afficher :

```bash
set -a; . ./.env.local; set +a
API=https://ami-back-staging.osc-fr1.scalingo.io          # backend de l'environnement testé
AUTH="$NOTIF_PARTNER_ID:$NOTIF_PARTNER_SECRET"
FC=<fc_hash de l'utilisateur de test, dans src/helpers/test-users.local.ts>
```

### Ce qui est déjà fait pour vous

| Besoin | Déjà en place | Où |
|---|---|---|
| Code d'accès de la webapp de staging (fenêtre `window.prompt` de la SPA) | un cookie `access_key` est posé **avant** d'ouvrir la SPA, valable 7 jours ; sa valeur (`WEB_APP_ACCESS_KEYS`) n'est jamais affichée | `just explore-webapp` (recette `_explore`) ; pour les tests, `handleAccessKeyCookie` dans le hook `before` de `wdio.webapp.conf.ts` (`src/helpers/access-code.ts`) |
| Connexion FranceConnect (eIDAS, identifiants) et onboarding (clé d'accès, zones, notifications) | automatisés, et repartent de l'état courant de l'app | `getAppToStartingState()` dans `src/pages/authenticate.process.ts` |
| Consentement partenaire | donné par défaut en fin de `getAppToStartingState()` | idem (`grantConsent`) |
| Appels API (consentement, démarche) | helpers | `src/helpers/notifications-api.ts` : `checkConsent`, `grantConsent`, `publishNotification` |

Vous n'avez donc **pas** à refaire la connexion à la main : la voie B de l'étape 3 vous place directement dans l'app connectée.
La section 3.3 ne la décrit que pour comprendre le parcours, ou pour la réexplorer si l'app change.

## Étape 1 — Spécifier

Avant d'ouvrir un navigateur, remplacer chaque mot flou par une observation vérifiable. Pour ce scénario, trois questions à poser
au métier **avant** d'écrire le test :

1. **« Reçoit » veut dire quoi ?** La démarche dans **Suivi** ? La notification dans **Notifications** ? Les deux ? (Les essais
   ci-dessous montrent que les deux pages ne réagissent pas pareil au consentement.)
2. Une démarche créée **sans** consentement doit-elle apparaître **après** que l'usager a consenti ? (étapes 2 → 5)
3. Que doit-il se passer d'une démarche déjà reçue quand le consentement est retiré ? (étapes 8 → 10)

Écrire ensuite les données : un **identifiant unique par exécution** (`TUTO-<heure>-D1`) pour retrouver ses démarches parmi celles
des autres runs, et l'état à restaurer à la fin (consentement actif).

## Étape 2 — Explorer l'API à la main

Chaque appel renvoie un code HTTP. Vérifié :

```bash
# lire le consentement : 200 = actif, 404 = absent ou retiré
curl -s -o /dev/null -w '%{http_code}\n' -u "$AUTH" "$API/api/v1/consent/$FC"

# donner / retirer le consentement
curl -s -o /dev/null -w '%{http_code}\n' -u "$AUTH" -H 'Content-Type: application/json' -d '{"consent": true}'  "$API/api/v1/consent/$FC"
curl -s -o /dev/null -w '%{http_code}\n' -u "$AUTH" -H 'Content-Type: application/json' -d '{"consent": false}' "$API/api/v1/consent/$FC"

# créer une démarche (item_generic_status : new | wip | closed)
curl -s -o /dev/null -w '%{http_code}\n' -u "$AUTH" -X PUT -H 'Content-Type: application/json' "$API/api/v2/event" -d '{
  "recipient_fc_hash": "'"$FC"'",
  "content_title": "Démarche TUTO-1 création", "content_body": "corps",
  "item_type": "OTV", "item_id": "TUTO-1",
  "item_status_label": "Brouillon", "item_generic_status": "new", "item_canal": "AMI",
  "event_date": "'"$(date -u +%Y-%m-%dT%H:%M:%SZ)"'"
}'
```

Sorties observées : lecture `200`, retrait `200`, lecture `404`, don `200`, lecture `200`, création `201`.

À retenir : `event_date` doit être différente à chaque appel (le backend ignore un événement identique : `notifications-api.ts`
l'indique). Une **mise à jour** est le même appel avec le **même `item_id`** et `wip`, une **fin** avec `closed`.

Résultat important, observé **avec le consentement retiré** : `GET consent` renvoie 404, et le `PUT /api/v2/event` qui suit est
**quand même accepté** (`OK`). Le helper `publishNotification` refuse d'envoyer dans ce cas ; pour le scénario, on le contourne
avec `checkConsent: false`.

## Étape 3 — Explorer l'app, page par page

### 3.1 Démarrer : deux voies

**Voie A — session vierge : `just explore-webapp "/"`.** Ouvre Chrome (headless) sur la SPA avec le **cookie d'accès déjà posé** :
la recette écrit le cookie `access_key` (valeur de `WEB_APP_ACCESS_KEYS`, jamais affichée) sur l'origine du backend *avant* de naviguer,
sinon la SPA ouvrirait sa fenêtre de code d'accès. L'app n'est **pas connectée** : cette voie sert à explorer la page de connexion ou
des pages publiques.

```bash
just explore-webapp "/"
```

Sortie observée :

```
Session "webapp" ready: chrome 154.0.8037.99 (headless) · https://ami-back-staging.osc-fr1.scalingo.io/favicon.ico
Page: https://ami-back-staging.osc-fr1.scalingo.io/#/login
- document "Mobile app" url=…/#/login
  - main
    - button "S’identifier avec FranceConnect" [ref=e1]
    - button "Qu’est-ce que FranceConnect ? - nouvelle fenêtre" [ref=e2]
    - button "Je n’arrive pas à me connecter" [ref=e3]
→ await browser.url('https://ami-back-staging.osc-fr1.scalingo.io/')
```

Lire la sortie : une ligne par élément interactif, avec sa **ref** (`e1`) pour agir dessus. La dernière ligne `→ await …` est le
code exécuté.

**Voie B — app connectée : un squelette de test et `just debug-webapp` (recommandée pour ce scénario).** On exécute le `before`
standard des tests (cookie d'accès, connexion, onboarding, consentement), puis le test se met **en pause** dans l'app connectée.
Le squelette est dans le même dossier que ce tutoriel : [`squelette-exploration.test.ts`](squelette-exploration.test.ts).

```bash
cp docs/tutoriels/squelette-exploration.test.ts src/tests/webapp/mon-scenario.test.ts
just debug-webapp src/tests/webapp/mon-scenario.test.ts
```

Sortie observée (la connexion a pris 17 s ; le fichier de l'essai portait un autre nom) :

```
… INFO helper: getAppToStartingState: pas de session lisible, connexion depuis l'écran affiché
… INFO helper: getAppToStartingState: état de départ atteint, URL : https://ami-back-staging.osc-fr1.scalingo.io/
Paused in <fichier> › <titre du it>. Inspect with `wdio session -s debug-0-0 snapshot`, continue with `wdio session -s debug-0-0 resume`.
```

Le terminal reste occupé par le test : ouvrez-en un second.

```bash
just sessions                    # debug-0-0   wdio run (mon-scenario.test.ts)
just s debug-0-0 info            # URL, titre, navigateur
just s debug-0-0 snapshot -i     # l'accueil de l'app connectée
```

`snapshot -i` montre la barre basse `Accueil` (`e1`), `Agenda` (`e2`), `Services` (`e3`), `Suivi` (`e4`), `Plus` (`e5`) et
`Voir les notifications(…)` (`e6`). Les refs **repartent de `e1`** dans chaque session : relisez toujours le snapshot.

À savoir sur cette voie :

- **Dans toute la suite, remplacez `webapp` par `debug-0-0`** : `webapp` est le nom de la session de la voie A.
- **Tout ce que vous faites est enregistré, sans le `before`.** `just s debug-0-0 history` et
  `just s debug-0-0 export --out exports/<nom>.e2e.ts` (dossier ignoré par git) ne contiennent que vos actions. Observé après
  un clic sur « Suivi » puis une attente :

  ```
  1  await $('role/button[name="Suivi"]').click()
  2  await browser.waitUntil(async () => (await browser.getUrl()).includes('followup'))
  ```
- **`resume` termine le test** (observé : « 1 passing »), `close` le fait échouer à la place. Dans les deux cas la session disparaît.
- **La durée de la pause n'est pas limitée en pratique.** Une pause de plus de 2 minutes (« 1 passing (2m 48.4s) ») est passée sans
  réglage de délai : `--debug=agent` porte le délai du framework à 24 h (code de `@wdio/session`).
- **`beforeEach` rappelle `getAppToStartingState()`** avant l'`it` : l'app est reconnectée si besoin et ramenée à l'accueil, vous partez toujours du même état. Le consentement est donc **redonné avant chaque `it`** : si un test en a besoin d'un autre état, il le pose dans l'`it`, après le hook.
- **Avant de commiter, supprimez `browser.debug()`.** Le lint le refuse (règle `wdio/no-debug`, vérifiée) : une pause oubliée
  bloquerait la CI.

### 3.2 Les cinq commandes de la boucle

| Pour… | Commande | Remarque |
|---|---|---|
| voir la page | `just s webapp snapshot -i` | éléments interactifs et leurs refs |
| chercher un élément | `just s webapp find "texte"` | n'imprime que la partie concernée (utile : la page Suivi compte 257 éléments) |
| lire le texte | `just s webapp read` | texte de la page |
| agir | `just s webapp click eN` / `fill eN "valeur"` | affiche le diff et le code |
| attendre | `just s webapp wait --text "…"` / `--url …` / `wait 3000` | **à utiliser avant de conclure** |

Ces commandes sont écrites pour la session `webapp` de la voie A (voie B : `debug-0-0`). Une capture : `just s webapp screenshot`. Une vérification libre en JavaScript : `just s webapp exec -e "<expression>"`.

### 3.3 (Facultatif) La connexion, à la main

Déjà automatisée par `getAppToStartingState()` (voie B) : ne la refaites que pour comprendre le parcours ou si l'app change. C'est aussi
un bon exemple de ce que `wdio session` enregistre. Départ : voie A.

```bash
just s webapp click e1                        # « S’identifier avec FranceConnect »
just s webapp snapshot -i                     # page FranceConnect : trois comptes eIDAS et « CNAV »
just s webapp click e7                        # « Démonstration eIDAS faible »
just s webapp fill e18 "<identifiant de test>"
just s webapp fill e19 "<mot de passe de test>"
just s webapp click e21                       # « Valider »
```

Codes affichés par ces commandes, à noter :

```
→ await $('role/button[name="S’identifier avec FranceConnect"]').click()
→ await $('[data-testid="idp-e1e90d50-cca0-4a85-9db3-0bcc190ee6f7"]').click()      ← à remplacer, voir étape 4
→ await $('role/textbox[name="Identifiant"]').setValue('…')
→ await $('role/textbox[name="Mot de passe"]').setValue('…')
→ await $('role/button[name="Valider"]').click()
```

> **Piège observé.** Après « Valider », l'URL affichée contient `?id_token=…&user_data=…` : des **jetons de session**. Ne les copiez
> pas dans une note, un ticket ou ce tutoriel. Les logs du projet les masquent avec `maskSensitiveUrl` (`src/helpers/session.ts`).

Puis l'onboarding de première connexion, un écran à la fois (`snapshot -i` entre chaque) :

```bash
just s webapp click e27          # « Peut-être plus tard » (clé d'accès)  → /#/welcome/zones
just s webapp click e55          # « Passer » (zones scolaires)            → /#/welcome/notifications
just s webapp click e57          # « Peut-être plus tard » (notifications) → accueil
just s webapp wait --text "Bonjour"
```

`click e55` affiche `→ await $('[data-testid="skip-button"]').click()` : encore un `data-testid` à remplacer (étape 4).
`wait --text` affiche `→ await browser.waitUntil(async () => (await $('body').getText()).includes('Bonjour'))`.

Les refs (`e27`, `e55`…) changent à chaque page : toujours relancer `snapshot -i` avant d'agir.

### 3.4 Accueil, puis Suivi

```bash
just s webapp snapshot -i
```

L'accueil expose la barre basse : `Accueil`, `Agenda`, `Services`, `Suivi`, `Plus`, plus `Voir les notifications(304)`.

```bash
just s webapp click e61          # « Suivi » (la ref dépend de la session : voie B, c'est e4)
```

Sortie observée : `No visible change on the page.` puis, au `snapshot -i` suivant, l'URL est `…/#/followup`. **Une SPA change de page
de façon asynchrone : le diff du clic n'est pas la vérité.** Attendre (`wait --url` ou `wait --text`), puis regarder.

Sans consentement, la page Suivi montre l'état vide :

```
# Mes démarches
Suivez vos démarches administratives au même endroit !
Je veux suivre mes démarches
```

Avec des démarches, `just s webapp find "TUTO-…-D2"` donne la structure d'une carte : un `heading` de niveau 3 qui contient un
`button` du titre, puis trois `paragraph` (corps, **statut**, date) :

```
- heading "Démarche TUTO-…-D2 création" [level=3]
  - button "Démarche TUTO-…-D2 création" [ref=e90]
- paragraph "corps Démarche TUTO-…-D2 création"
- paragraph "Brouillon"
- paragraph "12 octobre 2026 - 22:31"
```

### 3.5 Notifications

```bash
just s webapp navigate "https://ami-back-staging.osc-fr1.scalingo.io/#/notifications"
just s webapp wait --text "Notifications"
just s webapp find "TUTO-…"
```

Chaque notification : un `heading` de niveau 3 (titre) et un `paragraph` (corps). Il n'y a **pas** de statut de démarche ici.

### 3.6 Observer à répétition sans cliquer

Pour répéter une observation après chaque envoi API (étapes 5, 7, 10), la séquence qui a fonctionné :

```bash
just s webapp navigate "$API/#/followup"
just s webapp reload
just s webapp wait 6000
just s webapp find "TUTO-…"          # code retour 1 et « No match » si rien n'est affiché
```

## Étape 4 — Choisir un locator par élément

Règle du projet (`CONTRIBUTING.md` §2) : le **sens perçu par l'utilisateur**, rôle ARIA + nom accessible, avant la structure.

| Élément | Code généré par `wdio session` | À écrire dans le projet | Pourquoi |
|---|---|---|---|
| Bouton FranceConnect | `role/button[name="S’identifier avec FranceConnect"]` | idem, via `clickButton(…)` de `src/helpers/spa.ts` | déjà par rôle et nom |
| Compte eIDAS faible | `[data-testid="idp-e1e90d50-…"]` | lien nommé « Démonstration eIDAS faible » | un `data-testid` est le dernier recours ; cet identifiant est opaque |
| « Passer » (zones) | `[data-testid="skip-button"]` | bouton nommé « Passer » | idem |
| Titre d'une démarche | (aucun, `find` seulement) | `heading` niveau 3 portant le titre | stable, lisible |
| Statut d'une démarche | (aucun) | le `paragraph` qui suit le corps | à confirmer : l'ordre corps → statut → date est observé, pas garanti |

Pour vérifier un locator avant de l'adopter : `just s webapp exec -e "await $('role/button[name=\"Suivi\"]').isDisplayed()"`.
Consulter aussi `src/pages/locators/suivi-demarches.locators.ts` : le projet utilise des classes DSFR (`.fr-tile__title`,
`.fr-badge`), jamais des classes Svelte hashées.

## Étape 5 — Récupérer le code

Chaque commande qui agit affiche son code (`→ await …`). Pour tout récupérer d'un coup :

```bash
just s debug-0-0 history                      # voie B : liste numérotée de vos actions
just s debug-0-0 export --out exports/mon-scenario.e2e.ts --title "mon scénario"
just explore-export mon-scenario webapp       # voie A : même chose, écrit exports/mon-scenario.e2e.ts (non vérifié ici)
```

Observé en voie B après un clic et une attente, l'export donne un fichier Mocha complet :

```typescript
import { browser, $, expect } from '@wdio/globals'

describe('zz debug', () => {
    it('zz debug', async () => {
        await $('role/button[name="Suivi"]').click()

        await browser.waitUntil(async () => (await browser.getUrl()).includes('followup'))
    })
})
```

L'export est un **brouillon** : il garde les sélecteurs générés (dont les `data-testid`), n'inclut ni le `before` ni les attentes
métier, et ne connaît pas les Page Objects. On le relit ligne à ligne et on le range à l'étape 6. Le dossier `exports/` est ignoré par
git. `just explore-close webapp` ferme une session de la voie A (elle s'arrête d'elle-même après 30 minutes d'inactivité) ; une session
de la voie B se termine par `resume` ou `close`.

## Étape 6 — Ranger dans les 3 niveaux

1. **Locators** — `src/pages/locators/<page>.locators.ts` : les chaînes de la colonne « À écrire ». Existent déjà :
   `suivi-demarches.locators.ts`, `notifications.locators.ts`.
2. **Page Objects** — `src/pages/<page>.page.ts` : des actions métier, aucun sélecteur. Existent : `SuiviDemarchesPage`
   (`waitForDemarche`, `assertVisibleDemarcheWith`, `ouvreDemarche`), `NotificationsPage` (`assertNotificationReceived`,
   `getTopNotificationTitle`), `HomePage` (`ouvreSuivi`). **À créer** : une assertion d'**absence** (« la démarche X n'est pas
   dans la liste »), qui n'existe pas dans `SuiviDemarchesPage`.
3. **Test** — `src/tests/webapp/<scenario>.test.ts`, qu'on obtient en complétant le squelette de la voie B (même `before` et `beforeEach`) : n'importe que des Page Objects et des helpers d'API (`grantConsent`,
   `publishNotification` de `src/helpers/notifications-api.ts`).

Squelette du test, **non exécuté** :

```typescript
describe('Démarches — consentement', () => {
  const user = getUser('avec_nom_dusage')
  const run = `TUTO-${Date.now()}`
  const d1 = `${run}-D1`, d2 = `${run}-D2`

  before(async function () {                                   // `before` standard : cf. squelette-exploration.test.ts
    this.timeout(180000)
    await getAppToStartingState()                               // connecte l'app et DONNE le consentement par défaut
  })
  after(async () => { await grantConsent(user.fcHash, true) })       // restaurer l'état

  it('ne montre que la démarche créée après le consentement', async () => {
    step('1. Retirer le consentement');           await grantConsent(user.fcHash, false)
    step('2. Créer D1 sans consentement');        await publish(d1, 'new', {checkConsent: false})
    step('3. Donner le consentement');            await grantConsent(user.fcHash, true)
    step('4. Créer D2');                          await publish(d2, 'new')
    step('5. Seule D2 est reçue');                await HomePage.ouvreSuivi()
                                                  await SuiviDemarchesPage.waitForDemarche(d2)
                                                  await SuiviDemarchesPage.assertAbsent(d1)   // à créer
    /* … étapes 6 à 10 sur le même modèle … */
  })
})
```

Où `publish` est un petit helper local qui appelle `publishNotification` avec `itemId`, `itemGenericStatus` et le libellé de statut
(`Brouillon`, `En cours`, `Terminé`).

## Étape 7 — Itérer, comparer attendu et observé

`just test-webapp "src/tests/webapp/<scenario>.test.ts"` (Chrome visible) ou `just test-webci …` (headless). Si le test échoue :
`just failures`, puis `just trace` ; pour figer le test à son échec et l'inspecter avec les mêmes commandes qu'à l'étape 3,
`just debug-webapp <fichier>` puis `just s debug-0-0 snapshot -i`.

### Ce que le scénario a donné sur le staging (2026-10-12, run `TUTO2-223235`)

| # | Action | Attendu | Observé dans **Suivi** | Observé dans **Notifications** |
|---|---|---|---|---|
| 1-2 | Consentement retiré, création de E1 | — | absente | **présente** |
| 3 | Consentement donné | — | E1 **apparaît** | — |
| 4-5 | Création de E2 | seule E2 | **E1 et E2** | **E1 et E2** |
| 6-7 | Mises à jour de E1 puis E2 | seule E2 | E1 et E2, statut « EN COURS » | 4 notifications (créations et mises à jour) |
| 8 | Consentement retiré | — | **aucune** démarche affichée | — |
| 9-10 | Fin de E1 et E2 sans consentement | rien reçu | rien affiché | **2 notifications « clôture » reçues** |

Deux écarts avec la spécification :

1. Une démarche créée sans consentement devient visible **rétroactivement** dans Suivi dès que le consentement est donné
   (`E1` aux étapes 3 à 7), alors que la spécification dit « seule D2 est reçue ».
2. Sans consentement, Notifications reçoit tout de même les événements (étapes 2 et 9), alors que la spécification dit « rien n'est
   reçu » à l'étape 10.

Ces écarts relèvent de l'étape 1, pas du code : **bug du produit, ou spécification à corriger ?** Ne pas adapter l'assertion pour
« faire passer » le test sans trancher. Si c'est un bug, le test reste fidèle à la spécification et est mis de côté avec un ticket
(`it.skip` et le numéro du ticket en commentaire) ; si la spécification change, on la corrige d'abord dans l'étape 1 puis le test.

La cause des écarts n'est pas établie : on ne sait pas si le backend filtre à l'affichage ou à l'enregistrement. Non confirmé.

## Ce qui change sur Android et iOS

| Webapp | Mobile |
|---|---|
| `just explore-webapp "/"` | `just explore-android` / `just explore-ios` (l'appareil doit tourner : `just start-android`, `just start-ios`) |
| Une seule page : le DOM de la SPA | **Deux mondes** : écrans natifs (sélecteur d'environnement, bouton FranceConnect natif) et WebView |
| `snapshot -i` lit le DOM | en Android hybride, `snapshot` lit l'arbre natif : utiliser `just webview android` pour lister le DOM de la WebView |
| Locators par rôle ARIA | WebView : mêmes locators ; natif : `accessibility id` (`~xxx`) |

Le scénario ci-dessus est identique côté API ; seules l'ouverture de l'app et la connexion changent (`getAppToStartingState`).

## Nettoyage et pièges, en bref

- **Restaurer le consentement** (`{"consent": true}`) à la fin ; vérifier : `GET consent` doit répondre `200`.
- **Données laissées sur le staging** : chaque démarche créée y reste. D'où l'identifiant unique par run.
- **Jetons dans les URL** : jamais dans un document (étape 3.3).
- **Attendre une condition, jamais un délai** : `wait --text` / `--url` plutôt que `wait 3000` (le délai n'est là que pour la
  séquence d'observation de l'étape 3.6).
- **Ne pas lancer deux runs en même temps sur le même appareil** : ports Appium (4723, 4724) et app partagés.
