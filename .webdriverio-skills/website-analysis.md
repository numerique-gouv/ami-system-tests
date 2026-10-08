# Analyse — AMI webapp (staging)

- **Cible** : `ami-back-staging.osc-fr1.scalingo.io` (URL dérivée de `AMI_ENV`, voir `wdio.webapp.conf.ts` / `src/helpers/environment.ts`)
- **Dates d'analyse** : webapp **2026-10-02** (reconstruction complète) puis **mise à jour ciblée du 2026-10-08** (27 routes ré-observées, accès aux zones scolaires vérifiés) ; écrans natifs Android/iOS **2026-09-08**, avec des **observations partielles du 2026-10-08** (section natif ci-dessous), le reste non ré-observé
- **Preuves utilisées** :
  - Exploration live headless de la webapp de staging, compte de test `avec_nom_dusage` (« Pierre DUBOIS », données fixture `yopmail.com`), via un script WDIO jetable (`getAppToStartingState()` puis navigation par hash et clics sur les boutons non mutants, supprimé après usage). Captures dans `.wdio-logs/webapp-explore/` (non versionné). Les URLs enregistrées sont purgées de leur query string (`id_token`/`user_data`) — ne jamais les persister.
  - Code source lu en lecture seule dans `../ami-notifications-api/public/mobile-app` (dépôt frère, HEAD `2ac75804` du 2026-09-22 ; 38 commits sur `src/routes` depuis le 2026-09-08)
  - **2026-10-08** : relevé live de 27 routes (script WDIO jetable : `getAppToStartingState()` puis `browser.url` par route, structure seulement), vérification des deux accès aux zones scolaires (agenda et préférences), snapshot d'un test en pause (`wdio run --debug=agent`) sur staging. **Le code de la SPA n'a pas été relu** : le dépôt frère local est au commit `2ac75804` (2026-09-24, identique à `origin/main` local) et ne contient pas la route `preferences/zones` que staging sert aujourd'hui — il est plus ancien que ce qui est déployé (un `git fetch` suffirait à le vérifier, non fait). Seules les captures live font foi pour les changements du 2026-10-08.
  - Code de test existant (`src/pages/*.page.ts`, `src/tests/mobile/*.test.ts`)

Toute affirmation est reliée à une capture live (2026-10-02) ou à un chemin de fichier exact. Ce qui n'a pas été observé est marqué **non confirmé**.

## Vue d'ensemble

AMI est l'application (SPA SvelteKit + coques natives Android/iOS) du ministère des Armées destinée aux militaires et leurs proches. Authentification via FranceConnect (eIDAS, mire de démonstration FCP-LOW en staging). La même SPA (`@sveltejs/adapter-static`) est servie en **navigateur** (hash routing `/#/...`) et en **WebView** Android/iOS.

La SPA navigue **exclusivement par `<button>`** : aucun `<a href="#/...">` n'a été trouvé sur les pages explorées (0 lien interne sur toutes les routes), la navigation passe par `AMIGoto()` côté code. Conséquence pour les tests : cibler `tl().getByRole('button', {name})`, pas `getByRole('link')`.

## Section map (niveau 1) — navigation principale

Barre basse, 5 `<button>` sur toutes les pages d'onglet (capture live 2026-10-02) :

| Section | Route (hash) | Fichier SPA |
|---|---|---|
| Accueil | `/` | `src/routes/+page.svelte` |
| Agenda | `/agenda` | `src/routes/agenda/+page.svelte` |
| Services | `/services` | `src/routes/services/+page.svelte` |
| Suivi | `/followup` | `src/routes/followup/+page.svelte` |
| Plus | *(dialogue modal « La suite de la navigation », pas une route)* | — |

Menu **Plus** (6 entrées, était 4 le 2026-09-08) — chaque entrée navigue (vérifié live) :

| Entrée | Destination |
|---|---|
| Mon profil | `/profile` |
| Préférences | `/preferences` |
| Aide et contact | `/help-center` (**nouveau**) |
| Données personnelles et sécurité | `/page/donnees-personnelles` (**nouveau**) |
| Accessibilité | `/page/accessibilite` (**nouveau**) |
| Me déconnecter | non exercé dans cette passe (couvert par `profile_deletion_at_logout.test.ts`) |

