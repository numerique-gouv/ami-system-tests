---
title: API de notifications
layout: layouts/page.njk
description: Envoi de notifications push et suivi de démarches via l'API AMI
eleventyNavigation:
  key: API de notifications
  parent: Intégrations partenaires
  order: 2
showBreadcrumb: true
---

# Intégration partenaire : API de publication d'événéments partenaire

> Statut : **brouillon, à relire avant diffusion partenaire**
> Dernière mise à jour : 11 juin 2026
> Public visé : équipes techniques d'un fournisseur de service partenaire d'AMI.

## 1. Vue d'ensemble

>*EGV* L'API va s'appeler event, est-ce qu'on parlerait pas plutôt d'API de *publication d'événéments partenaire* ?

>*EGV* je pense qu'on ne devrait dans cette doc parler que de la V2. Elle est disponible sur [la branche 935](https://ami-back-staging-pr935.osc-fr1.scalingo.io/schema/rapidoc#put-/api/v2/event) en attendant d'être mergée.

L'API de notifications AMI permet à un fournisseur de service (FS) partenaire de :

1. **Notifier** un usager AMI (notification push sur mobile + entrée dans le centre de notifications).
2. **Alimenter le suivi de démarches** de l'usager dans l'application AMI, sans que l'usager ait à saisir quoi que ce soit.

Ces deux fonctions passent par **le même appel API** : `POST /api/v1/notifications`.

>*EGV* et ce sera un PUT

---

## 2. Authentification

L'API utilise **HTTP Basic Authentication** avec les identifiants partenaire :

```
Authorization: Basic base64(<partner_id>:<partner_secret>)
```

Les valeurs de `partner_id` et `partner_secret` vous sont fournies par l'équipe AMI lors de l'intégration.

---

## 3. Endpoint

```
POST /api/v1/notifications
Content-Type: application/json
Authorization: Basic <credentials>
```

**URL de base par environnement :**

| Environnement | URL de base |
|---|---|
| Staging | `https://ami-back-staging.osc-fr1.scalingo.io` |
| Production | fournie par l'équipe AMI |

La documentation Swagger interactive est disponible à l'adresse `/schema/rapidoc` (vue *multi-form-data* recommandée pour lire la description de chaque champ).
L'url d'envoi de notification depuis l'environnement staging est donc : https://ami-back-staging.osc-fr1.scalingo.io/schema/rapidoc#post-/api/v1/notifications

---

## 4. Champs du payload

### 4.1 Champs de notification (affichés à l'usager)

Ces champs alimentent la notification dans le centre de notifications AMI et, le cas échéant, la notification push sur mobile.
Les mobiles physiques ios et android ainsi que les mobiles virtuels android sont capables de recevoir les "notifications push".
Les mobiles virtuels ios ne sont pas visibles des systèmes de notifications Apple.
Tous les mobiles recoivent les notifications dans le centre de notifications de l'application AMI, quelles soient "push" ou non.

