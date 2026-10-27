# Non-régression webapp — plans de scénarios

Source : réunion du 2026-10-06 (`docs/process/10-06 Réunion _ Stratégie de tests et gestion de l'espace partenaire-*`).
Cible : **préprod** (`AMI_ENV=preprod`), compte `avec_nom_dusage`, avec restauration de l'état modifié.

## Deux niveaux

| Niveau | But | Suite |
|---|---|---|
| **smoke** | la suite la plus courte qui prouve qu'on ne perdra pas son temps en lançant une campagne manuelle (aujourd'hui : authentification et accueil ; le contrôle des liens `catalogue.parcours` est en `webapp_all`) | `webapp_smoke` |
| **recette** | automatise les vérifications pénibles à la main (consentement, zones, agenda, redirections) | `webapp_usage` (PR/merge/tag), `webapp_all` |

## Format

Un fichier `.md` par thème, un scénario par section `### Sx.y — titre`, déroulé chaîné :

- `Étant donné` : état initial (et comment il est préparé : API partenaire ou UI)
- `Quand` : une action de l'usager
- `Alors` : une assertion, avec l'écran nommé (vocabulaire de `docs/process/model/apps/ami-spa.yaml`) et la valeur attendue
- `Et` : prolonge l'étape précédente
- `Restauration` : ce que `after()` remet en place

Règle de preuve (CLAUDE.md § Documentation) : tout ce qui n'a pas été observé est marqué **non confirmé**.
Les libellés entre « » sont ceux de l'UI ; ils sont vérifiés à l'exploration et corrigés ici.

## Statuts

✅ implémenté et exécuté en préprod · ⏳ en cours (sous-agent) · ⏸ écrit mais suspendu · 📝 à implémenter · ❓ à décider / bloqué par une question · 🚫 exclu

## Index

