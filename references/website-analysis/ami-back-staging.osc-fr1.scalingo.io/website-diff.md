# Diff — webapp AMI staging

## 000. Mise à jour du 2026-10-26 (baseline 2026-10-15 → courant 2026-10-26)

Voir le tableau « Diff vs baseline 2026-10-15 » de `website-analysis.md`. Résumé : profil en hub **déployé** (breaking, `ProfilePage` adapté), lien cassé de la carte « Renseignez votre adresse » (anomalie app), nom d'usage modifié non reflété dans « Mon identité » (à valider), accordéon des archivés déplié (test corrigé), `/agenda/themes` déployé (non couvert).

---

## 00. Mise à jour du 2026-10-15 (baseline 2026-10-08 → courant 2026-10-15)

Preuves : relevé live de 34 routes (compte `avec_nom_dusage`, Chrome headless, lecture seule) ; code de la SPA lu sur `origin/main` du dépôt frère (46 commits sur `src/routes` depuis `2ac75804`). **Le code est en avance sur staging** : les changements « à venir » ci-dessous n'ont pas d'effet sur les tests tant que staging ne les déploie pas.

### significant — déployé (observé live)
- **Nouvelle route `/preferences/zones/city`** (« Rechercher une commune », champ `city-input`), atteinte par « Ajouter des communes » de `/preferences/zones` ; « Retour à la page précédente » → `/preferences/zones`. Aucun test ni locator ne la couvre (`grep` sur `src` : 0 occurrence).

### significant — à venir (code `origin/main`, **non déployé** sur staging le 2026-10-15)
- **Profil en hub** : `/profile` → `/profile/identity` et `/profile/addresses`, `edit-*` déplacés sous ces routes (`/profile/identity/edit-preferred-username`, `/profile/addresses/edit-email`, `/profile/addresses/edit-address`). Live : ces 5 routes affichent la page d'erreur ; l'ancien profil et les routes racine `/edit-*` répondent encore. Impact attendu : `ProfilePage`, `profile.test.ts`, tests mobiles de profil.
- **Agenda** : bouton vers `/agenda/themes` (« Thèmes »), évènements refondus. Live : pas de bouton, `/agenda/themes` = page d'erreur. Impact attendu : `AgendaPage`.

### minor (live)
- Consentements : 4 cases au lieu de 6 (`Test`, `test-test` absentes) ; cause non confirmée.
- Agenda : `h1` « Mon agenda », jours en `h3` `fr-sr-only`.
- `/preferences/notifications` : deux boutons « Retour à la page précédente » (`back-button`, `close-button`).

### inchangé
Accueil, Services, Suivi (+ archivés), Notifications, Préférences, Zones, Aide et contact, pages légales, checklist, OTV, `/welcome/*`, pages d'erreur.

### Tests à mettre à jour
Rien de cassé constaté. À ajouter : couverture de `/preferences/zones/city`. À reprendre au déploiement : profil et agenda (voir ci-dessus).

---

## 0. Mise à jour du 2026-10-08 (baseline 2026-10-02 → courant 2026-10-08)

- **significant** — Agenda › « Préférences » et Préférences › « Zones scolaires » mènent à la **page** `/preferences/zones` (plus un dialogue). « Retour à la page précédente » → `/agenda` ; « Fermer » (depuis Préférences) → `/preferences`. Casse `AgendaPage.openZonePreferences()` / `closeZonePreferences()` et le test « Agenda › Préférences ouvre le sélecteur des 13 zones scolaires » (3/3 en échec). Preuve : capture live, URL `#/preferences/zones`, 0 dialogue.
- **minor** — route inexistante : titre « Petit problème de notre côté... » + « Erreur 404 - Not Found » ; `/procedure-17cyber` rendu dans un iframe (17Cyber).
- **inchangé** — les 27 routes relevées ont les mêmes titres et boutons ; menu Plus à 6 entrées.
- Limite : seules les routes déjà connues sont comparées ; le code de la SPA locale est en retard sur staging.

---

# Diff — webapp AMI staging (baseline 2026-09-08 → courant 2026-10-02) — historique

## 1. Résumé
Baseline : `website-analysis.md` du 2026-09-08. Courant : reconstruction live du 2026-10-02 (compte `avec_nom_dusage`, headless) + lecture de `../ami-notifications-api/public/mobile-app` (HEAD `2ac75804`, 38 commits sur `src/routes` depuis la baseline). Les écrans natifs Android/iOS n'ont pas été ré-observés : aucun diff n'est établi pour eux.

## 2. Diff par impact

### breaking
- **Salutation « Bonjour {prénom} » : `<p>` → `<h1>`**. Les sentinelles `HomePage.probeWelcomeText` et `probeFranceConnectWebScreen` cherchaient un `<p>` : `getAppToStartingState()` échoue à chaque run (« dernier écran détecté : login ») alors que l'accueil est affiché. Tous les tests authentifiés (mobile et webapp) sont concernés avec la SPA actuelle. Corrigé le 2026-10-02 (`h1, p`). Preuve : `<h1 class="fr-ellipsis fr-h5 fr-mb-1w">Bonjour Pierre</h1>` (capture DOM).

### significant
- **`/welcome/zones` après une première connexion** : écran non géré, bloquait `getAppToStartingState()` (observé une fois). Géré depuis le 2026-10-02 par `OnboardingZonesPage` et la branche webapp d'`OnboardingNotificationsPage`. Preuve : log de run ; code SPA ``AMIGoto(`/${passKeyParam}#/welcome/zones`)``.
- Menu Plus : 4 → 6 entrées. « Contact » est remplacé par « Aide et contact » (`/help-center`, qui mène à `/contact`) ; « Données personnelles et sécurité » (`/page/donnees-personnelles`) et « Accessibilité » (`/page/accessibilite`) sont ajoutées.
- Nouvelles routes : `/followup/archived`, `/help-center`, `/page/{slug}[/{section}]`, `/preferences/notifications`, `/welcome/zones`, `/welcome/notifications`, `/checklist/*`, `/step`, `/step-form`.
- Services > Trouver de l'aide : 5 checklists éditoriales (`F3109`, `F16225`, `F2485`, `F39617`, `CNMSS001`).
- Accueil : carrousel (adresse / Opération Tranquillité Vacances) ; dialogues Supprimer (agenda) et Archiver (suivi).
- Navigation : la SPA n'expose aucun `<a href="#/...">` ; tout passe par `<button>`.

### minor
- « Préférences > Notifications » documenté : une case `notification-toggle`.
- Bloc « Mon agenda » rempli en webapp (écart avec l'Android natif du 2026-09-08 toujours inexpliqué).

## 3. Mises à jour de tests recommandées
1. (Fait) Sentinelle de l'accueil `h1, p` et gestion de `/welcome/zones` (« Passer ») puis `/welcome/notifications` (« Peut-être plus tard ») dans la séquence d'authentification.
2. Créer la couverture webapp (dossier `src/tests/webapp` vide avant ce travail) : authentification, navigation + menu Plus, accueil, agenda, services/checklists, suivi + archivés, notifications, profil, préférences, aide/contact/pages légales, pages d'erreur.
3. `ProfilePage.navigate()` repose sur un `data-testid` (`profile-button`) à re-valider sur le menu Plus actuel.
