# Backlog, exclusions et décisions en attente

Les scénarios à implémenter ont leurs fichiers ([catalogue.md](../parcours/catalogue.md), [consentement.md](consentement.md), [zones-agenda.md](zones-agenda.md), [espace-partenaire.md](espace-partenaire.md), [environnements.md](environnements.md)). Ce fichier ne garde que ce qui **n'est pas un scénario** : exclusions voulues par la réunion et décisions bloquantes.

## Exclus par la réunion (ne pas tester)

| Sujet | Raison | Source |
|---|---|---|
| Libellé du jour affiché une seule fois dans l'agenda | changement visuel, « pas de l'action » | 14:46 |
| Page Préférences > Notifications | page en cours de déplacement, « buggée », ne pas tester | 03:08–03:34 |
| Contenu des pages légales (Données personnelles, Accessibilité) | du texte paramétré par l'équipe ; seule la modification depuis l'Espace Partenaire est testable (voir EP1) | 30:47–31:03 |
| Contenu des listes d'étapes (wording, ordre) | configurable, téléchargé ; seul le parcours est testable (voir S1.4) | 21:34, 22:02 |
| Messages repliables / affichage des sous-démarches en bas | suggestion de produit | 27:15–27:37 |
| Sujets organisationnels : CMS Wagtail / site conforme, ACME, atelier IA, moteur de recherche interne, OPSEC et ciblage « mini univers » | pas des tests | 37:37 sq. |

## Décisions bloquantes (ni Nicolas ni Kevin ne les ont tranchées)

| Décision | Bloque | À demander à |
|---|---|---|
| Sort des démarches déjà synchronisées quand on désactive le consentement | S6.2, S5.2 (en attendant : **constat sans échec**) | Édouard |
| Rattachement des sous-démarches aux démarches parentes | S13.1 (assertion proposée) | Édouard |
| Protocole de la connexion silencieuse FranceConnect et critère de réussite | S12.1 (assertion proposée, constat « page de connexion SP » à faire valider) | Édouard |
| Utilisateur de test FranceConnect de production | ENV2 | FranceConnect |
| Critère de validation d'un lien (au-delà du statut 200 : page de connexion, wording) | S1.1 (`isBrokenTarget`), S1.5 | Kevin |
| ~~Un hôte de préproduction partenaire injoignable depuis la machine de test (gendarmerie) est-il un lien KO ?~~ | **Tranché le 2026-10-15** : joignable seulement depuis un réseau privé → avertissement, pas un échec (`PRIVATE_NETWORK_HOSTS` dans `link-check.ts`) | — |
| ~~`external ID` vs `internal ID` des listes d'étapes, format XML → JSON~~ | EP4 — **sans objet** depuis que l'Espace Partenaire est hors périmètre (2026-10-15) | Fred (intégrateur des listes) |


## Hors tests, notés par la réunion

Regénérer les captures d'écran en préprod (Miro, état staging du 2026-08-08) ; finaliser la migration WDIO 10 ; adopter un vocabulaire d'écrans commun (arborescence Miro) — le plan `nonreg/README.md` utilise le vocabulaire de `docs/process/model/apps/ami-spa.yaml`, **pas encore** celui du Miro.

## Tranché le 2026-10-15

| Décision | Référence |
|---|---|
| Hôtes de préproduction/qualif injoignables depuis une machine publique : avertissement | `PRIVATE_NETWORK_HOSTS` (gendarmerie, `qualif.demarches.service-public.gouv.fr`) |
| Tests propres à un environnement : garde explicite + skip motivé | `environmentKind()` ; voir [environnements.md](environnements.md) |
| Modèle YAML | modèle YAML à jour au 2026-10-15 ; `check-model` retiré sur décision de l'équipe |
| Espace Partenaire (EP1–EP6) | **Retiré du périmètre** ; [espace-partenaire.md](espace-partenaire.md) archivé |
| S5.2 / S6.2 en attendant Édouard | Constat sans échec |
| S1.5 en attendant Kevin | Règle provisoire en avertissement |
| S11.2 passkey | Reste suspendu |