Les pages sans onglet (profil, préférences, aide, contact, notifications, archivés, pages légales, formulaires d'édition) ont un bouton « Retour à la page précédente » et pas de barre basse.

## Content sequences par section (niveau 2)

### Accueil (`/`)
1. Salutation « Bonjour {prénom} » + date, rendue en `<h1 class="fr-ellipsis fr-h5 …">` (était `<p>` le 2026-09-08 ; sentinelle `HomePage.probeWelcomeText()`)
2. Cloche « Voir les notifications(N) » → `/notifications`
3. **Carrousel** (nouveau, Splide : une seule carte accessible à la fois, les autres `aria-hidden` hors écran — « Diapositive suivante » pour atteindre OTV) : cartes « Renseignez votre adresse » (→ `/edit-address`) et « Opération Tranquillité Vacances » (→ `/services/service/psl/OperationTranquilliteVacances`), contrôles « Diapositive suivante », « Aller à la diapositive N »
4. « Mon agenda » : aperçu du prochain évènement ; « Voir tous mes évènements » → `/agenda` ; le bouton « Ouvrir la modale liée à l'élément de l'agenda » ouvre un dialogue (`data-testid="item-modal"`, fermé par « Fermer la modale ») avec l'action **Supprimer** dont le **nom accessible est « Cacher l'élément de l'agenda »** (aria-label ≠ texte visible)
5. « Mes démarches » : dernière démarche ; « Voir toutes mes démarches » → `/followup` ; le bouton « Ouvrir la modale liée à l'élément du suivi » ouvre un dialogue avec l'action **Archiver** ; cliquer le titre → `/followup/item/{partner}/{type}/{id}`

### Agenda (`/agenda`)
Liste « Prochainement » puis « Les mois suivants », groupée par mois : vacances scolaires et jours fériés (« VACANCES ET JOURS FÉRIÉS », dates). Bouton **Préférences** → **page** `/preferences/zones` (« Zones scolaires ») : **ce n'est plus un dialogue** (vérifié live le 2026-10-08 : URL `#/preferences/zones`, 0 dialogue ouvert ; « Retour à la page précédente » ramène à `/agenda`). Voir « Zones scolaires » ci-dessous. Chaque évènement ouvre un dialogue avec l'action **Supprimer**.

### Services (`/services`) — 2 onglets (`role=tab`) ; les entrées des listes se rendent après les titres de section (chargement API)
- **Trouver de l'aide** : « SOS, j'ai un problème ! » (Je suis victime de cybermalveillance → `/procedure-17cyber` ; Signaler une violence conjugale, sexuelle ou sexiste → www.service-public.gouv.fr/cmi ; Test WebView AMI → demarche.numerique.gouv.fr/commencer/…) ; « J'ai besoin d'aide sur un autre sujet » → service-public.gouv.fr/contact/accueil ; « Comment faire si … ? » = 5 **checklists** (Je crée une association `F3109`, Je deviens parent `F16225`, Je pars vivre à l'étranger `F2485`, Je souhaite accompagner mon enfant de 15 à 18 ans `F39617`, Je suis affecté à l'étranger `CNMSS001`) → `/checklist/{id}` ; « Accéder à l'annuaire » → lannuaire.service-public.gouv.fr
- **Démarches et outils** : cartes partenaires (APIAS, Changement de situation familiale (CNMSS), Contacter l'équipe AMI, Déclaration de changement d'adresse (Dila), PMI DROM-COM, Rattachement des enfants mineurs, Recensement citoyen, Limite de déclaration d'impôts (DGFIP), Opération Tranquillité Vacances, Rendez-vous (rdv.anct.gouv.fr), Test SP, Test WebView SP, « Voir toutes les démarches »). Chaque carte quitte la SPA (navigation d'onglet vers demarche.numerique.gouv.fr/commencer/…, service-public.gouv.fr/…, rdv.anct.gouv.fr), **y compris « Opération Tranquillité Vacances »** depuis cet onglet ; la fiche interne `/services/service/psl/OperationTranquilliteVacances` (« Bénéficier de ce service ») n'est atteinte que par le carrousel de l'accueil (ou par sa route) ; **destination de « Déclaration de changement d'adresse » et de « Bénéficier de ce service » non confirmée** (le contexte WebDriver a été perdu au clic, navigation externe probable).

### Checklist (`/checklist/{id}` → `/checklist/{id}/checks/{section}/`)
`/checklist/{id}` liste les sections (« Cas général 0/7 », « Avant mon départ 0/10 »…, compteur fait/total) ; une section ouvre `/checklist/{id}/checks/{slug}/` avec une case à cocher `checkboxes-small-{hash}` par action. La route d'item `…/item/{id}` existe dans le code, non observée.

### Suivi (`/followup`) et détail
Liste « Mes démarches » : titre, libellé libre, badge de statut, horodatage. Bouton « Sous-menu » (rôle **non confirmé**, aucun dialogue observé). Détail (`/followup/item/{partner}/{type}/{id}`) : badge de statut, titre, partenaire (« AMI »), « référence dossier », « Accéder à ma démarche » (lien externe, vers `demarches/{id}/vN` en staging), « Messages : » = historique chronologique (cycle `new → wip → closed` du test `demarches.test.ts`).

### Démarches archivées (`/followup/archived`, nouveau)
« Démarches archivées » + encart accordéon fermé « Votre démarche n'apparaît pas ? » (à déplier) listant les partenaires suivis (AMI, Démarche Numérique, RDV Service Public, Service Public, Test, Tets partenaire) et « Je veux suivre mes démarches ». Le chemin d'accès depuis le Suivi est **non confirmé** (l'action « Archiver » du dialogue d'une démarche est la piste, non exercée car mutante).

### Notifications (`/notifications`)
Liste : titre, corps, âge relatif (« 10j »), badge « Non lu »/« Lu ». « Gérer » (nom accessible **« Gérer les notifications »**, aria-label) → `/preferences/notifications`. Une notification liée à une démarche → détail `/followup/item/…` ; une notification simple reste sur l'inbox. Une notification d'accueil « Bienvenue sur AMI 👋 » est présente.

### Profil (`/profile`) et édition
3 blocs, structure inchangée : Mon identité (nom, naissance, « Informations fournies par FranceConnect », Modifier → `/edit-preferred-username`), Contact (email, Modifier → `/edit-email`), Mon adresse (« Définir une adresse » quand vide → `/edit-address`). Formulaires d'édition (ouverts, **non soumis**) : champ unique (`input`/`address-input`), bandeau « Modification non transmise », boutons Masquer le message / Annuler / Enregistrer.

### Préférences (`/preferences`)
3 entrées : **Suivi des démarches** → `/preferences/consents` (« Tout suivre » + une case à cocher par partenaire `dinum-ami`, `dinum-dn`, `dinum-rdvsp`, `psl`, `Test`, `test-test`) ; **Notifications** → `/preferences/notifications` (une case `notification-toggle` « Recevoir les notifications sur mon appareil mobile ») ; **Zones scolaires** → page `/preferences/zones` (**vérifié live le 2026-10-08** ; le modèle du 2026-10-02 disait « dialogue »). « Fermer » ramène à `/preferences`.

### Zones scolaires (`/preferences/zones`, page, constatée le 2026-10-08)
Atteinte depuis Agenda › **Préférences** et Préférences › **Zones scolaires**. Titre « Zones scolaires », boutons « Retour à la page précédente », « Ajouter des communes » (champ `city-input` de `/welcome/zones`), et « Fermer » ; 13 cases : Zone A, Zone B, Zone C, Corse, Guadeloupe, Guyane, Martinique, Mayotte, Nouvelle Calédonie, Polynésie, Réunion, Saint Pierre et Miquelon, Wallis et Futuna (A/B/C/Corse cochées sur le compte de test). Même contenu que `/welcome/zones` (qui garde « Passer » et pas de « Retour »). **Retour depuis l'accès Agenda** : « Retour à la page précédente » → `/agenda` (vérifié) ; le comportement de « Fermer » depuis l'Agenda est **non confirmé** (vérifié seulement depuis les Préférences : → `/preferences`).

### Aide et contact
- `/help-center` : « J'ai besoin de l'aide de l'administration » → service-public.gouv.fr/contact/accueil ; « Je rencontre un problème sur l'application » → `/contact`
- `/contact` : « Contacter notre équipe » ouvre un dialogue : « Faire une demande en ligne » (→ demarche.numerique.gouv.fr/commencer/retour-ami, même onglet) et « Envoyer un mail » (comportement **non confirmé**, probablement `mailto:`)

### Pages légales (nouveau)
`/page/donnees-personnelles` (6 sections : Qui traite vos données ?, Finalité et base légale, Catégories de données et durée de conservation, Qui sont les destinataires, Quels sont vos droits, Transfert hors UE) et `/page/accessibilite` (Déclaration d'accessibilité, Retour d'information et contact, Voies de recours). Chaque section est un bouton ; la route de section `/page/{slug}/{section}` existe dans le code, non ouverte (**non confirmé**).

### Parcours d'accueil (`/welcome/*`, nouveau dans le flux de connexion)
Après FranceConnect, la SPA redirige vers `/#/welcome/zones` (« Zones scolaires », bouton **Passer**) puis `/#/welcome/notifications` (« Activez les notifications pour suivre vos démarches », « Activer » / « Peut-être plus tard »). Preuve : redirection `#/welcome/zones` observée en live juste après login (2026-10-02) et ``AMIGoto(`/${passKeyParam}#/welcome/zones`)`` dans la SPA. `/notifications-welcome-page` redirige vers `/welcome/notifications`. L'écran zones n'était pas géré par `authenticate.process.ts` : géré depuis le 2026-10-02 par `OnboardingZonesPage` (voir diff). Fréquence : `user_first_login=true` est posé par le backend — observé une fois sur ~8 logins ; lien avec la suppression des données au logout (modale « Suppression de vos données ») **non confirmé**.

### Pages d'erreur (`/network-error`, `/technical-error`, `/forbidden`)
Pages statiques : « Problème de connexion Internet » / « Petit problème de notre côté… » (bouton Retour) / « L'application n'est pas ouverte au public ». Une route inexistante affiche, sous le titre « Petit problème de notre côté... » (même page que `/technical-error`), le texte « Erreur 404 - Not Found » avec « Retour » (vérifié live le 2026-10-08 ; le titre n'était pas relevé le 2026-10-02).

### Pages de prototype (`/step`, `/step-form`, `/procedure-17cyber`)
`/step` (« Je deviens parent », cartes « Pendant la grossesse »…) et `/step-form` (formulaire 1/6, « Quelle est votre situation ? ») sont atteignables par URL mais leurs liens mènent à des 404 (`#/checklist`, `#/2`, `#/3`) et aucun bouton de l'app n'y mène : **prototype probable, non confirmé**. `/procedure-17cyber` est la cible du bouton « Je suis victime de cybermalveillance » mais se rend vide en direct : redirection externe probable, **non confirmé**.

### Authentification FranceConnect
Séquence applicative (code `src/pages/franceconnect/*.page.ts`, `authenticate.process.ts`) : bouton FranceConnect → eIDAS faible → mire FCP-LOW (identifiant/mot de passe) → [proposition de clé d'accès, conditionnée par feature flag] → **`/welcome/zones` → `/welcome/notifications`** → Accueil. En webapp, l'authenticateur virtuel WebAuthn et le cookie `access_key` sont posés par `wdio.webapp.conf.ts`. Routes OIDC : `/login`, `/login-callback`, `/relogin`, `/silent-login`, `/passkey-authentication`.

## Composants transverses (webapp)

| Module | Fichier | Rôle |
|---|---|---|
| Store utilisateur | `src/lib/state/User.svelte.ts` | état de connexion, gate de navigation |
| Auth HTTP | `src/lib/auth.ts` | `logout()`, `apiFetch()` (redirection 401) |
| Statuts démarche | `src/lib/followup.ts` | `Status = 'new' | 'wip' | 'closed'` |
| Dialogues d'élément | composants Svelte (agenda/suivi) | bouton « Ouvrir la modale liée à l'élément … » → dialogue avec action Supprimer (agenda) / Archiver (suivi) |

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

### Observations partielles du 2026-10-08 (natif, non exhaustives)

- **Android** (`Pixel_modern`, build staging, via `wdio session` et journaux de campagne) : la tuile du sélecteur d'environnement est une `android.view.View` **cliquable** (`clickable=true`, bounds `[21,319][1059,603]`) qui contient **deux** `TextView` de même texte « Staging » (titre et sous-titre) ; `getText()` du conteneur renvoie le titre. Dans les journaux de run, le bouton FranceConnect natif est tapé puis la **page de connexion de la SPA** demande un 2ᵉ tap (déjà documenté comme anomalie ; cause non établie).
- **iOS** (`iPhone 17 Pro`, iOS 27.0) : la tuile « Staging » est un `XCUIElementTypeButton` `label="Staging, Staging"` contenant deux `StaticText` « Staging ». **L'arbre d'accessibilité natif expose aussi le contenu de la WebView** (barre « Accueil/Agenda/…», « Bonjour Pierre », boutons du menu Plus) — vérifié sur l'accueil connecté. **La feuille d'onboarding des notifications existe deux fois** dans cet arbre : la feuille SwiftUI (au premier plan, « Fermer » en haut à droite) et la page de la SPA `/#/welcome/notifications` derrière elle, avec deux boutons « Peut-être plus tard » de même libellé (y=606 sous un `XCUIElementTypeWebView`, y=649 hors WebView), sans identifiant d'accessibilité (aucun `accessibilityIdentifier` dans `ami-app-ios`, et `data-testid="skip-button"` de la SPA n'est pas exposé nativement).
- **iOS, fin de session FranceConnect** : après « Me déconnecter », la WebView passe par `…/api/v2/session/end?id_token_hint=…` (page blanche « Submitting Callback », formulaire à soumission automatique `POST …/session/end/confirm`) avec la barre « ◀ AMI ». Cette page est restée sans soumission dans un run sur trois en campagne (cause non établie ; lien possible avec le blocage WebKit, **non confirmé**).

Non couvert par cette exploration : `Presentation/Settings/SettingsView.swift`, `Presentation/Partner/PartnerView.swift`, gestion APNs (`Services/NotificationManager/*`) — pas de point d'entrée simple dans le flow de démarrage pour les atteindre sans naviguer plus loin dans l'app authentifiée.


## Inventaire des composants (niveau composant)

| Composant | Localisation | But | États observés | Dépendances |
|---|---|---|---|---|
| Barre de navigation basse | pages d'onglet | navigation principale (5 `<button>`) | actif/inactif | — |
| Menu « Plus » | dialogue modal global (`dialog#modal-main-nav-plus-…`, DSFR) | accès profil/préférences/aide/pages légales/déconnexion | ouvert/fermé ; reste parfois ouvert après login (cf. `HomePage.closeOpenNavPlusMenu`) | — |
| Carrousel d'accueil | Accueil | raccourcis (adresse, OTV) | slide 1..N | données profil (adresse vide → carte « Renseignez votre adresse ») |
| Dialogue d'élément | Accueil, Agenda, Suivi | actions Supprimer / Archiver | ouvert/fermé | — |
| Carte démarche (liste) | Accueil, Suivi | résumé d'une démarche | `TERMINÉ` ; `Brouillon`/`En cours` par `demarches.test.ts` | API partenaire |
| Timeline de démarche | Suivi > détail | historique des mises à jour | liste chronologique | idem |
| Liste inbox | Notifications | notifications in-app | Lu / Non lu | API notifications + WebSocket |
| Cases de consentement | Préférences > Suivi des démarches | suivre/ne plus suivre un partenaire | coché/décoché (AMI coché après `grantConsent`) | API consentement |
| Sélecteur de zones scolaires | page `/preferences/zones` (depuis Agenda et Préférences, **plus un dialogue depuis le 2026-10-08**), `/welcome/zones` | filtrer l'agenda | cases cochées par défaut A/B/C/Corse | — |
| Checklist | `/checklist/*` | suivi d'actions par section | compteur `0/N`, cases | contenu éditorial |
| Formulaires d'édition | `/edit-*` | modifier nom d'usage / email / adresse | vide ; adresse = autocomplétion BAN | API profil |

## Matrice d'importance des fonctionnalités

Importances **non confirmées** par le produit (déduites du code et des tests existants).

| Fonctionnalité | Importance | Couverture webapp avant ce travail |
|---|---|---|
| Authentification FranceConnect + parcours d'accueil (zones, notifications) | **high** | aucune (dossier `src/tests/webapp` vide) |
| Suivi des démarches (cycle new/wip/closed, détail, historique) | **high** | aucune |
| Notifications in-app (réception, ouverture, Gérer) | **high** | aucune |
| Navigation principale + menu Plus | **high** (porte d'entrée de tout) | aucune |
| Profil usager (affichage, édition) | **medium** | aucune |
| Services (onglets, checklists, liens partenaires) | **medium** | aucune |
| Préférences (consentements, notifications, zones) | **medium** | aucune |
| Aide et contact, pages légales | **medium** (obligations légales/accessibilité) | aucune |
| Agenda (liste, zones scolaires) | **low/medium** | aucune |
| Pages d'erreur statiques | **low** | aucune |
| Pages de prototype (`/step*`) | **low** (non confirmé) | aucune |

## Diff vs baseline 2026-10-02 (mise à jour du 2026-10-08)

| Impact | Changement | Preuve |
|---|---|---|
| **significant** | **Agenda › « Préférences » ouvre la page `/preferences/zones`, plus un dialogue « Zones scolaires »**. Même destination depuis Préférences › « Zones scolaires ». « Retour à la page précédente » ramène à `/agenda`, « Fermer » (depuis Préférences) à `/preferences`. Casse `AgendaPage.openZonePreferences()` / `closeZonePreferences()` (`clickButtonInDialog`) et le test webapp « Agenda › Préférences ouvre le sélecteur des 13 zones scolaires » (échec 3/3 depuis le 2026-10-08, cause établie en pause `--debug=agent`) | capture live 2026-10-08 (URL `#/preferences/zones`, 0 dialogue ouvert, snapshot du test en pause) |
| **minor** | Une route inexistante affiche le titre « Petit problème de notre côté... » avec « Erreur 404 - Not Found » (même page que `/technical-error`) | capture live 2026-10-08 |
| **minor** | `/procedure-17cyber` : contenu rendu dans un **iframe** (« Widget pour réaliser un Cyber diagnostic », service 17Cyber) ; invisible à `innerText` (le relevé le donnait « vide ») | capture live 2026-10-08 |
| inchangé | Les 27 routes relevées (accueil, agenda, services, suivi + archivés, notifications, profil + 3 éditions, préférences + 3 sous-pages, aide et contact, 2 pages légales, 2 pages d'accueil, 3 pages d'erreur, 3 pages de prototype) ont les mêmes titres et les mêmes boutons que le modèle du 2026-10-02 ; menu Plus à 6 entrées | relevé live 2026-10-08 |

Limite : ce diff ne couvre que les routes **déjà connues** ; une route nouvelle n'est détectable ni par ce relevé ni par le code local (en retard sur staging).

## Diff vs baseline 2026-09-08 (historique)

| Impact | Changement | Preuve |
|---|---|---|
| **breaking** | La salutation « Bonjour {prénom} » est un `<h1>` et non plus un `<p>` : les sentinelles `HomePage.probeWelcomeText` et `probeFranceConnectWebScreen` (`querySelectorAll('p')`) ne reconnaissent plus l'accueil, `getAppToStartingState()` échoue à chaque run (« dernier écran détecté : login ») alors que l'accueil est affiché. **Corrigé le 2026-10-02** (`h1, p`). | capture DOM : `<h1 class="fr-ellipsis fr-h5 fr-mb-1w">Bonjour Pierre</h1>` ; logs de run |
| **significant** | Nouvel écran `/welcome/zones` après une première connexion, non géré (bloquait `getAppToStartingState()`). **Géré depuis le 2026-10-02** par `OnboardingZonesPage` + `OnboardingNotificationsPage` (branche webapp). | log de run (URL `#/welcome/zones`) ; ``AMIGoto(`/${passKeyParam}#/welcome/zones`)`` |
| **significant** | Menu Plus : 6 entrées au lieu de 4 (Aide et contact, Données personnelles et sécurité, Accessibilité ajoutées ; « Contact » remplacé par « Aide et contact » → `/help-center` → `/contact`) | capture live |
| **significant** | Nouvelles routes : `/followup/archived`, `/help-center`, `/page/{slug}[/{section}]`, `/preferences/notifications`, `/welcome/*`, `/checklist/*`, `/step*` | `find src/routes` + captures |
| **significant** | Services : l'onglet « Trouver de l'aide » contient désormais 5 checklists éditoriales | capture live |
| **significant** | Accueil : carrousel (adresse / OTV) et dialogues Supprimer/Archiver | capture live |
| **minor** | « Préférences > Notifications » n'est plus « non confirmé » : une case `notification-toggle` | capture live |
| **minor** | Le bloc « Mon agenda » de l'accueil affiche bien un évènement (le « vide » vu en Android natif le 2026-09-08 reste inexpliqué) | capture live |

## Implications pour les tests (couverture prioritaire)

- (Fait le 2026-10-02) sentinelle de l'accueil `h1, p` et gestion de `/welcome/zones` + `/welcome/notifications` dans le flux d'authentification ; sans cela aucun test authentifié ne démarrait.
- Écrire un scénario webapp par section du plan ci-dessus (voir `src/tests/webapp/`).
- Les liens sortants (`demarche.numerique.gouv.fr`, `service-public.gouv.fr`…) sortent de la SPA : tester la **présence** des entrées, pas la disponibilité des sites tiers.
- Les actions mutantes (Supprimer, Archiver, Enregistrer, Tout suivre, Activer, Me déconnecter) ne sont exercées qu'avec restauration d'état (cf. CONTRIBUTING §6).

## Non confirmé / zones d'ombre

- Rôle du bouton « Sous-menu » du Suivi ; chemin d'accès à `/followup/archived` ; effet réel de « Archiver » et « Supprimer » (non exercés, mutants).
- Destination de « Déclaration de changement d'adresse » (Dila), de « Bénéficier de ce service » (OTV) et de `/procedure-17cyber` (navigation externe, contexte perdu).
- Comportement de « Envoyer un mail » (contact).
- Routes `/checklist/{id}/checks/{section}/item/{item}` et `/page/{slug}/{section}` : existent dans le code, non ouvertes.
- `/step`, `/step-form` : prototypes ? (liens vers des 404).
- Relation entre le consentement API (`checkConsent`/`grantConsent`) et les cases « Suivre mes démarches {partenaire} » (la case AMI est cochée après `grantConsent`, ce qui suggère un lien — non prouvé).
- Fréquence de `/welcome/zones` (`user_first_login=true`) : une occurrence observée, cause non vérifiée.
- Écran vide vs rempli du bloc « Mon agenda » en Android natif (2026-09-08).
- Toutes les zones d'ombre natives Android/iOS de la section ci-dessus (non ré-observées, hors les observations partielles du 2026-10-08).
- Comportement de « Fermer » sur `/preferences/zones` quand on y arrive depuis l'Agenda (vérifié seulement depuis les Préférences).
- Date du déploiement de staging qui a remplacé le dialogue de zones par une page : le test passait lors de la passe webapp complète de 14h13 (heure locale, 2026-10-08) et échoue lors de celle de 17h47 ; **non établie plus précisément** (pas d'historique de déploiement consulté).
- Contenu du code de la SPA déployée : non relu (dépôt frère local en retard, cf. « Preuves utilisées »).
