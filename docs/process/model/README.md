# Modèle de la surface de test

Description formelle de **ce que les apps AMI exposent** (face A) et de **ce que les scénarios de `src/tests/**` en font** (face B), reliées par des références typées. De ce modèle découlent les scénarios de navigation et de manipulation, et le calcul de couverture par écran, par information observée et par action.

La règle du jeu est dans [`spec.md`](spec.md). Ce fichier dit où trouver quoi et ce que le modèle contient aujourd'hui.

## Contenu

```
docs/process/model/
├── spec.md                          # la spécification (DSL, protocoles, couverture, règles C1-C12)
├── schema/
│   ├── app.schema.json              # JSON Schema de la face A
│   └── scenarios.schema.json        # JSON Schema de la face B
├── apps/                            # FACE A — les apps entières
│   ├── ami-spa.yaml                 #   SPA (webapp + WebViews Android/iOS) : 43 écrans, 1 composant, 3 états
│   ├── ami-native.yaml              #   écrans natifs Android/iOS : 4 écrans (picker + 3 non confirmés)
│   ├── franceconnect.yaml           #   FranceConnect (tiers) : 5 écrans, eIDAS, identifiants et démonstrateur
│   ├── ami-api-partenaire.yaml      #   API : 3 opérations qui alimentent les écrans
│   └── espace-partenaire.yaml       #   Espace Partenaire : 9 écrans, 100 % non observés
└── scenarios/                       # FACE B — les scénarios de src/tests/**
    ├── webapp.yaml                  #   src/tests/webapp  (22 fichiers dont nonreg/)
    ├── mobile.yaml                  #   src/tests/mobile  (6 fichiers)
    └── tutorial.yaml                #   src/tests/tutorial (1 fichier, gabarit tout en skip)
```

## Rapport avec les documents existants

| Document | Rôle | Rapport avec ce modèle |
|---|---|---|
| `../reconstruction-modele-applicatif.md` | **comment** reconstruire le modèle à partir des apps | produit la preuve (`evidence: live`) dont la face A a besoin |
| `../schema-navigation-webapp.md` | diagramme Mermaid de navigation et de couverture, à la main | source principale de `apps/ami-spa.yaml` ; le modèle en est la forme structurée et calculable |
| `CONTRIBUTING.md` §1-2 | Page Objects, sélecteurs | hors modèle : aucun sélecteur ici |

## Lecture d'un scénario

Un scénario est une **trace** sur la face A :

```yaml
- id: webapp.profil.edit-email
  source: {file: src/tests/webapp/profil.usage.test.ts, describe: Profil usager, it: "permet de modifier l'email du bloc « Contact »"}
  status: active
  targets: [webapp]
  trace:
    - {do: "ami-spa:profile#open-edit-contact", steps: [trigger, arrive]}
    - {do: "ami-spa:edit-email#save", steps: [read-origin, mutate, read-mutation, restore]}
  cleanup:
    - {restores: "ami-spa:profile@contact", by: after-hook, assured: best-effort}
```

`ami-spa:edit-email#save` est une action `mutate` : son protocole impose `read-origin`, `mutate`, `read-mutation`, `restore`. Le `cleanup` dit que la restauration est faite par un `after()` dont les erreurs sont avalées : l'étape compte, mais le rapport l'affichera en avertissement.

## Inventaire (2026-10-15)

Chiffres de la dernière exécution du script de validation (jetable, retiré du dépôt le 2026-10-15), copiés tels quels.

