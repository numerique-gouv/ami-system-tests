# Diff — webapp AMI staging (baseline 2026-09-08 → courant 2026-10-02)

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