| Id | Scénario | Fichier | Niveau | Statut |
|---|---|---|---|---|
| S1.1 | Chaque carte du catalogue mène à une page valide | [catalogue.md](catalogue.md) | smoke | ✅ |
| S1.2 | « Trouver de l’aide » : cybermalveillance et checklists | [catalogue.md](catalogue.md) | smoke | ✅ |
| S1.3 | Chaque entrée de « Trouver de l’aide » mène à une page valide | [catalogue.md](catalogue.md) | smoke | ✅ (gendarmerie tolérée en avertissement) |
| S1.4 | Listes d étapes : chaque lien fonctionne | [catalogue.md](catalogue.md) | recette | ✅ (échoue sur 1 URL mal saisie, voir catalogue.md) |
| S1.5 | Titre de la page cible cohérent avec la carte | [catalogue.md](catalogue.md) | smoke | ⏳ règle provisoire en avertissement (Kevin tranchera sur les données relevées) |
| S2.1 | Aide et contact : liens atteignables | [catalogue.md](catalogue.md) | smoke | ✅ |
| S3 | Bouton « Je veux suivre mes démarches » selon le consentement | [consentement.md](consentement.md) | recette | ✅ |
| S4.1 | Case de consentement persistée côté backend | [consentement.md](consentement.md) | recette | ✅ |
| S4.2 | « Tout suivre » active tout | [consentement.md](consentement.md) | recette | ✅ |
| S5.1 | Notification avant / après consentement | [consentement.md](consentement.md) | recette | ✅ (attente non confirmée : avertissement) |
| S5.2 | Notification sans / avec consentement (cas simple) | [consentement.md](consentement.md) | recette | 📝 |
| S6.1 | Avertissement en désactivant le consentement AMI | [consentement.md](consentement.md) | recette | ✅ |
| S6.2 | Démarches masquées puis retrouvées | [consentement.md](consentement.md) | recette | ⏳ constat sans échec (attente d'Édouard pour durcir) |
| S6.3 | Démarches publiées sans consentement : Suivi et notifications (scénario de l'équipe, vidéo) | [consentement.md](consentement.md) | recette | ❌ implémenté, 4 attentes non tenues sur 6 (à arbitrer) · 🎬 vidéo faite |
| S7 | Zones scolaires : préférences et agenda | [zones-agenda.md](zones-agenda.md) | recette | ✅ |
| S8.1 | Échéance de démarche dans l'agenda → détail | [zones-agenda.md](zones-agenda.md) | recette | ✅ |
| S10.1 | Suppression d'un élément de l'agenda | [zones-agenda.md](zones-agenda.md) | recette | ✅ |
| S10.2 | Reconnexion : l'élément fixe supprimé réapparaît | [zones-agenda.md](zones-agenda.md) | recette | ✅ |
| S10.3 | Agenda vide | [zones-agenda.md](zones-agenda.md) | recette | 🚫 non décrit |
| S9.1–S9.4 | Redirections vers le détail (Accueil, Suivi, notification, Agenda) | [demarche-detail.md](demarche-detail.md) | recette | ✅ (S9.4 couvert par S8.1) |
| S12.1 | FranceConnect silencieuse | [demarche-detail.md](demarche-detail.md) | recette | ✅ (assertion proposée) |
| S13.1 | Sous-démarches sous la bonne démarche parente | [demarche-detail.md](demarche-detail.md) | recette | ✅ (assertion proposée) |
| S11.1 | Passkey : « Peut-être plus tard » | [passkey.md](passkey.md) | recette | ✅ |
| S11.2 | Passkey : « Ajouter une clé » | [passkey.md](passkey.md) | recette | ⏸ suspendu (décision 2026-10-15 : aucun compte ne peut accueillir une passkey persistante) |
| EP1–EP6 | Espace Partenaire (pages légales, reset, catalogue, listes d'étapes, notification, accès) | [espace-partenaire.md](espace-partenaire.md) | — | 🚫 **hors périmètre** (décision 2026-10-15) |
| ENV1 | Mêmes specs sur staging et branches | [environnements.md](environnements.md) | — | ⏳ (1ᵉʳ passage fait : 13/19 ; rejeu en cours) |
| ENV2 | Smoke en production (utilisateur FranceConnect de test) | [environnements.md](environnements.md) | smoke | ❓ |
| ENV3 | Déconnexion FranceConnect (staging) | [environnements.md](environnements.md) | — | ✅ (staging seulement ; sauté ailleurs) |
| — | Exclusions et décisions en attente | [backlog.md](backlog.md) | — | 🚫 / ❓ |
| — | Modèle YAML (`docs/process/model`) à jour au 2026-10-15 ; `check-model` retiré sur décision de l'équipe | — | — | ✅ |

## Décisions de l'équipe (2026-10-15)

| Décision | Effet |
|---|---|
| Le lien de la gendarmerie n'est joignable que depuis un réseau privé | avertissement, pas d'échec (`PRIVATE_NETWORK_HOSTS`, `src/helpers/webapp/link-check.ts`) |
| `qualif.demarches.service-public.gouv.fr` (staging) : même règle | ajouté à la même liste |
| Scénarios propres à un environnement | **garde explicite + `this.skip()` motivé** via `environmentKind()` (`src/helpers/common/environment.ts`) — pas de suites séparées par environnement |
| Modèle YAML | modèle YAML à jour au 2026-10-15 ; `check-model` retiré sur décision de l'équipe |
| Hygiène du dépôt | `this.timeout()` déplacés au `describe` ; `pageLoadStrategy: 'eager'` pour la webapp (à valider par un rejeu complet, repli si régression) |
| **Un seul run navigateur à la fois** | la machine de test sature (charge > 15) : deux runs lancés ensemble ont échoué sans rapport avec l'application |
| S5.2 et S6.2 en attendant Édouard | **constat sans échec** : observer et journaliser (`ANOMALIE ?`), durcir en une ligne quand il répond |
| S1.5 en attendant Kevin | **règle provisoire en avertissement** : le titre de la page cible contient le nom de la carte (casse, accents, ponctuation normalisés), `ANOMALIE ?` sinon, jamais d'échec |
| Espace Partenaire (EP1–EP6) | **retiré du périmètre** de ce dossier ; `espace-partenaire.md` conservé comme archive |
| S11.2 (passkey) | **reste suspendu** |
| Constat « notifications reçues avant le consentement » (S5) | à **montrer en vidéo** (service `devtools` de WDIO 10, `just test-webvideo`), sans outil sur mesure |

