# Analyse — AMI webapp (staging)

- **Cible** : `ami-back-staging.osc-fr1.scalingo.io` (URL dérivée de `AMI_ENV`, voir `wdio.webapp.conf.ts` / `src/helpers/environment.ts`)
- **Date d'analyse** : 2026-09-08 (webapp + code), complété le 2026-09-08 (écrans natifs Android **et iOS**, live via Appium)
- **Preuves utilisées** :
  - Exploration live du site en Chrome (session déjà authentifiée dans le navigateur — compte de test "Pierre DUBOIS", données fixture `yopmail.com`)
  - Exploration live des écrans **natifs Android et iOS** via des scripts WDIO/Appium temporaires et jetables (supprimés après usage), captures dans `.wdio-logs/native-screens-{android,ios}/` (non versionné)
  - Code source lu en lecture seule dans les dépôts frères :
    - `../ami-notifications-api/public/mobile-app` (SvelteKit — la SPA servie en navigateur ET en WebView)
    - `../ami-app-android/`
    - `../ami-app-ios/`
  - Code de test existant dans ce dépôt (`src/pages/*.page.ts`, `src/tests/mobile/*.test.ts`)

Toute affirmation ci-dessous est reliée soit à une capture live, soit à un chemin de fichier exact. Les zones non vérifiées sont marquées **non confirmé**.

## Vue d'ensemble

AMI est l'application (SPA Svelte + coques natives Android/iOS) du ministère des Armées destinée aux militaires et leurs proches (services "PMI", "CNMSS", "Départment soins et suivi du blessé et du pensionné" observés dans Services > Démarches et outils). Authentification via FranceConnect (eIDAS). La même SPA (SvelteKit, `@sveltejs/adapter-static`) est servie :
- en **navigateur** (webapp de staging, testée ici) à la racine `/`, navigation en **hash routing** (`/#/...`)
- en **WebView** dans les apps Android (Chromedriver) et iOS (WebKit remote debugging) — cf. `ami-app-android/`, `ami-app-ios/`

## Section map (niveau 1) — navigation principale

Barre de navigation basse, présente sur tout l'app, 5 entrées (capture live) :

| Section | Route (hash) | Fichier SPA source |
|---|---|---|
| Accueil | `/` | `src/routes/+page.svelte` |
| Agenda | `/#/agenda` | non détaillé (route existe, non lue en profondeur) |
| Services | `/#/services` | `src/routes/services/**` |
| Suivi | `/#/followup` | `src/routes/followup/**` |
| Plus | *(modale, pas une route)* | — |