| | Valeur |
|---|---|
| Apps décrites | 5 |
| Écrans | 61 (dont 9 de l'Espace Partenaire, tous sans preuve) |
| Composants, états, opérations d'API | 1, 3, 3 |
| Actions | 83 explicites (79 d'écrans, 4 du composant) + 34 `goto-route` implicites (un par écran qui a une route) |
| Observables | 43 |
| Scénarios | 98 : 87 `active`, 11 `skipped`, 0 `backlog` (webapp 76, mobile 17, tutorial 5) |
| `it()` dans `src/tests/**` | 88 dans 29 fichiers, dont 11 ignorés (webapp 66 / 22 fichiers, mobile 17 / 6, tutorial 5 / 1) |
| Titres distincts décrits | 88, par 98 scénarios (les boucles s'étendent en instances) |

**Vérifié à cette date** (0 écart) : validité des deux JSON Schema sur les 8 fichiers YAML ; références résolues (C1) ; identifiants uniques (C2) ; règles C5, C7, C8, C9 et C12 ; chaque scénario `active` ou `skipped` pointe un `it()` qui existe, avec le bon statut (C10) ; chaque `it()` est décrit (C11). **Non contrôlés** : C3, C4 et C6. Plus aucune recette ne rejoue ces contrôles.

## Couverture déclarée (SPA, éléments `live` ou `code`, `coverage: required`)

> **Chiffres du 2026-10-06, NON recalculés.** Aucun outil ne calcule la couverture (spec.md §9). Les 21 scénarios `nonreg/`, la page des zones, `agenda-event-dialog#delete` désormais requis et `deconnexion-reconnexion.usage` désormais actif les rendent périmés ; ne pas les citer sans les recalculer.

Calcul sur ce que les scénarios `active` **déclarent**, pas sur une exécution mesurée (spec.md §9).

| Cible | Écrans visités | Observables lus | Actions complètes / partielles |
|---|---|---|---|
| webapp | 31 / 35 | 31 / 33 | 44 + 2 partielles / 50 |
| android | 10 / 35 | 5 / 33 | 10 + 5 partielles / 50 |
| ios | 10 / 35 | 5 / 33 | 10 + 5 partielles / 50 |

Android et iOS sont identiques parce que `src/tests/mobile/**` s'exécute sur les deux.

### Ce que le modèle fait déjà ressortir

- **Webapp, actions non couvertes** (relevé du 2026-10-06) : `home#open-procedure-title` (depuis, exercée par S9.1), `services-tools#select-help-tab`, `followup-item#open-partner-demarche`. Le `switch` des zones, ex-`agenda-zones-dialog#toggle-zone`, est devenu `preferences-zones#toggle-zone` : la spec S7 le déclare avec ses 4 étapes.
- **Webapp, observables jamais lus** : `home@carousel` et `profile@address`. Le test « affiche l'identité, le contact et l'adresse » ne lit pas l'adresse malgré son titre.
- **Webapp, écrans jamais visités** : les trois écrans d'onboarding (traversés par des no-op conditionnels, donc non revendiqués) et `ext-partner-demarche`.
- **Mobile** : 10 écrans sur 35 (connexion, accueil, notifications, suivi et détail, menu Plus, profil et ses 2 formulaires, déconnexion). Navigation, services, agenda, préférences, aide, pages légales et erreurs n'ont aucun scénario mobile.
- **Exclues par décision documentée** : `edit-address#save` (adresse Caf, COJUR) et `welcome-passkey#add-passkey` (passkey persistante sur le compte partagé, non confirmé). `agenda-event-dialog#delete` ne l'est plus : les specs S10 et S10.2 la cliquent (restauration par la déconnexion, observée le 2026-10-15).
- **Restaurations `best-effort`** : les 4 scénarios de modification du profil (webapp et mobile) restaurent dans un `after()` qui avale les erreurs. Seuls `deconnexion` et `profil-et-suppression-a-la-deconnexion.usage` vérifient la restauration.

## Écarts et doutes à lever

- `../schema-navigation-webapp.md` marque `✔` l'arête « Accéder à ma démarche », mais `suivi.usage.test.ts` ne fait qu'asserter la cible du lien (`assertLienExterne`), sans cliquer. Le modèle suit le code : l'action n'est pas couverte.
- `suivi-des-demarches-consentements.test.ts` annonce 4 interrupteurs ; le test webapp en relève 6.
- Le second `tapFranceConnect(true)` du test d'authentification mobile n'est pas documenté : noté non confirmé.
- Les zones scolaires sont une PAGE (`/preferences/zones`) et non plus un dialogue depuis le 2026-10-08 : l'ancien écran `agenda-zones-dialog` est supprimé du modèle.
- Les écrans de l'SPA sont observés en live **uniquement sur la webapp** ; leur présence sur Android et iOS est déduite du packaging de la SPA (non confirmée écran par écran).
- Les 18 actions et 5 écrans `unconfirmed` de la SPA (3 prototypes, 2 destinations externes ; côté actions : destinations externes, `Sous-menu`, bascules jamais cliquées…) n'entrent pas dans les taux ci-dessus. L'écran de clé d'accès est `live` mais sa route n'est pas relevée.
- Les passerelles d'API (réponses 401/400) et la trace mesurée sont des extensions prévues, non réalisées.

## Maintenir le modèle

- App modifiée : relancer le process de `../reconstruction-modele-applicatif.md`, puis mettre à jour `apps/` avec les nouvelles preuves (et leur `observed-on`).
- Test ajouté, modifié ou supprimé : mettre à jour `scenarios/` dans le même commit (la règle C11 en fait un contrôle d'exhaustivité, à vérifier à la main ou par un script jetable).
- Ne jamais ajouter un élément sans preuve : le marquer `unconfirmed` (CLAUDE.md § Documentation).
