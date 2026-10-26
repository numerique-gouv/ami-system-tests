# Campagne de stabilité du 2026-10-15

Code testé : commit `72e4fc7` (branche `77-migre-vers-wdio-10`). Staging, compte `avec_nom_dusage`. Webapp (Chrome headless), Android (émulateur `Pixel_modern`, Android 16), iOS (simulateur `iPhone 17 Pro`). 5 tours ; à chaque tour, les trois plateformes en séquence (elles partagent le compte de test, dont la déconnexion supprime des données côté serveur), chaque spec dans sa propre invocation `wdio` (deux specs mobiles lancées ensemble se gênent sur un seul appareil). Du 2026-10-14 22:03 UTC au 2026-10-15 02:53 UTC, avec une interruption (incident ci-dessous). Référence au code d'origine `c9e4f41` : iOS `notifications` et Android `login_logout_login` échouent aussi.

## Synthèse

| Plateforme | Verdict |
|---|---|
| **Webapp** | Stable : 234 passages sur 240. Deux causes d'échec seulement : « démarches archivées » 5/5 (la SPA staging a changé ; échec déjà présent au code d'origine) et « la barre basse ouvre Suivi » 1/5 (aléa sous charge, déjà vu une fois ; 3/3 en isolation). |
| **iOS** | Stable, hors deux points : `notifications` échoue 5/5 (cause établie le 2026-10-15 : le service de trace demande un cliché natif de l'inbox, qui bloque la file d'Appium ; déjà au code d'origine) ; `profile_deletion_at_logout` a dépassé son délai 1 fois sur 5 (réussi 4/5, ~1 min 12). Le reste : 5/5. |
| **Android** | Tour 1 : 6 specs sur 6 passent. Tours 2 à 5 : `login_logout_login` échoue 4/4 et `profile_deletion_at_logout` 2/4, toujours par **timeout de 120 s**. Cause établie ci-dessous. |

## Android : les échecs sont des délais trop justes, pas des assertions

- Tous les échecs Android sont « Timeout of 120000ms exceeded » : le délai Mocha global (`mochaOpts.timeout`, `wdio.base.conf.ts`).
- `login_logout_login` enchaîne **deux connexions complètes** (+ une déconnexion) dans un seul `it`, **sans `this.timeout`** : sa durée naturelle va de **65 s** (machine rapide, tour 1) à **125 s** (machine lente), donc elle chevauche la limite. `profile_deletion_at_logout` fait sa connexion dans un `before` sans `this.timeout` non plus, alors que `authentication`, `demarches` et `notifications` déclarent 180 s.
- Android a été **2,5 à 4 fois plus lent** à partir du tour 2 (démarches 1 min 12 puis 2 à 3 min ; profil 49 s puis ~3 min), et le reste après arrêt du simulateur iOS et retour de la mémoire libre à 54 % (démarches 2 min 47 ; `profile_deletion_at_logout` 4 min 52). Sur la machine, `modelmanagerd` (démon système) occupe ~96 % de CPU en permanence, et le swap était saturé à 96 % pendant la campagne (charge système jusqu'à 30).
- **Cause probable de la saturation de la machine** (constat noté le 2026-10-15 dans le commentaire d'une modification en cours de `src/driver/capabilities.ts`, `appium:isHeadless: true`, non commitée au moment de cette campagne) : chaque session iOS lance `open -Fn DeviceHub.app` sans le reconnaître déjà ouvert, d'où **30 instances de DeviceHub ouvertes après une campagne** (relevé de mon côté le même jour : 30 processus, 1,2 Go, mémoire libre redescendue à 38 % après de nouveaux runs iOS). Cela recoupe les 1,5 Go du groupe « DeviceHub » et le swap saturé mesurés pendant la campagne, donc le ralentissement d'Android.
- Ce n'est pas le code : un essai A/B sur le même émulateur (ancien contre nouvel `inWebContext`) donne des durées identiques, et iOS, qui exécute les mêmes parcours avec le même code, reste stable à vitesse constante.
- **Correction proposée** (CONTRIBUTING §7 : cause établie, récurrence mesurée) : `this.timeout(300000)` pour `login_logout_login`, et un `this.timeout(180000)` dans le `before` de `profile_deletion_at_logout`. Non appliquée.

## Incident d'infrastructure

L'émulateur Android s'est figé pendant le tour 2 (processus `qemu` à 377 % de CPU, `adb` muet, `sys.boot_completed` sans réponse). Cinq exécutions Android (22:43 à 00:25 UTC) ont consommé chacune leur délai de 20 minutes sans produire de résultat ; elles sont exclues des statistiques. Reprise après arrêt et redémarrage de l'émulateur (`just stop-android`, `just start-android`), nettoyage de quatre processus `wdio` et `adb` orphelins, et durcissement du script : contrôle de santé de l'émulateur avant chaque spec (redémarrage automatique), délai mobile ramené à 10 minutes, nettoyage après un dépassement. `android-r1-authentication` a été relancée à la reprise (cause inconnue) : son journal (réussi) remplace l'ancien (réussi aussi).

## Résultats par spec et par test (5 tours)


### android — résultat de chaque spec, par tour

| spec | tour 1 | tour 2 | tour 3 | tour 4 | tour 5 |
|---|---|---|---|---|---|
| authentication | OK (1m 42.1s) | OK (1m 21.6s) | OK (1m 43.4s) | OK (1m 39.9s) | OK (1m 54.6s) |
| demarches | OK (1m 12.4s) | OK (2m 57.7s) | OK (3m 18s) | OK (3m 13.6s) | OK (3m 5s) |
| login_logout_login | OK (1m 5.5s) | ÉCHEC (2m 5s) | ÉCHEC (2m 3s) | ÉCHEC (2m 4.7s) | ÉCHEC (2m 3.2s) |
| notifications | OK (37s) | OK (1m 59.8s) | OK (2m 7.6s) | OK (2m 6.9s) | OK (2m 11.7s) |
| profile | OK (49.4s) | OK (3m 4.9s) | OK (3m 5.7s) | OK (2m 55.1s) | OK (2m 56.8s) |
| profile_deletion_at_logout | OK (1m 33.7s) | ÉCHEC (2m 5s) | ÉCHEC (2m 4.3s) | OK (5m 5.4s) | OK (4m 34.2s) |

### ios — résultat de chaque spec, par tour

| spec | tour 1 | tour 2 | tour 3 | tour 4 | tour 5 |
|---|---|---|---|---|---|
| authentication | OK (26.7s) | OK (25.5s) | OK (25.4s) | OK (34.5s) | OK (34.7s) |
| demarches | OK (2m 22.7s) | OK (2m 14.2s) | OK (2m 19.8s) | OK (2m 23.2s) | OK (2m 26.1s) |
| login_logout_login | OK (1m 0.7s) | OK (57.4s) | OK (58.5s) | OK (57.5s) | OK (57.8s) |
| notifications | ÉCHEC (2m 44.7s) | ÉCHEC (2m 42.9s) | ÉCHEC (2m 10.5s) | ÉCHEC (2m 43.2s) | ÉCHEC (2m 43.2s) |
| profile | OK (48.9s) | OK (48.2s) | OK (48.4s) | OK (48.7s) | OK (48.8s) |
| profile_deletion_at_logout | OK (1m 13.3s) | ÉCHEC (délai dépassé) | OK (1m 12.5s) | OK (1m 12.1s) | OK (1m 11.9s) |

## Détail par test

## webapp — 5 tour(s), 234 passages / 240 exécutions de tests

| spec › test | passages | durée de la spec (min–max) |
|---|---|---|
| accueil › affiche la salutation, la date et les blocs agenda et démarches | 5/5 | 1–7 s |
| accueil › la carte « Opération Tranquillité Vacances » ouvre la fiche du service | 5/5 | 1–7 s |
| accueil › la carte « Renseignez votre adresse » ouvre le formulaire d'adresse sans rien enregistrer | 5/5 | 1–7 s |
| accueil › la cloche ouvre les notifications | 5/5 | 1–7 s |
| accueil › « Voir tous mes évènements » ouvre l'agenda | 5/5 | 1–7 s |
| accueil › « Voir toutes mes démarches » ouvre le suivi | 5/5 | 1–7 s |
| agenda › liste les évènements à venir puis ceux des mois suivants | 5/5 | 1–38 s |
| agenda › ouvre le dialogue d'un évènement qui propose « Supprimer », puis le ferme | 5/5 | 1–38 s |
| agenda › « Préférences » ouvre la page des 13 zones scolaires, puis « Retour » revient à l'agenda | 5/5 | 1–38 s |
| aide-contact › « Accessibilité » liste ses sections | 5/5 | 5–9 s |
| aide-contact › « Aide et contact » propose l'aide de l'administration et le problème applicatif | 5/5 | 5–9 s |
| aide-contact › « Données personnelles et sécurité » liste ses 6 sections | 5/5 | 5–9 s |
| aide-contact › « Je rencontre un problème sur l'application » ouvre Contact et son dialogue d'actions | 5/5 | 5–9 s |
| authentication › s'authentifie via FranceConnect et arrive sur la page d'accueil | 5/5 | 5–11 s |
| deconnexion › se déconnecte après confirmation, puis se reconnecte avec les données d'origine | 5/5 | 1–9 s |
| erreurs › /forbidden affiche « L’application n’est pas ouverte au public » | 5/5 | 1–9 s |
| erreurs › /network-error affiche « Problème de connexion Internet » | 5/5 | 1–9 s |
| erreurs › /technical-error affiche « Petit problème de notre côté... » | 5/5 | 1–9 s |
| navigation › la barre basse ouvre « Agenda » puis revient à l'accueil | 5/5 | 1–7 s |
| navigation › la barre basse ouvre « Services » puis revient à l'accueil | 5/5 | 1–7 s |
| navigation › la barre basse ouvre « Suivi » puis revient à l'accueil | 4/5 ⚠ | 1–7 s |
| navigation › le menu Plus ouvre « Accessibilité » | 5/5 | 1–7 s |
| navigation › le menu Plus ouvre « Aide et contact » | 5/5 | 1–7 s |
| navigation › le menu Plus ouvre « Données personnelles et sécurité » | 5/5 | 1–7 s |
| navigation › le menu Plus ouvre « Mon profil » | 5/5 | 1–7 s |
| navigation › le menu Plus ouvre « Préférences » | 5/5 | 1–7 s |
| navigation › le menu Plus propose les 6 entrées attendues | 5/5 | 1–7 s |
| notifications › ouvre le détail de la démarche depuis une notification liée à une démarche | 5/5 | 2–34 s |
| notifications › reçoit une notification publiée dans l'inbox in-app | 5/5 | 2–34 s |
| notifications › « Gérer » ouvre les préférences de notifications | 5/5 | 2–34 s |
| preferences › propose les 3 entrées : suivi des démarches, notifications, zones scolaires | 5/5 | 3–43 s |
| preferences › « Notifications » affiche la case de réception sur l'appareil | 5/5 | 3–43 s |
| preferences › « Suivi des démarches » liste un partenaire par case, AMI suivi après consentement | 5/5 | 3–43 s |
| preferences › « Zones scolaires » ouvre la page des 13 zones, puis « Fermer » revient aux préférences | 5/5 | 3–43 s |
| profil › affiche l'identité, le contact et l'adresse issus de FranceConnect | 5/5 | 4–9 s |
| profil › permet de modifier l'email du bloc « Contact » | 5/5 | 4–9 s |
| profil › permet de modifier le nom d'usage du bloc « Mon identité » | 5/5 | 4–9 s |
| profil › « Modifier » ouvre « Contact » et « Annuler » revient au profil sans rien changer | 5/5 | 4–9 s |
| profil › « Modifier » ouvre « Mon identité » et « Annuler » revient au profil sans rien changer | 5/5 | 4–9 s |
| profil › « Modifier » ouvre « Où habitez-vous ? » et « Annuler » revient au profil sans rien changer | 5/5 | 4–9 s |
| services › la fiche « Opération Tranquillité Vacances » propose « Bénéficier de ce service » | 5/5 | 1–36 s |
| services › ouvre une checklist, ses sections, puis une section avec ses cases décochées | 5/5 | 1–36 s |
| services › « Démarches et outils » liste les cartes des partenaires | 5/5 | 1–36 s |
| services › « Trouver de l'aide » propose SOS, les checklists et l'annuaire | 5/5 | 1–36 s |
| suivi › affiche la page des démarches archivées et les partenaires suivis | 0/5 ✖ | 1–69 s |
| suivi › clôture la démarche (statut closed) et affiche son historique dans le détail | 5/5 | 1–69 s |
| suivi › crée une démarche visible dans le suivi (statut new) | 5/5 | 1–69 s |
| suivi › met à jour l'URL externe de la démarche (statut wip) | 5/5 | 1–69 s |

### webapp — messages d'erreur

- `navigation` ×1 : Expect $(`role/navigation[name="Menu principal"]`).$(`role/button[name="Agenda"]`) to be displayed
- `suivi` ×5 : Aucun élément affiché pour « role/button[name="AMI"] » après 15000ms (waitUntil condition timed out after 15000ms)

## android — 5 tour(s), 54 passages / 76 exécutions de tests

| spec › test | passages | durée de la spec (min–max) |
|---|---|---|
| authentication › s'authentifie via FranceConnect et arrive sur la page d'accueil | 5/5 | 61–69 s |
| demarches › crée une démarche visible dans le suivi (statut new) | 5/5 | 64–198 s |
| demarches › ferme la démarche (statut closed) | 5/5 | 64–198 s |
| demarches › met à jour l'URL externe de la démarche (statut wip) | 5/5 | 64–198 s |
| login_logout_login › log out suivi d un log in | 1/5 ⚠ | 65–127 s |
| notifications › reçoit une notification publiée dans l'inbox in-app | 5/5 | 37–129 s |
| profile › permet de modifier l'email dans le bloc "Contact" | 5/5 | 4–189 s |
| profile › permet de modifier le nom d'usage dans le bloc "Mon identité" | 5/5 | 4–189 s |
| profile_deletion_at_logout › affiche l'adresse originale (pas la valeur modifiée) | 0/2 ✖ | 67–304 s |
| profile_deletion_at_logout › affiche l'email original (pas la valeur modifiée) | 3/5 ⚠ | 67–304 s |
| profile_deletion_at_logout › affiche les données d'identité originales (pas les valeurs modifiées) | 3/5 ⚠ | 67–304 s |
| profile_deletion_at_logout › modifie l'adresse | 0/2 ✖ | 67–304 s |
| profile_deletion_at_logout › modifie l'email | 3/5 ⚠ | 67–304 s |
| profile_deletion_at_logout › modifie le nom d'usage | 3/5 ⚠ | 67–304 s |
| profile_deletion_at_logout › se déconnecte via le menu plus | 3/5 ⚠ | 67–304 s |
| profile_deletion_at_logout › se reconnecte avec le même compte | 3/5 ⚠ | 67–304 s |
| profile_deletion_at_logout › « before all » (connexion initiale) | 0/2 ✖ | 67–304 s |

### android — messages d'erreur

- `login_logout_login` ×4 : Timeout of 120000ms exceeded. The execution in the test "Profil usager — déconnexion suivie d'une reconnexion log out suivi d un log in" took too long. Try to reduce the 
- `profile_deletion_at_logout` ×16 : Test skipped due to failure in hook ""before all" hook: wrappedHook for "modifie le nom d'usage"": Timeout after 119997ms in "Profil usager — suppression des modification
- `profile_deletion_at_logout` ×2 : Timeout after 119997ms in "Profil usager — suppression des modifications à la déconnexion \"before all\" hook: wrappedHook for \"modifie le nom d'usage\"" (WDIO attempt 1

## ios — 5 tour(s), 59 passages / 65 exécutions de tests

| spec › test | passages | durée de la spec (min–max) |
|---|---|---|
| authentication › s'authentifie via FranceConnect et arrive sur la page d'accueil | 5/5 | 4–7 s |
| demarches › crée une démarche visible dans le suivi (statut new) | 5/5 | 121–128 s |
| demarches › ferme la démarche (statut closed) | 5/5 | 121–128 s |
| demarches › met à jour l'URL externe de la démarche (statut wip) | 5/5 | 121–128 s |
| login_logout_login › log out suivi d un log in | 5/5 | 4–67 s |
| notifications › reçoit une notification publiée dans l'inbox in-app | 0/5 ✖ | 122–129 s |
| notifications › « before all » (connexion initiale) | 0/1 ✖ | 122–129 s |
| profile › permet de modifier l'email dans le bloc "Contact" | 5/5 | 2–9 s |
| profile › permet de modifier le nom d'usage dans le bloc "Mon identité" | 5/5 | 2–9 s |
| profile_deletion_at_logout › affiche l'email original (pas la valeur modifiée) | 4/4 | 61–69 s |
| profile_deletion_at_logout › affiche les données d'identité originales (pas les valeurs modifiées) | 4/4 | 61–69 s |
| profile_deletion_at_logout › modifie l'email | 4/4 | 61–69 s |
| profile_deletion_at_logout › modifie le nom d'usage | 4/4 | 61–69 s |
| profile_deletion_at_logout › se déconnecte via le menu plus | 4/4 | 61–69 s |
| profile_deletion_at_logout › se reconnecte avec le même compte | 4/4 | 61–69 s |
| profile_deletion_at_logout › *(aucun résultat de test dans 1 exécution(s))* | — | 61–69 s |

### ios — messages d'erreur

- `notifications` ×4 : Timeout of 120000ms exceeded. The execution in the test "Notifications reçoit une notification publiée dans l'inbox in-app" took too long. Try to reduce the run time or i
- `notifications` ×1 : Timeout after 119997ms in "Notifications \"before all\" hook: wrappedHook for \"reçoit une notification publiée dans l'inbox in-app\"" (WDIO attempt 1/1)
- `notifications` ×1 : Test skipped due to failure in hook ""before all" hook: wrappedHook for "reçoit une notification publiée dans l'inbox in-app"": Timeout after 119997ms in "Notifications \

