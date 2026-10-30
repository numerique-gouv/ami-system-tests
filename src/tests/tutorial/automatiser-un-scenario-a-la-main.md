# Automatiser un scénario de test à la main, de la spécification au test WDIO

**Sans IA, sans LLM.** Tout se fait avec trois outils déterministes : `wdio session` (explorer et enregistrer), `curl` (l'API partenaire) et un éditeur. Le code que `wdio session` affiche est celui qu'il vient d'exécuter, pas une suggestion : c'est un enregistreur. Ne pas utiliser `browser.act()` ni `wdio-ai`.

Public : un testeur qui sait lire du TypeScript mais n'a jamais utilisé WDIO. Plateforme : la webapp (Chrome), sans émulateur ; la dernière section compare Android et iOS.

> **Statut des preuves.** Les sorties citées ont été observées le 2026-10-12 sur le staging, avec les commandes de ce tutoriel. Le déroulé avec le squelette de test mis en pause (étape 3) a été exécuté de bout en bout. Ce qui n'a pas été exécuté est marqué « non vérifié ».

## Le scénario fil rouge

Le consentement est celui de l'usager envers le partenaire (API `/api/v1/consent/{fc_hash}`). Une démarche est un événement `PUT /api/v2/event` avec des champs `item_*` ; elle s'affiche dans **Suivi**, et la notification dans **Notifications**.

Règles du produit, à connaître avant de spécifier :

- Il faut **consentir au suivi** pour recevoir des démarches (page Suivi).
- Les **notifications arrivent toujours** dans le centre de notifications, avec ou sans consentement.
- Il faut **accepter de recevoir des notifications** pour qu'elles soient notifiées par le téléphone ou par la webapp (notification système).

| # | Action | Résultat attendu (spécification) |
|---|---|---|
| 1 | Retirer le consentement | — |
| 2 | Envoyer la création de la démarche **D1** | — |
| 3 | Donner le consentement | — |
| 4 | Envoyer la création de la démarche **D2** | — |
| 5 | Observer | Suivi : D2 (D1 : voir la question 1 de l'étape 1) · Notifications : D1 et D2 |
| 6 | Envoyer une mise à jour de D1, puis de D2 | — |
| 7 | Observer | idem |
| 8 | Retirer le consentement | — |
| 9 | Envoyer la fin de D1 et de D2 | — |
| 10 | Observer | Suivi : rien · Notifications : les deux fins |

## Le déroulé en 8 étapes

| Étape | Ce qu'on fait | Outil |
|---|---|---|
| 0 | Préparer l'environnement | `just`, `../../../.env` |
| 1 | Spécifier : lever les ambiguïtés avant tout code | papier |
| 2 | Explorer l'API à la main | `curl` |
| 3 | Explorer l'app, page par page | `wdio session` sur un test mis en pause |
| 4 | Choisir un locator par élément | `find`, `snapshot`, règle de `CONTRIBUTING.md` §2 |
| 5 | Récupérer le code | sortie `→ await …`, `history` |
| 6 | Le ranger dans les 3 niveaux de Page Objects | éditeur |
| 7 | Itérer, comparer attendu et observé | `just test-webapp` |

Les étapes 3 à 5 se répètent **pour chaque page**, puis on passe à la suivante (étape 6 en continu).

---

## Étape 0 — Préparer

`../../../.env` contient les secrets du partenaire (`NOTIF_PARTNER_ID`, `NOTIF_PARTNER_SECRET`) et `WEB_APP_ACCESS_KEYS` (code d'accès du staging). Pour les `curl`, chargez-les dans **votre** terminal sans les afficher : la procédure (`$API`, `$AUTH`, `$FC`) est dans l'en-tête de [`tutorial.test.ts`](tutorial.test.ts), qui porte toutes les commandes de ce tutoriel.

### Ce qui est déjà fait pour vous

| Besoin | Déjà en place | Où |
|---|---|---|
| Code d'accès de la webapp de staging (fenêtre `window.prompt` de la SPA) | un cookie `access_key` est posé **avant** d'ouvrir la SPA, valable 7 jours ; sa valeur n'est jamais affichée | `handleAccessKeyCookie` dans le hook `before` de `wdio.webapp.conf.ts` (`src/helpers/webapp/access-code.ts`) |
| Connexion FranceConnect (eIDAS, identifiants) et onboarding (clé d'accès, zones, notifications) | automatisés, et repartent de l'état courant de l'app | `getAppToStartingState()` dans `src/pages/authenticate.process.ts` |
| Appels API (consentement, notification, démarche) | helpers | `src/helpers/partner-api/` : `checkDemarchesConsent`, `grantDemarchesConsent`, `revokeDemarchesConsent` (consentement du partenaire, passé explicitement : `PARTNER_AMI`), `publishEvent`, `publishNotification`, `publishDemarche`, `publishDemarcheEnfant` |

## Étape 1 — Spécifier

Avant d'ouvrir un navigateur, remplacer chaque mot flou par une observation vérifiable. Pour ce scénario, les règles du produit (section précédente) répondent déjà à « que veut dire *reçoit* ? ». Restent deux questions à poser au métier **avant** d'écrire le test :

1. Une démarche créée **sans** consentement doit-elle apparaître dans Suivi **après** que l'usager a consenti ? (étapes 2 → 5)
2. Que doit-il se passer d'une démarche déjà reçue quand le consentement est retiré ? (étapes 8 → 10)

Écrire ensuite les données : un **identifiant unique par exécution** (`TUTO-<heure>-D1`) pour retrouver ses démarches parmi celles des autres runs, et l'état à restaurer à la fin (consentement actif).

## Étape 2 — Explorer l'API à la main

Chaque appel renvoie un code HTTP. Les `curl` (lire, donner, retirer le consentement ; créer une notification, une démarche, une démarche enfant) sont dans les `it.skip` de [`tutorial.test.ts`](tutorial.test.ts), avec l'appel de helper équivalent.

Séquence jouée pour ce scénario : lire le consentement, le retirer, le relire, le donner, le relire, créer une démarche. Sorties observées : `200`, `200`, `404`, `200`, `200`, puis `201` pour la création.

À retenir : `event_date` doit être différente à chaque appel (le backend ignore un événement identique : `partner-api/event.ts` l'indique). Une **mise à jour** est le même appel avec le **même `item_id`** et `wip`, une **fin** avec `closed`.

Sans consentement, `GET consent` renvoie 404 et le helper `publishEvent` refuse d'envoyer : un partenaire ne communique rien d'un usager qui n'a pas consenti. Pour le scénario d'exemple ci-dessous, qui publie volontairement sans consentement, on désactive ce contrôle avec `verifyPartnerConsent: false`.

## Étape 3 — Explorer l'app, page par page

### 3.1 Démarrer : un test connecté, mis en pause

On ne part pas d'une session vierge : on part d'un test. Le squelette [`tutorial.test.ts`](tutorial.test.ts) exécute le `before` standard (cookie d'accès, connexion FranceConnect, onboarding), puis s'arrête sur `browser.debug()`, dans l'app déjà connectée. Pendant cet arrêt, une session `wdio session` nommée `debug-0-0` est ouverte sur le navigateur du test ; on la pilote depuis un second terminal, car le premier reste occupé par le test.

Le fichier est un `describe.skip`, hors des campagnes : on en fait une copie dont on retire `.skip`. Les commandes (copie, lancement, exploration) sont dans son en-tête et dans sa méthode « à compléter ».

Sortie observée au lancement (la connexion a pris 17 s ; le fichier de l'essai portait un autre nom) :

```
… INFO helper: getAppToStartingState: pas de session lisible, connexion depuis l'écran affiché
… INFO helper: getAppToStartingState: état de départ atteint, URL : https://ami-back-staging.osc-fr1.scalingo.io/
Paused in <fichier> › <titre du it>. Inspect with `wdio session -s debug-0-0 snapshot`, continue with `wdio session -s debug-0-0 resume`.
```

`npx wdio session list` liste les sessions ouvertes (`debug-0-0   wdio run (…)`). Le premier `snapshot -i` montre la barre basse `Accueil` (`e1`), `Agenda` (`e2`), `Services` (`e3`), `Suivi` (`e4`), `Plus` (`e5`) et `Voir les notifications(…)` (`e6`). Les refs **repartent de `e1`** dans chaque session : relisez toujours le snapshot avant d'agir.

À savoir :

- **Tout ce que vous faites est enregistré, sans le `before`.** `just s debug-0-0 history` ne contient que vos actions. Observé après un clic sur « Suivi » puis une attente :

  ```
  1  await $('role/button[name="Suivi"]').click()
  2  await browser.waitUntil(async () => (await browser.getUrl()).includes('followup'))
  ```

- **`resume` termine le test** (observé : « 1 passing »), `close` le fait échouer à la place. Dans les deux cas la session disparaît.
- **La durée de la pause n'est pas limitée en pratique.** Une pause de plus de 2 minutes (« 1 passing (2m 48.4s) ») est passée sans réglage de délai : `--debug=agent` porte le délai du framework à 24 h (code de `@wdio/session`).

### 3.2 Les commandes de la boucle

Les commandes de base (`snapshot -i`, `find`, `click`, `fill`, `wait`) sont listées dans la méthode « à compléter » de [`tutorial.test.ts`](tutorial.test.ts). Précisions.

**`snapshot`** affiche l'arbre d'accessibilité de la page : une ligne par élément, avec sa ref (`button "Suivi" [ref=e4]`). Ses options :

| Option | Effet |
|---|---|
| `-i`, `--interactive` | seulement les éléments interactifs (boutons, liens, champs) : le premier coup d'œil habituel |
| `--all` | inclut les éléments cachés |
| `--compact` | retire les nœuds sans nom ni contenu |
| `-u`, `--urls` | ajoute la cible (`href`) des liens |
| `--scope <ref ou sélecteur>` | ne décrit que cette partie de la page |
| `--depth <n>` | profondeur maximale de l'arbre |
| `--boxes` | ajoute la position et la taille de chaque élément |
| `--max-chars <n>`, `--offset <ligne>` | une sortie longue s'imprime par morceaux de 8000 caractères par défaut ; `--offset` donne la suite |
| `--file-only` | écrit le fichier sans rien imprimer (chaque snapshot est de toute façon écrit dans le dossier d'artefacts) |

**`find "texte"`** n'imprime que la partie de la page qui correspond (utile : la page Suivi compte 257 éléments), et la fait défiler jusqu'à l'élément.

**`wait`** suspend la commande suivante jusqu'à ce qu'une condition soit vraie, et échoue (code retour 1) si elle ne l'est pas au bout de `--limit` millisecondes (10 000 par défaut). Conditions : `wait --text "…"` (ce texte est affiché dans la page), `wait --url …` (l'URL contient cette valeur), `wait eN` (l'élément est visible ; `--state hidden`, `enabled` ou `disabled` attendent un autre état), `wait --load networkidle` (le chargement est terminé), `wait --fn "<expression JavaScript>"` (l'expression devient vraie). À placer après toute action qui change de page ou attend une réponse du serveur, **avant de relire la page** : une SPA change de page de façon asynchrone, donc juste après un `click` la page n'a souvent pas encore changé et le diff affiché (« No visible change on the page ») ne prouve rien. Un délai fixe (`wait 3000`) est à éviter ; au-delà de 30 secondes, il est refusé.

Trois commandes en plus : `read` (texte de la page), `screenshot`, et `exec -e "<expression>"` (vérification libre en JavaScript).

### 3.3 Accueil, puis Suivi

```bash
just s debug-0-0 snapshot -i
```

L'accueil expose la barre basse : `Accueil`, `Agenda`, `Services`, `Suivi`, `Plus`, plus `Voir les notifications(304)`.

```bash
just s debug-0-0 click e4          # « Suivi »
```

Sortie observée : `No visible change on the page.` puis, au `snapshot -i` suivant, l'URL est `…/#/followup`. Attendre (`wait --url` ou `wait --text`), puis regarder.

Sans consentement, la page Suivi montre l'état vide :

```
# Mes démarches
Suivez vos démarches administratives au même endroit !
Je veux suivre mes démarches
```

Avec des démarches, `just s debug-0-0 find "TUTO-…-D2"` donne la structure d'une carte : un `heading` de niveau 3 qui contient un `button` du titre, puis trois `paragraph` (corps, **statut**, date) :

```
- heading "Démarche TUTO-…-D2 création" [level=3]
  - button "Démarche TUTO-…-D2 création" [ref=e90]
- paragraph "corps Démarche TUTO-…-D2 création"
- paragraph "Brouillon"
- paragraph "12 octobre 2026 - 22:31"
```

### 3.4 Notifications

```bash
just s debug-0-0 navigate "https://ami-back-staging.osc-fr1.scalingo.io/#/notifications"
just s debug-0-0 wait --text "Notifications"
just s debug-0-0 find "TUTO-…"
```

Chaque notification : un `heading` de niveau 3 (titre) et un `paragraph` (corps). Il n'y a **pas** de statut de démarche ici. Les notifications arrivent dans ce centre quel que soit le consentement ; la notification système (téléphone ou webapp) suppose en plus d'avoir accepté de les recevoir.

### 3.5 Observer à répétition sans cliquer

Pour répéter une observation après chaque envoi API (étapes 5, 7, 10), la séquence qui a fonctionné :

```bash
just s debug-0-0 navigate "$API/#/followup"
just s debug-0-0 reload
just s debug-0-0 wait 6000
just s debug-0-0 find "TUTO-…"          # code retour 1 et « No match » si rien n'est affiché
```

## Étape 4 — Choisir un locator par élément

Règle du projet (`CONTRIBUTING.md` §2) : le **sens perçu par l'utilisateur**, rôle ARIA + nom accessible, avant la structure.

| Élément | Code généré par `wdio session` | À écrire dans le projet | Pourquoi |
|---|---|---|---|
| Barre basse, « Suivi » | `role/button[name="Suivi"]` | idem | déjà par rôle et nom |
| Titre d'une démarche | (aucun, `find` seulement) | `heading` niveau 3 portant le titre | stable, lisible |
| Statut d'une démarche | (aucun) | le `paragraph` qui suit le corps | à confirmer : l'ordre corps → statut → date est observé, pas garanti |

Un `data-testid` est le dernier recours : si `wdio session` en génère un, chercher d'abord un rôle et un nom. Pour vérifier un locator avant de l'adopter : `just s debug-0-0 exec -e "await $('role/button[name=\"Suivi\"]').isDisplayed()"`. Consulter aussi `src/pages/locators/suivi-demarches.locators.ts` : le projet utilise des classes DSFR (`.fr-tile__title`, `.fr-badge`), jamais des classes Svelte hashées.

## Étape 5 — Récupérer le code

Chaque commande qui agit affiche son code (`→ await …`). Pour tout récupérer d'un coup, `history` liste les actions de la session, numérotées, sans le `before` du test :

```bash
mkdir -p exports && just s debug-0-0 history > exports/mon-scenario.txt          # dossier ignoré par git
```

Observé après un clic et une attente :

```
  1  await $('role/button[name="Suivi"]').click()
  2  await browser.waitUntil(async () => (await browser.getUrl()).includes('followup'))
```

(`wdio session export` écrit les mêmes lignes sous forme d'un fichier Mocha complet, avec `import`, `describe` et `it` ; ce tutoriel n'en a pas besoin.)

C'est un **brouillon** : il garde les sélecteurs générés, n'inclut ni le `before` ni les attentes métier, et ne connaît pas les Page Objects. On le relit ligne à ligne et on le range à l'étape 6.

## Étape 6 — Ranger dans les 3 niveaux

1. **Locators** — `src/pages/locators/<page>.locators.ts` : les chaînes de la colonne « À écrire ». Existent déjà : `suivi-demarches.locators.ts`, `notifications.locators.ts`.
2. **Page Objects** — `src/pages/<page>.page.ts` : des actions métier, aucun sélecteur. Existent : `SuiviDemarchesPage` (`waitForDemarche`, `assertVisibleDemarcheWith`, `ouvreDemarche`), `NotificationsPage` (`assertNotificationReceived`, `getTopNotificationTitle`), `HomePage` (`ouvreSuivi`). **À créer** : une assertion d'**absence** (« la démarche X n'est pas dans la liste »), qui n'existe pas dans `SuiviDemarchesPage`.
3. **Test** — `src/tests/webapp/<scenario>.test.ts`, qu'on obtient en complétant le squelette (même `before` et `beforeEach`) : n'importe que des Page Objects et des helpers d'API (`grantDemarchesConsent`, `publishDemarche`… de `src/helpers/partner-api/`).

Squelette du test, **non exécuté** :

```typescript
describe('Démarches — consentement', function () {
  this.timeout(180000)                                         // le délai se pose au niveau du describe, pas dans un it/hook
  const user = getUser('avec_nom_dusage')
  const run = `TUTO-${Date.now()}`
  const d1 = `${run}-D1`, d2 = `${run}-D2`

  before(async () => {                                         // `before` standard : cf. src/tests/tutorial/tutorial.test.ts
    await getAppToStartingState()
  })
  after(async () => { await grantDemarchesConsent(PARTNER_AMI, user.fcHash) })       // restaurer l'état

  it('ne montre que la démarche créée après le consentement', async () => {
    step('1. Retirer le consentement');           await revokeDemarchesConsent(PARTNER_AMI, user.fcHash)
    step('2. Créer D1 sans consentement');        await publish(d1, 'new', {verifyPartnerConsent: false})
    step('3. Donner le consentement');            await grantDemarchesConsent(PARTNER_AMI, user.fcHash)
    step('4. Créer D2');                          await publish(d2, 'new')
    step('5. Seule D2 est reçue');                await HomePage.ouvreSuivi()
                                                  await SuiviDemarchesPage.waitForDemarche(d2)
                                                  await SuiviDemarchesPage.assertAbsent(d1)   // à créer
    /* … étapes 6 à 10 sur le même modèle … */
  })
})
```

Où `publish` est un petit helper local qui appelle `publishDemarche` avec `itemId` et `status` (`Brouillon`, `En cours`, `Terminé`).

## Étape 7 — Itérer, comparer attendu et observé

`just test-webapp --spec "src/tests/webapp/<scenario>.test.ts"` (Chrome visible) ou `just test-webci …` (headless). Si le test échoue : `just failures-text`, puis `just failures-ui` ; pour figer le test à son échec et l'inspecter avec les mêmes commandes qu'à l'étape 3, `just debug-webapp <fichier>` puis `just s debug-0-0 snapshot -i`.

### Ce que le scénario a donné sur le staging (2026-10-12, run `TUTO2-223235`)

| # | Action | Attendu | Observé dans **Suivi** | Observé dans **Notifications** |
|---|---|---|---|---|
| 1-2 | Consentement retiré, création de E1 | — | absente | **présente** |
| 3 | Consentement donné | — | E1 **apparaît** | — |
| 4-5 | Création de E2 | Suivi : E2 | **E1 et E2** | **E1 et E2** |
| 6-7 | Mises à jour de E1 puis E2 | idem | E1 et E2, statut « EN COURS » | 4 notifications (créations et mises à jour) |
| 8 | Consentement retiré | — | **aucune** démarche affichée | — |
| 9-10 | Fin de E1 et E2 sans consentement | Suivi : rien · Notifications : les deux fins | rien affiché | **2 notifications « clôture » reçues** |

Les notifications sont conformes aux règles du produit : elles arrivent toujours. Reste **un écart** avec la spécification : une démarche créée sans consentement devient visible **rétroactivement** dans Suivi dès que le consentement est donné (`E1` aux étapes 3 à 7). C'est la question 1 de l'étape 1, pas un problème de code : **bug du produit, ou spécification à corriger ?** Ne pas adapter l'assertion pour « faire passer » le test sans trancher. Si c'est un bug, le test reste fidèle à la spécification et est mis de côté avec un ticket (`it.skip` et le numéro du ticket en commentaire) ; si la spécification change, on la corrige d'abord dans l'étape 1 puis le test.

La cause n'est pas établie : on ne sait pas si le backend filtre à l'affichage ou à l'enregistrement. Non confirmé.

## Android et iOS : ce qui change, et ce qui manque sur iOS

Le scénario est identique côté API ; seuls l'accès à l'app et la connexion changent (`getAppToStartingState`). Les tests mobiles sont dans `src/tests/mobile/`. Le squelette `tutorial.test.ts` est écrit pour la webapp : son usage sur mobile n'a pas été essayé (**non vérifié**).

| | Android | iOS |
|---|---|---|
| Démarrer l'appareil | Android Studio, ou `emulator -avd <nom>` | Xcode, ou XCUITest (`IOS_UDID`) |
| Session d'exploration | `just explore-android` | `just explore-ios` (simulateur : `IOS_UDID`) |
| Test mis en pause | `npx wdio run wdio.android.conf.ts --spec <fichier> --debug=agent` | `npx wdio run wdio.ios.conf.ts --spec <fichier> --debug=agent` |
| Serveur Appium | port 4723 | port 4724 |
| Pilotes | UiAutomator2, et Chromedriver pour la WebView | XCUITest, et WebKit Remote Debugging pour la WebView |
| Locators natifs | `resource-id` | `accessibility id` |
| Locators de la WebView | rôle ARIA, identiques | rôle ARIA, identiques |
| Bouton FranceConnect | natif | dans la WebView (DOM) |
| `snapshot` dans l'app hybride | lit l'arbre natif et plante après `contexts switch` (constaté le 2026-10-08) : inspecter la WebView avec les DevTools | non vérifié dans ce dépôt |
| Arbre d'accessibilité après une redirection | rien à faire | périmé : à rafraîchir (`refreshAxTree`, via `getPageSource`) |
| Tirer pour rafraîchir | geste natif vers le bas | le geste peut être bloqué par le `UIRefreshControl` : recharger la page à la place |
| App gardée ouverte entre deux specs | **oui** (`noReset`) : spec 2 en 34 s au lieu de 118 s | **non** |
| Stabilité des campagnes | aucune mesure consignée | le test d'authentification a expiré à 120 s dans 2 runs sur 3 (suite `mobile_auth`, supprimée depuis : remplacée par `mobile_short`) |

Ce qui **manque sur iOS** (état au 2026-10-12, d'après les notes de session, pas une mesure refaite pour ce tutoriel) :

- **L'app ne reste pas ouverte entre deux specs.** L'app lancée par WDA appartient au processus XCTRunner, que le pilote tue à chaque nouvelle session : le sélecteur d'environnement revient à chaque spec et la connexion est à refaire. `simctl launch` avec `autoLaunch: false` a été essayé puis abandonné (la WebView n'est plus trouvée). Piste non essayée : un WDA persistant (`appium:webDriverAgentUrl`).
- **Blocage WebKit.** Une cible WebKit « provisoire » créée au changement de domaine n'est jamais confirmée ; les commandes restent sans réponse jusqu'au délai de 120 s. Après un timeout, le contexte se désynchronise.
- **Pas de mesure de fiabilité durable.** Les campagnes iOS ont donné 1 à 3 runs verts sur 3 selon le jour ; il faudrait au moins 5 runs sur le même code pour séparer la dégradation du simulateur d'un défaut de code.
- **`snapshot` dans l'app hybride** et le squelette de test : jamais essayés sur iOS.

## Nettoyage et pièges, en bref

- **Restaurer le consentement** (`grantDemarchesConsent`, ou `{"consent": true}` en `curl`) à la fin ; vérifier : `GET consent` doit répondre `200`.
- **Données laissées sur le staging** : chaque démarche créée y reste. D'où l'identifiant unique par run.
- **Attendre une condition, jamais un délai** : `wait --text` / `--url` plutôt que `wait 3000` (le délai n'est là que pour la séquence d'observation de l'étape 3.5).
- **Ne pas lancer deux runs en même temps sur le même appareil** : ports Appium (4723, 4724) et app partagés.