"Plus" ouvre une **modale** (pas de navigation d'URL) avec 4 entrées observées live : Mon profil, Préférences, Contact, Me déconnecter — correspond à `HomePage.isMenuPlusVisible()` / menu "Plus" dans le code de test.

## Content sequences par section (niveau 2)

### Accueil (`/`)
Capture live :
1. Salutation "Bonjour {prénom}" + date du jour (texte utilisé par `HomePage.probeWelcomeText()` pour détecter l'arrivée post-login)
2. Icône cloche notifications avec badge de compte (observé : 236 — lié à l'accumulation de notifications de test, cf. section Suivi)
3. Bloc "Mon agenda" (aperçu, lien "voir plus" vers `/#/agenda`)
4. Bloc "Mes démarches" (aperçu de la dernière démarche suivie, lien vers `/#/followup`)

### Agenda (`/#/agenda`)
Capture live : liste chronologique de jours fériés/vacances scolaires groupés par mois (ex. "Vacances de la Toussaint", "Armistice 1918"). Icône réglage en haut à droite (rôle non exploré — **non confirmé**).

### Services (`/#/services`)
Capture live, 2 onglets :
- **Trouver de l'aide** : blocs "SOS, j'ai un problème !" (raccourcis : cybermalveillance, violences conjugales/sexuelles/sexistes, "Test WebView AMI"), "Comment faire si...?", lien externe vers un annuaire de services publics
- **Démarches et outils** : liste de démarches partenaires (APIAS, CNMSS "Changement de situation familiale"/"Rattachement des enfants mineurs", "Contacter l'équipe AMI", DILA "Déclaration de changement d'adresse"/"Recensement citoyen", "Opération Tranquillité Vacances")

Fichier source : `src/routes/services/+page.svelte` (+ `src/routes/services/service/[partner_id]/[item_type]/+page.svelte` pour le détail d'un service).

### Suivi (`/#/followup`)
Capture live : liste "Mes démarches", chaque entrée = titre + badge de statut (`TERMINÉ` observé) + libellé libre (ex. "Clôture E2E") + horodatage + chevron.

Ouverture d'une démarche → route `/#/followup/item/{partner_id}/{item_type}/{item_external_id}` (capturé en live : `.../item/dinum-ami/OTV/E2E-...`). Contenu :
- Badge statut + titre + partenaire ("AMI") + "référence dossier"
- Bouton "Accéder à ma démarche" (lien externe — correspond à `DemarcheDetailPage.assertLienExterne()`)
- Historique chronologique des mises à jour (chaque publication de notification liée à cette démarche apparaît comme une ligne : "Corps de la notification…", "Mise à jour…", "Clôture…")

Ceci correspond exactement au cycle `new → wip → closed` testé dans `src/tests/mobile/demarches.test.ts` : chaque `publishNotification()` avec un `itemId` donné ajoute une ligne à l'historique de cette même démarche.

Fichiers SPA : `src/routes/followup/+page.svelte`, `src/routes/followup/item/[partner_id]/[item_type]/[item_external_id]/+page.svelte`, `.../subitem/...` (sous-items — **non confirmé** en détail).

### Notifications (inbox in-app, `/#/notifications`)
Capture live : liste d'entrées avec icône par type (🚩 clôture, 👁 mise à jour, 🔔 nouvelle démarche, icône "device" pour notifications simples), titre, corps, horodatage relatif ("4h"), point rouge = non lu. Bouton "Gérer" en haut à droite → probablement `/#/preferences/notifications` (**non confirmé**, non cliqué).

Entrées observées de type "AMI-vanilla-{timestamp}" / "Test vanilla — push OS non autorisé, doit apparaître dans l'inbox" — correspond exactement au test `"reçoit une notification publiée dans l'inbox in-app"` de `src/tests/mobile/notifications.test.ts`.

Accessible depuis Accueil (icône cloche) et depuis Préférences.

### Profil (`/#/profile`, sous "Plus > Mon profil")
Capture live : 3 blocs, chacun avec un bouton "Modifier" :
- **Mon identité** — nom/prénom/nom de naissance/date et lieu de naissance, libellé "Informations fournies par FranceConnect", bouton Modifier → `/#/edit-preferred-username` (**routes confirmées côté code**, pas cliquées en live pour éviter d'altérer les données du compte de test)
- **Contact** — email, "Informations fournies par FranceConnect", Modifier → `/#/edit-email`
- **Mon adresse** — adresse postale, "Informations fournies par la Caf", Modifier → `/#/edit-address`

Correspond exactement à `ProfilePage.getIdentityBolds()/getEmailBold()/getAddressBolds()` et au scénario `src/tests/mobile/profile_deletion_at_logout.test.ts`.

### Préférences (`/#/preferences`, sous "Plus > Préférences")
Capture live, 3 entrées :
- **Suivi des démarches** (`/#/preferences/consents`) — 4 interrupteurs "Suivre mes démarches {Partenaire} sur mon appareil" pour les partenaires **Service Public**, **Démarches Numériques**, **AMI**, **Rendez-vous SP** (tous OFF sur le compte observé — relation avec le consentement API `checkConsent`/`grantConsent` de `notifications-api.ts` **non confirmée**, ce sont possiblement deux mécanismes distincts : consentement légal côté API vs. préférence d'affichage côté UI)
- **Notifications** (non ouvert en détail — **non confirmé**)
- **Zones scolaires** (non ouvert en détail — **non confirmé**, probablement lié aux zones A/B/C affichées dans l'Agenda)

### Authentification FranceConnect (non observé en live sur ce run — évidence par code + logs de test uniquement)
D'après `src/pages/franceconnect/*.page.ts` et `src/tests/mobile/authentication.test.ts` :
1. Sélecteur d'environnement de review (mobile uniquement, natif — cf. `EnvironmentPickerPage`, absent en webapp)
2. Écran de connexion FranceConnect (bouton natif sur Android/iOS natif — `fcButtonIsNative` — ou bouton DOM en webapp)
3. Sélection eIDAS (faible/substantiel)
4. Mire de démonstration FCP-LOW ("Fournisseur d'identité de démonstration - FCP-LOW", cf. `authenticate.process.ts:probeFranceConnectWebScreen`)
5. Onboarding notifications (`OnboardingNotificationsPage`)
6. Deuxième confirmation FranceConnect (consentement)
7. Arrivée sur Accueil, salutation "Bonjour {prénom}"

Côté SPA : routes `/login`, `/login-callback`, `/relogin`, `/silent-login` (`src/routes/login*/+page.svelte`) gèrent les redirections OIDC ; `src/lib/state/User.svelte.ts` gate toute route protégée (`if (!userStore.connected) AMIGoto('/#/login')`).

## Composants transverses (webapp)

| Module | Fichier | Rôle |
|---|---|---|
| Store utilisateur | `src/lib/state/User.svelte.ts` | état de connexion, gate de navigation |
| Auth HTTP | `src/lib/auth.ts` | `logout()`, `apiFetch()` avec redirection auto sur 401 |
| FranceConnect logout | `src/lib/france-connect.ts` | `franceConnectLogout()`, `parseJwt()` |
| Statuts démarche | `src/lib/followup.ts` | `type Status = 'new' \| 'wip' \| 'closed'` — confirme le mapping avec `item_generic_status` de l'API partenaire |
| Pages d'erreur dédiées | `src/routes/network-error`, `/technical-error`, `/forbidden` | pages SPA spécifiques (à ne pas confondre avec l'écran natif Android `WifiErrorScreen.kt` — deux couches d'erreur réseau distinctes, **relation non confirmée**) |

## Composants transverses (natif, hors WebView)

### Android — vérifié en live (Appium, 2026-09-08)

Séquence de démarrage capturée écran par écran via un script WDIO temporaire (émulateur `Pixel_modern`, build staging) :

| # | Écran natif | Fichier source | Preuve |
|---|---|---|---|
| 1 | **Choix de la review** (`dev/home/ReviewAppsScreen.kt`) | picker dev/staging listant "Staging" + les review apps ouvertes, peuplées dynamiquement depuis les PR GitHub d'`ami-notifications-api` (titre + description de la PR affichés tels quels) | capture live, cf. `EnvironmentPickerPage.reviewEnvironmentPicker()` |
| 2 | **Connexion FranceConnect** (`home/FranceConnexionScreen.kt`) | écran natif avec pictogramme, texte d'accroche, bouton "S'identifier avec FranceConnect", lien "Qu'est-ce que FranceConnect ?", bloc "Vous n'arrivez pas à vous connecter ? / Contactez-nous sur Tchap" | capture live, cf. `FranceConnectMirePage.tapFranceConnect()` |
| 3 | **Activez les notifications** (`settings/OnboardingNotificationScreen.kt`) | écran natif post-login, boutons "Activer" / "Peut-être plus tard" | capture live, cf. `OnboardingNotificationsPage` |

Après dismiss de l'onboarding, arrivée directe sur la home **WebView** (confirme que Home/Agenda/Services/Suivi/Plus sont bien 100% webview, aucun équivalent natif) — bloc "Mon agenda" affiché en **état vide** ("Retrouvez les temps importants de votre vie administrative ici") sur ce run, alors que la même section affichait un jour férié réel lors de l'exploration webapp — écart non expliqué, **non confirmé** (cache, timing de chargement, ou compte de test dans un état différent).

Point non couvert par cette exploration : l'écran natif d'erreur réseau (`networkManager/WifiErrorScreen.kt`) — nécessite de couper la connectivité de l'émulateur en cours de session, non tenté pour ne pas perturber une exploration par ailleurs stable. FCM (`FirebaseService`) non observable sans notification push réelle.

### iOS — vérifié en live (Appium, simulateur "iPhone 17 Pro", 2026-09-08)

Même méthode que pour Android (script WDIO/Appium temporaire, supprimé après usage). Différences structurelles confirmées par rapport à Android :

| # | Écran | Nature | Preuve |
|---|---|---|---|
| 1 | **Choix de la review** | natif SwiftUI, contenu identique à Android (liste "Staging" + review apps GitHub) | capture live |
| 2 | **Connexion FranceConnect** ("Me connecter à AMI") | **rendu WebView (SPA), pas natif** — texte différent de l'écran natif Android (pas de mention Tchap), avec une barre de navigation native minimale portant juste "◀ AMI" au-dessus | capture live — confirme le code : `fcButtonIsNative` est faux sur iOS, le bouton FranceConnect est toujours dans le DOM (`franceconnect-mire.page.ts`) |
| 3 | **Mire FCP-LOW** (identifiant/mot de passe/acr_values) | page web tierce (fournisseur d'identité de démonstration), wrappée dans le même conteneur natif "◀ AMI" | capture live |
| 4 | **Activez les notifications** | **sheet modale SwiftUI** (glisse depuis le bas, bouton "Fermer" en haut à droite) plutôt qu'un écran plein comme sur Android — même texte/boutons "Activer"/"Peut-être plus tard" | capture live, `settings/OnboardingNotificationScreen` équivalent iOS (`Presentation/Onboarding/OnboardingView.swift`) |

**Anomalie observée en live** : après `dismiss()` de l'onboarding puis le 2ᵉ appel à `tapFranceConnect()` (celui documenté comme "best effort, peut échouer" dans `franceconnect-mire.page.ts`), la capture finale montre la **sheet d'onboarding encore affichée** au lieu de la home. Le test-échantillon ne fait pas planter le scénario (cet appel est marqué `isOkToFail`), mais confirme qu'un état intermédiaire imprévu peut persister à l'écran à ce point du flow sur iOS. **Non confirmé** : lien exact avec le bug de concurrence OIDC mentionné par l'utilisateur — il peut aussi s'agir d'un artefact du script d'exploration (`dismiss()` suivi immédiatement d'un screenshot sans attente de la fin d'animation de la sheet). À creuser si le phénomène se reproduit dans les tests réels (`authentication.test.ts` sur iOS).

Point à noter (précisé par l'utilisateur, confirmé indépendamment par `docs/adr/2026-06-04-Outils-tests-E2E.md` : *"la mire FC qui revient à cause d'un bug OIDC"*) : le bug de concurrence qui fait parfois réafficher un écran FranceConnect déjà passé sur iOS est **implémenté par une autre équipe dans le flow OIDC FranceConnect lui-même** — il ne se trouve donc pas dans le code AMI (confirmé : rien trouvé dans `HomeView-SpecialPages.swift` ni les fichiers WebView explorés, ce qui est cohérent avec cette explication plutôt qu'un signe d'exploration incomplète).

Non couvert par cette exploration : `Presentation/Settings/SettingsView.swift`, `Presentation/Partner/PartnerView.swift`, gestion APNs (`Services/NotificationManager/*`) — pas de point d'entrée simple dans le flow de démarrage pour les atteindre sans naviguer plus loin dans l'app authentifiée.

## Inventaire des composants (niveau composant)

| Composant | Localisation | But | États observés | Dépendances |
|---|---|---|---|---|
| Barre de navigation basse | globale | navigation principale | actif/inactif | — |
| Carte "Mes démarches" (liste) | Suivi | résumé d'une démarche | `TERMINÉ` (autres statuts non observés en live, `Brouillon`/`En cours` confirmés par code — `demarches.test.ts`) | API partenaire (`publishNotification`) |
| Timeline de démarche | Suivi > détail | historique des mises à jour | liste chronologique, pas d'état "vide" observé | idem |
| Liste inbox notifications | `/#/notifications` | notifications in-app | lu/non lu (point rouge) | API notifications |
| Toggle consentement partenaire | Préférences > Suivi des démarches | activer/désactiver le suivi par partenaire | ON/OFF (tous OFF observés) | API consentement (relation avec `checkConsent`/`grantConsent` **non confirmée**) |
| Formulaire modification profil | Profil > Modifier (identité/email/adresse) | édition des données FranceConnect/CAF locales à l'app | non ouvert en live (**non confirmé** le détail du formulaire), confirmé par code : `ProfilePage.editPreferredUsername/editEmail/editAddress` |
| Menu "Plus" | modale globale | accès profil/préférences/contact/déconnexion | ouvert/fermé | — |

## Matrice d'importance des fonctionnalités

| Fonctionnalité | Importance | Justification |
|---|---|---|
| Authentification FranceConnect | **high** | point d'entrée obligatoire, testé comme flow critique (`AllureReporter.addSeverity('critical')` dans `authentication.test.ts`) |
| Suivi des démarches (cycle new/wip/closed) | **high** | fonctionnalité métier centrale, testée end-to-end via l'API partenaire réelle |
| Notifications in-app | **high** | canal d'information principal pour l'usager, testé explicitement |
| Profil usager (édition identité/email/adresse) | **medium** | fonctionnalité usuelle mais non transactionnelle ; erreurs actuellement instables (cf. investigation précédente sur `affiche l'adresse originale`) |
| Services (annuaire, démarches partenaires) | **medium** | navigation/orientation, pas de logique métier propre testée |
| Agenda (jours fériés/vacances) | **low** | contenu informatif statique |
| Préférences (zones scolaires, notifications) | **low/medium** (non confirmé) | non testé actuellement dans `ami-system-tests`, contenu non exploré en détail |

## Implications pour les tests (couverture prioritaire)

- Le cycle **Suivi des démarches** (new→wip→closed) et l'**inbox de notifications** sont déjà bien couverts (`demarches.test.ts`, `notifications.test.ts`) et correspondent fidèlement à l'UI observée.
- Le **Profil usager** est couvert (`profile.test.ts`, `profile_deletion_at_logout.test.ts`) mais c'est la zone qui a montré le plus d'instabilité (cf. investigation de flakiness du 2026-09-08) — la structure "3 blocs + Modifier" observée en live est cohérente avec le code, donc la flakiness est probablement temporelle/sélecteur, pas structurelle.
- **Préférences > Suivi des démarches, Notifications, Zones scolaires** ne semblent pas couvertes par la suite mobile actuelle (`src/tests/mobile/`) — écart de couverture potentiel si ces réglages sont importants métier (à confirmer avec l'équipe produit).
- Le bouton "Gérer" de l'inbox notifications n'a pas été suivi — destination non confirmée, à vérifier si une fonctionnalité de gestion des notifications doit être testée.

## Non confirmé / zones d'ombre

- Détail exact de `src/lib/ami-navigation.ts` (`AMIGoto`) côté webapp.
- Contenu détaillé des routes `/agenda`, `/checklist`, `/step`, `/step-form`, `/procedure-17cyber`, `/welcome/zones`.
- Relation exacte entre le consentement API (`checkConsent`/`grantConsent`, `notifications-api.ts`) et les toggles UI de "Préférences > Suivi des démarches" (deux mécanismes a priori distincts, non vérifié).
- ~~Mécanisme du bug de concurrence iOS~~ — **clarifié par l'utilisateur** : implémenté dans le flow OIDC FranceConnect par une équipe tierce, hors périmètre du code AMI. Ne pas chercher à le localiser dans `ami-app-ios/`.
- Distinction exacte entre la page SPA `/technical-error`/`/network-error` et l'écran natif Android `WifiErrorScreen.kt` (deux couches d'erreur réseau potentiellement redondantes ou complémentaires) — non déclenché lors de l'exploration live (nécessiterait de couper la connectivité de l'émulateur).
- Détail des formulaires d'édition profil (`/edit-address`, `/edit-email`, `/edit-preferred-username`) — non ouverts en live pour ne pas modifier les données du compte de test partagé.
- Destination du bouton "Gérer" dans l'inbox notifications.
- Écran vide vs rempli du bloc "Mon agenda" sur la home (vu vide en Android natif, vu rempli en webapp) — cause non déterminée.
- Sheet d'onboarding notifications iOS encore visible après le 2ᵉ `tapFranceConnect()` lors de l'exploration live — lien avec le bug OIDC non confirmé, possible artefact du script d'exploration (cf. section iOS ci-dessus).
- `Presentation/Settings/SettingsView.swift`, `Presentation/Partner/PartnerView.swift` et la gestion APNs iOS (`Services/NotificationManager/*`) — non atteints par l'exploration live (nécessitent une navigation plus poussée dans l'app authentifiée).
- Écran natif d'erreur réseau iOS (équivalent de `WifiErrorScreen.kt` Android, non identifié dans le code iOS lu) — non exploré.