| Champ | Type | Requis | Description |
|---|---|---|---|
| `recipient_fc_hash` | string | **oui** | Hash déterministe des données pivot FranceConnect de l'usager destinataire. Voir [§ 6](#6-identifier-le-destinataire-recipient_fc_hash). |
| `content_title` | string | **oui** | Titre de la notification (visible dans le centre de notifications et dans la push). |
| `content_body` | string | **oui** | Corps de la notification (visible dans le centre de notifications et dans la push). |
| `content_private_body` | string | non | Contenu complémentaire **non envoyé en push**. Concaténé à `content_body` dans le centre de notifications AMI. Non exploité dans la v1, réservé pour la v2.|
| `content_icon` | string | non | Nom technique d'une icône DSFR (ex. `fr-icon-notification-3-line`). Par défaut : icône du partenaire déclarée dans AMI. |
| `send_date` | datetime ISO 8601 | **oui** | Date d'émission côté partenaire (ex. `2026-06-11T14:30:00+02:00`). **Doit être unique entre deux appels** : ce champ entre dans la clé d'idempotence (voir [§ 7](#7-idempotence)). |
| `try_push` | boolean | non | Si `true` (défaut), AMI tente d'envoyer une notification push sur les terminaux de l'usager s'il est enregistré. Mettre à `false` pour enregistrer sans notifier. |

>*EGV* les content_private_body sera quand même exploité dans la V1

### 4.2 Champs de démarche (`item_*`)

Ces champs sont **optionnels**, mais si vous en renseignez au moins un, les quatre champs marqués **\*** deviennent **obligatoires ensemble**.

Leur présence crée ou met à jour une entrée dans le **suivi de démarches** de l'usager (écran « Mes démarches »).

| Champ | Type | Requis si item | Description |
|---|---|---|---|
| `item_type` | string | **\*** | Type de la démarche, champ libre défini par le partenaire (ex. `OTV` pour Opération Tranquillité Vacances). Ce type sert à regrouper les notifications d'une même famille de démarches. |
| `item_id` | string | **\*** | Identifiant unique de la démarche dans le référentiel partenaire. |
| `item_status_label` | string | **\*** | Libellé de statut tel que l'usager le verra dans l'interface (ex. `Brouillon`, `En cours`, `Terminé`). Texte libre. |
| `item_generic_status` | enum | **\*** | Statut normalisé côté AMI. Valeurs autorisées : `new` (création), `wip` (mise à jour), `closed` (clôture). Pilote le comportement de l'application (onglet « En cours » ou « Passées »). |
| `item_canal` | string | non | Canal d'origine de la démarche (ex. `AMI`, `PSL`). Sert à la mesure d'impact partenaire. |
| `item_external_url` | string | non | URL vers la page de la démarche sur votre portail. Permet à l'usager de revenir sur votre service depuis AMI. Voir [§ 5.2](#52-lurl-externe-item_external_url-et-la-franceconnexion-direct). |
| `item_milestone_start_date` | datetime ISO 8601 | non | Date de début de la période liée à la démarche (ex. début de surveillance OTV). Réservé pour une intégration calendrier future. |
| `item_milestone_end_date` | datetime ISO 8601 | non | Date de fin de la période. Doit être postérieure à `item_milestone_start_date`. |

---

## 5. Comportement dans l'application AMI

### 5.1 Le suivi de démarches : fonctionnement par événements

AMI reconstruit l'état courant d'une démarche **à partir de l'ensemble des notifications** qui partagent le même triplet `(partner_id, item_type, item_id)`, triées par date de création.

Conséquences pratiques :

- **Titre et description** : pris sur la **dernière notification** de la série.
- **Statut affiché** (`item_status_label`) : pris sur la **dernière notification**.
- **URL externe** : pris sur la **dernière notification qui en contient une**. Vous pouvez donc envoyer une mise à jour de statut sans répéter l'URL : AMI conserve la dernière URL connue.
- **Date de création** de la démarche dans AMI : `send_date` de la **première notification**.
- **Date de mise à jour** : `send_date` de la **dernière notification**.

Ce modèle est similaire à un flux d'événements (*event sourcing*) : chaque appel API est un événement, et AMI calcule l'état final en les rejouant dans l'ordre.

### 5.2 L'URL externe (`item_external_url`) et la FranceConnexion Direct

Lorsqu'un usager clique sur la flèche d'une démarche dans AMI, il est redirigé vers `item_external_url`.

Si votre service est raccordé à la **FranceConnexion Direct**, cette URL peut pointer vers une page authentifiée de votre portail : AMI transmet un JWT signé permettant à votre backend de vérifier la provenance et de déclencher automatiquement le flux OIDC FranceConnect. Voir le document [france-connexion-direct.md](./france-connexion-direct.md) pour les détails d'intégration.

### 5.3 Cycle de vie d'une démarche

| `item_generic_status` | Onglet dans AMI | Description |
|---|---|---|
| `new` | En cours | Crée la démarche dans le suivi. |
| `wip` | En cours | Met à jour l'état de la démarche (statut, URL, description…). |
| `closed` | Passées | Clôture la démarche. Elle disparaît de l'onglet « En cours » et apparaît dans « Passées ». |

### 5.4 Comportement du `partner_id`

Le `partner_id` est automatiquement injecté par AMI à partir de vos credentials d'authentification. Vous n'avez pas à le fournir dans le payload. La démarche est identifiée par le triplet **`partner_id` + `item_type` + `item_id`**.

> **Note :** l'alimentation du suivi de démarches est conditionnée à une activation côté AMI pour votre `partner_id`. Contactez l'équipe AMI si vos notifications n'apparaissent pas dans « Mes démarches ».

>*EGV* Et assez vite on va pouvoir rajouter le cas des démarches multipartenaires, ou démarches imbriquées :).

---

## 6. Identifier le destinataire : `recipient_fc_hash`

Le champ `recipient_fc_hash` est le **hash déterministe des données pivot FranceConnect** de l'usager. Il est calculé par FranceConnect et transmis à AMI lors de l'authentification de l'usager.

>*EGV* En fait, FC ne donnent que les infos de l'identité pivot, et c'est au partenaire de le calculer (cf dernier § de [ce doc](https://docs.numerique.gouv.fr/docs/62800682-bcd1-49f0-9298-7b43221eb2ec/) )

Pour récupérer ce hash lors de vos tests :

1. Connectez-vous à l'application AMI avec le compte de test.
2. Allez dans **Paramètres → À propos → Nous contacter** : la page affiche un identifiant copiable.

>*EGV* Bon ça veut dire qu'il va falloir le remettre (a disparu dans le dernière maquette)

Pour vos intégrations en production, vous obtenez ce hash par le flux OIDC FranceConnect standard (claim `sub` ou champ pivot selon votre configuration FC).

>*EGV* cf ↑

---

## 7. Idempotence

L'API utilise un mécanisme `upsert, update or insert` basé sur **l'ensemble du payload** (hors `try_push`). Si vous envoyez deux fois exactement le même payload, la deuxième requête retourne `HTTP 200` et ne crée pas de doublon.

En revanche, si le moindre champ diffère (y compris `send_date`), une nouvelle notification est créée (`HTTP 201`).

**Recommandation :** utilisez un `send_date` unique par notification pour éviter des collisions involontaires entre deux appels distincts.

---

## 8. Réponses HTTP

| Code | Signification |
|---|---|
| `201 Created` | Notification créée. |
| `200 OK` | Notification déjà existante (payload identique). |
| `400 Bad Request` | Payload invalide (champs manquants ou incohérents). Le corps de la réponse détaille les erreurs par champ. |
| `401 Unauthorized` | Credentials incorrects ou absents. |
| `404 Not Found` | Usager inconnu (selon la configuration de l'environnement). |
| `5xx` | Erreur serveur transitoire. Ré-essayez avec un délai exponentiel. |

---

## 9. Exemple complet

### 9.1 Créer une démarche (statut `new`)

```bash
curl -X POST https://ami-back-staging.osc-fr1.scalingo.io/api/v1/notifications \
  -H "Authorization: Basic $(echo -n 'votre_partner_id:votre_secret' | base64)" \
  -H "Content-Type: application/json" \
  -d '{
    "recipient_fc_hash": "abc123def456...",
    "content_title": "Votre demande OTV a été enregistrée",
    "content_body": "Nous avons bien reçu votre demande de surveillance.",
    "send_date": "2026-06-11T14:00:00+02:00",
    "item_type": "OTV",
    "item_id": "ref-interne-partenaire-42",
    "item_status_label": "Brouillon",
    "item_generic_status": "new",
    "item_canal": "AMI",
    "item_external_url": "https://votre-portail.example/demarches/42"
  }'
```

**Résultat dans AMI :** une démarche apparaît dans l'onglet **En cours** avec le statut « Brouillon » et un lien vers votre portail.

### 9.2 Mettre à jour la démarche (statut `wip`)

```bash
curl -X POST https://ami-back-staging.osc-fr1.scalingo.io/api/v1/notifications \
  -H "Authorization: Basic $(echo -n 'votre_partner_id:votre_secret' | base64)" \
  -H "Content-Type: application/json" \
  -d '{
    "recipient_fc_hash": "abc123def456...",
    "content_title": "Votre demande OTV est en cours de traitement",
    "content_body": "Nos équipes examinent votre dossier.",
    "send_date": "2026-06-12T09:00:00+02:00",
    "item_type": "OTV",
    "item_id": "ref-interne-partenaire-42",
    "item_status_label": "En cours",
    "item_generic_status": "wip",
    "item_canal": "AMI",
    "item_external_url": "https://votre-portail.example/demarches/42/suivi"
  }'
```

**Résultat dans AMI :** la démarche reste dans **En cours**, le statut passe à « En cours » et l'URL est mise à jour.

### 9.3 Clôturer la démarche (statut `closed`)

```bash
curl -X POST https://ami-back-staging.osc-fr1.scalingo.io/api/v1/notifications \
  -H "Authorization: Basic $(echo -n 'votre_partner_id:votre_secret' | base64)" \
  -H "Content-Type: application/json" \
  -d '{
    "recipient_fc_hash": "abc123def456...",
    "content_title": "Votre demande OTV est terminée",
    "content_body": "Votre dossier a été traité. Merci de votre confiance.",
    "send_date": "2026-06-20T17:00:00+02:00",
    "item_type": "OTV",
    "item_id": "ref-interne-partenaire-42",
    "item_status_label": "Terminé",
    "item_generic_status": "closed",
    "item_canal": "AMI"
  }'
```

**Résultat dans AMI :** la démarche disparaît de **En cours** et apparaît dans **Passées** avec le statut « Terminé ».

---

## 10. Vérification de bout en bout

### Pré-requis

- Un [compte de test FC - AMI (sandbox)](https://github.com/france-connect/sources/blob/main/docker/volumes/fcp-low/mocks/idp/databases/citizen/base.csv).
- Un accès à l'environnement staging AMI.
- Vos credentials partenaire (`partner_id` + `partner_secret`) pour l'envoi de notification par API depuis l'environnement staging.
- Votre compte ProConnect promu par AMI pour l'envoi de notificationd depuis l'espace d'administration AMI de l'environnement staging.

### Procédure rapide par API

1. Récupérer le `recipient_fc_hash` du compte de test (voir [§ 6](#6-identifier-le-destinataire-recipient_fc_hash)).
2. Envoyer les trois appels successifs des exemples ci-dessus (§ 9.1, 9.2, 9.3).
3. Dans l'application AMI (connectée avec le compte de test) :
	- Après le premier appel : la démarche apparaît en page d'accueil et dans **En cours** avec le statut « Brouillon ».
	- Après le deuxième appel : le statut passe à « En cours » et l'URL est mise à jour.
	- Après le troisième appel : la démarche bascule dans **Passées** avec le statut « Terminé ».

### Critères de succès

- La démarche apparaît dans **Mes démarches → En cours** après le premier appel.
- Le statut et l'URL se mettent à jour après le deuxième appel.
- La démarche passe dans **Passées** après le troisième appel.
- En cliquant sur la flèche, l'usager est redirigé vers l'`item_external_url` que vous avez fournie.

### Procédure via l'espace web partenaire (sans API)

Si vous préférez tester sans appels API directs, l'équipe AMI peut vous donner accès à l'espace d'administration partenaire :

1. Demander à l'équipe AMI d'associer votre email ProConnect à un rôle admin (voir [CONTRIBUTING.md](https://github.com/numerique-gouv/ami-notifications-api/blob/main/CONTRIBUTING.md#agent-admin-space-espace-partenaire-ami)).
2. Se connecter à l'espace partenaire staging : `https://ami-back-staging.osc-fr1.scalingo.io/agent-admin/manage/notification/`
3. Utiliser le formulaire « Envoyer une notification » en renseignant les champs listés ci-dessus.

---

## 11. Limitations connues et points en évolution

- **V2 de l'API en cours de conception** : certains noms de champs seront renommés (ex. `item_external_url` → `content_link`). L'ancienne API restera supportée pendant une période de transition. Nous vous informerons de la date de dépréciation en avance.
- **Agenda** : les champs `item_milestone_start_date` et `item_milestone_end_date` ne sont pas encore exploités dans l'interface calendrier d'AMI. Ils sont définis dans le modèle et peuvent être envoyés sans effet visible pour l'instant.
>*EGV* J'ai l'espoir qu'il le seront d'ici la bêta. L'idée est de créer une échéance dans l'agenda.


- **Catalogue de démarches et description génériques** : la description de démarche affichée dans AMI est actuellement codée en dur pour certains partenaires (OTV). Un catalogue générique alimentable par l'API est prévu mais pas encore implémenté.
- **Listes d'étapes** : non implémentées. Fonctionnalité prévue permettant d'importer une liste de tâches depuis une page service-public.fr.
- **Pré-remplissage** : une version spécifique OTV existe ; la généralisation à tous les partenaires est en cours d'étude.
>*EGV* Du coup je ne parlerais pas de ces trois derniers points

- **Accès staging restreint** : l'environnement staging n'est accessible qu'aux IP déclarées. Contactez l'équipe AMI pour faire déclarer votre IP.
>*EGV* J'ai vu ça aussi dans l'autre doc. Ce n'est pas le cas si je ne me trompe pas.

---

## 12. Annexe: Glossaire

| Terme | Définition |
|---|---|
| **`partner_id`** | Identifiant du partenaire fourni par AMI. Automatiquement associé à chaque notification via les credentials d'authentification. |
| **`recipient_fc_hash`** | Hash déterministe des données pivot FranceConnect de l'usager. Permet à AMI d'identifier le destinataire sans stocker ses données d'identité. |
| **`item_generic_status`** | Statut normalisé AMI : `new` (création), `wip` (mise à jour), `closed` (clôture). Pilote l'affichage dans les onglets « En cours » / « Passées ». |
| **`item_status_label`** | Statut en texte libre défini par le partenaire, visible par l'usager (ex. « Brouillon », « En cours d'instruction »). |
| **Suivi de démarches** | Section « Mes démarches » de l'application AMI, alimentée par reconstruction à partir des notifications `item_*`. |
| **FCD** | FranceConnexion Direct: redirection fluide vers votre service sans réaffichage du bouton et de la mire FranceConnect. Voir [france-connexion-direct.md](./france-connexion-direct.md). |

---

## 13. Références

- [Envoi de notifications individuelles par API](https://ami-back-staging.osc-fr1.scalingo.io/schema/rapidoc#post-/api/v1/notifications) en vue multi-form-data pour avoir une documentation de chaque champ.
- [Envoi de notifications individuelles par l'espace d'administration partenaire](https://ami-back-staging.osc-fr1.scalingo.io/agent-admin/manage/notification/) avec l'envoi d'un formulaire web.
- [Documentation FranceConnexion Direct](./france-connexion-direct.md): intégration du raccourci d'authentification.
- [Besoin d'intégrations partenaires](https://docs.numerique.gouv.fr/docs/d47bae28-71cc-4b62-9e84-bd7027d6e462/)


> TODO: ça a été écrit au-dessus ?

Pour envoyer une notification contenant un lien vers votre portail, vous aurez besoin d'un compte partenaire chez AMI. Ce compte se demande à l'équipe AMI.
Il vous permettra d'utiliser l'API des serveurs d'AMI.

Bientôt, vous pourrez aussi demander la promotion d'un compte ProConnect de membres de votre équipe pour utiliser l'UI d'admin d'AMI et ainsi envoyer des notifications depuis un formulaire web, plutôt qu'une API.

**Anticipez aussi cette étape** : elle est purement administrative, mais elle peut prendre plusieurs jours.
