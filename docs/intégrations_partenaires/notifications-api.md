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

# Intégration partenaire : API de publication d'événement partenaire

> Statut : ** v1.0, diffusable**
> Dernière mise à jour : 22 juin 2026
> Public visé : équipes techniques d'un fournisseur de service partenaire d'AMI.

## 1. Vue d'ensemble

L'API de publication d'événements AMI permet à un fournisseur de service (FS) partenaire de :

1. **Notifier** un usager AMI (notification push sur mobile + entrée dans le centre de notifications).
2. **Alimenter le suivi de démarches** de l'usager dans l'application AMI, sans que l'usager ait à saisir quoi que ce
   soit.

Ces deux fonctions passent par **le même appel API** : `PUT /api/v2/event`.

---

## 2. Pré-requis

Pour publier un événement, vous aurez besoin d'un compte partenaire chez AMI.
Ce compte se demande à l'équipe AMI.
Il vous permettra d'utiliser l'API des serveurs d'AMI.

Bientôt, vous pourrez aussi demander la promotion d'un compte ProConnect de membres de votre équipe pour utiliser l'espace partenaire d'AMI et ainsi publier un événement depuis un formulaire web, en plus d'une API.

**Anticipez cette étape** : elle est purement administrative, mais elle peut prendre plusieurs jours.

---

## 3. Authentification

L'API utilise **HTTP Basic Authentication** avec les identifiants partenaire :

```
Authorization: Basic base64(<partner_id>:<partner_secret>)
```

Les valeurs de `partner_id` et `partner_secret` vous sont fournies par l'équipe AMI lors de l'intégration.

---

## 4. Endpoint

```
PUT /api/v2/event
Content-Type: application/json
Authorization: Basic <credentials>
```

**URL de base par environnement :**

| Environnement | URL de base                                    |
|---------------|------------------------------------------------|
| Staging       | `https://ami-back-staging.osc-fr1.scalingo.io` |
| Production    | fournie par l'équipe AMI                       |

La documentation Swagger interactive est disponible à l'adresse `/schema/rapidoc` (vue *multi-form-data* recommandée
pour lire la description de chaque champ).
L'url d'envoi de notification depuis l'environnement staging est
donc : https://ami-back-staging.osc-fr1.scalingo.io/schema/rapidoc#post-/api/v2/event

---

## 5. Données transmises

Un événement décrit ce qui s'est passé chez un fournisseur de service (FS).
Nous avons deux types d'événements, en simplifiant, ceux qui sont pour information et ceux qui sont liés à une démarche.

Certains événements sont seulement informatifs et sont notifiés à l'usager.
Ils permettent de communiquer une actualité, en dehors de tout contexte, de toute procédure ou démarche en cours.
Pour diffuser ce type d'événements, vous alimenterez tout ou partie des [champs de notification](#51-champs-de-notification) définis ci-dessous.

D'autres événements sont associés à une démarche, une activité, une procédure, une transaction en cours.
Ces événements décrivent un changement dans une démarche ou une procédure en cours.
L'usager n'a pas obligatoirement une action à réaliser en retour, la démarche est "l'action" en cours.
Pour diffuser ce type d'événements, vous alimenterez aussi tout ou partie des champs de notification, mais aussi des [champs de démarche](#52-champs-de-démarche-item_) décrivant la démarche concernée et son évolution

### 5.1 Champs de notification

Ces champs alimentent chaque notification dans le centre de notifications AMI et, le cas échéant, la notification push sur mobile.
Les mobiles physiques ios et android ainsi que les mobiles virtuels android seuls sont capables de recevoir les "notifications push".
Les mobiles virtuels ios ne sont pas visibles des systèmes de notifications Apple et ne reçoivent pas les "notifications push".
Tous les mobiles recoivent les événements dans le centre de notifications de l'application AMI, quelles soient "push" ou non.

| Champ                  | Type              | Requis  | Description                                                                                                                                                                                                                    |
|------------------------|-------------------|---------|--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `recipient_fc_hash`    | string            | **oui** | Hash déterministe des données pivot FranceConnect de l'usager destinataire. Voir [§ 6](#6-identifier-le-destinataire-recipient_fc_hash).                                                                                       |
| `content_title`        | string            | **oui** | Titre de la notification (visible dans le centre de notifications et dans la push).                                                                                                                                            |
| `content_body`         | string            | **oui** | Corps de la notification (visible dans le centre de notifications et dans la push).                                                                                                                                            |
| `content_private_body` | string            | non     | Suite du corps de la notification, **invisible en push** (il n'est pas envoyé dans le push), mais bien visible à la suite de `content_body` dans le centre de notifications AMI.                                               |
| `content_subheading`   | string            | non     | Sous-titre du message, signataire, typiquement le service instructeur de la démarche ou le motif de rendez-vous. Par défaut : le nom du partenaire appelant l'API (sauf dans le cas d'une sous démarche, cf plus bas, où c'est l'item_id). |
| `content_icon`         | string            | non     | Nom technique d'une icône DSFR (ex. `fr-icon-notification-3-line`). Par défaut : icône du partenaire déclarée dans AMI.                                                                                                        |
| `content_link`         | string            | non     | URL vers la page de la démarche ou d'information sur votre portail. Permet à l'usager de revenir sur votre service depuis AMI. Voir [§ 5.2](#52-lurl-externe-item_external_url-et-la-franceconnexion-direct).                  |
| `event_date`           | datetime ISO 8601 | **oui** | Date d'émission côté partenaire (ex. `2026-06-11T14:30:00+02:00`). **Doit être unique entre deux appels** : ce champ entre dans la clé d'idempotence (voir [§ 7](#8-idempotence)).                                             |
| `valid_until`          | datetime ISO 8601 | non     | Date de péremption après laquelle il n'est plus utile d'envoyer cette notification (ex. `2026-06-11T14:30:00+02:00`).                                                                                                          |
| `try_push`             | boolean           | non     | Si `true` (ou indéfini, vide), AMI tente d'envoyer une notification push sur les terminaux de l'usager s'il est enregistré. Mettre à `false` pour publier dans le centre de notifications sans émettre de "notification push". |

### 5.2 Champs de démarche (`item_*`)

Ces champs sont **optionnels**, mais si vous en renseignez au moins un, les quatre champs marqués **\*** deviennent **obligatoires ensemble**.

Cas des champs parents : les trois champs `item_parent_*` sont aussi **optionnels**, car votre démarche peut ne pas avoir de démarche liée ou parente, mais si vous remplissez l'un d'eux, ils deviennent **obligatoires ensemble**.
Ces champs sont marqués **\+++

Leur présence crée ou met à jour une entrée dans le **suivi de démarches** de l'usager (écran « Mes démarches »).

| Champ                       | Type              | Requis si item | Description                                                                                                                                                                             |
|-----------------------------|-------------------|----------------|-----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `item_type`                 | string            | **\***         | Type de la démarche, champ libre défini par le partenaire (ex. `OTV` pour Opération Tranquillité Vacances). Ce type sert à regrouper les notifications d'une même famille de démarches. |
| `item_id`                   | string            | **\***         | Identifiant unique de la démarche en cours (comme un numéro de dossier) dans le référentiel partenaire.                                                                                 |
| `item_parent_partner_id`    | string            | **\+++         | Identifiant du partenaire émetteur de la démarche parente dans le cas de démarche multi-partenaire (comme un déménagement)                                                              |
| `item_parent_type`          | string            | **\+++         | Type de la démarche parente (cf `item_type`)                                                                                                                                            |
| `item_parent_id`            | string            | **\+++         | Identifiant unique de la démarche parente dans le référentiel partenaire (cf `item_id`)                                                                                                 |
| `item_status_label`         | string            | **\***         | Libellé de statut affiché à l'usager (ex. `Brouillon`, `En cours`, `Terminé`). Généralement, le nom de l'étape selon le partenaire.                                                     |
| `item_generic_status`       | enum              | **\***         | Statut normalisé côté AMI. Valeurs autorisées : `new` (création), `wip` (mise à jour), `closed` (clôture). Pilote le comportement de l'application.                                     |
| `item_canal`                | string            | non            | Canal d'origine de la démarche (ex. `AMI`, `PSL`). Sert à la mesure d'impact pour le partenaire.                                                                                        |
| `item_milestone_start_date` | datetime ISO 8601 | non            | Date de début de la période liée à la démarche (eg. début de surveillance OTV).                                                                                                         |
| `item_milestone_end_date`   | datetime ISO 8601 | non            | Date de fin de la période. Doit être postérieure à `item_milestone_start_date` (eg. date de fin de surveillance OTV).                                                                   |

> A noter, les champs `item_milestone_` donnent des dates de début et de fin d'événements et leurs présences sont indépendantes l'une de l'autre.
> Elles permettent d'afficher la démarche dans l'agenda AMI de l'usager.

---

## 6. Comportement dans l'application AMI

AMI reconstruit l'état courant d'une démarche **à partir de l'ensemble des notifications** qui partagent le même triplet `(partner_id, item_type, item_id)`, triées par date de création.
Ce modèle est similaire à un flux d'événements (*event sourcing*) : chaque appel API est un événement, et AMI calcule l'état final en les rejouant dans l'ordre.

### 6.1 Comportement du `partner_id`

Le `partner_id` est automatiquement injecté par AMI à partir de vos credentials d'authentification. Vous n'avez pas à le fournir dans le payload.

> **Note :** l'alimentation du suivi de démarches est conditionnée à une activation côté AMI pour votre `partner_id`.
> Contactez l'équipe AMI si vos notifications n'apparaissent pas dans « Mes démarches ».

### 6.2 Comportement des champs parents

Les champs `item_parent_partner_id`, `item_parent_type` et `item_parent_id` identifient la démarche parente unique.
Ces champs sont inutiles quand votre démarche est une démarche seule, autonome, bref quand elle ne fait pas partie d'un groupe de démarches liées.
Par exemple, une démarche de changement de coordonnées implique des démarches de changement de coordonnées chez de nombreux partenaires.

Lorsque vous définissez un de ces champs, les trois doivent être définis.
Définir ces champs permet de rattacher une démarche liée, imbriquée à sa démarche parente.

Si votre événement désigne une démarche parente valide et inconnue, elle est créée à l'état `wip`.
Si votre démarche est rattachée à une parente et qu'un nouvel événement ne désigne pas de démarche parente, votre démarche reste attachée à sa parente.

### 6.3 Cycle de vie d'une démarche

| `item_generic_status` | Onglet dans AMI | Description                                                                          |
|-----------------------|-----------------|--------------------------------------------------------------------------------------|
| `new`                 | En cours        | Crée la démarche dans le suivi.                                                      |
| `wip`                 | En cours        | Permet un suivi en mettant à jour l'état de la démarche (statut, URL, description…). |
| `closed`              | Passées         | Clôture la démarche.                                                                 |

### 6.4 Le suivi de démarches : fonctionnement par événements

Conséquences pratiques :

- **Titre et description** : pris sur la **dernière notification** de la série.
- **Statut affiché** (`item_status_label`) : pris sur la **dernière notification**.
- **URL externe** (`content_link`) : pris sur la **dernière notification qui en contient une**. Vous pouvez donc envoyer une mise à jour
  de statut sans répéter l'URL : AMI conserve la dernière URL connue.
- **Date de création** de la démarche dans AMI : `event_date` de la **première notification**.
- **Date de mise à jour** : `event_date` de la **dernière notification**.


### 6.5 L'URL externe (`content_link`) et la FranceConnexion Direct

Lorsqu'un usager clique sur la flèche d'une démarche dans AMI, il est redirigé vers `content_link`.

Si votre service est raccordé à la **FranceConnexion Direct**, cette URL peut pointer vers une page authentifiée de votre portail.
AMI transmettra un JWT signé permettant à votre backend de vérifier la provenance de l'appel et de déclencher automatiquement le flux OIDC FranceConnect.


---

## 7. Identifier le destinataire : `recipient_fc_hash`

Le champ `recipient_fc_hash` est le **hash déterministe des données pivot FranceConnect (FC)** de l'usager.
Il est calculé par les partenaires à partir des données transmises par FC lors de l'authentification de l'usager.

### 7.1 Calcul du recipient_fc_hash

C'est le sha256 de la concaténation (sans séparateur) des données pivot renvoyées telles quelles par FranceConnect dans cet ordre : given_name, family_name, birthdate, gender, birthplace, birthcountry. Si une information n'existe pas, elle est simplement ignorée ("").

Implémentation de référence :

```python
def fc_ami_hash(
	given_name: str,
	family_name: str,
	birthdate: str,
	gender: str,
	birthplace: str,
	birthcountry: str,
) -> str:
	recipient_fc_hash = hashlib.sha256()
	recipient_fc_hash.update(
		f"{given_name}{family_name}{birthdate}{gender}{birthplace}{birthcountry}".encode("utf-8")
	)
	return recipient_fc_hash.hexdigest()
```

Quelques exemples pour les utilisateurs de
test [sont données ici](https://github.com/numerique-gouv/ami-notifications-api/blob/main/ami/user/tests/test_results.csv).

Si une information n'est pas renvoyée par FranceConnect (exemple birthplace pour les personnes nées à l'étranger), passer "" (ce qui revient à ignorer le paramètre dans la concaténation)

### 7.2 Connaitre le recipient_fc_hash depuis AMI

Dans l'application AMI, après la FranceConnexion, cliquer sur votre avatar (en haut à gauche, la première lettre de votre prénom).
Vous pourrez alors cliquer sur "Nous contacter" et choisir "Par email".
Dans l'email, vous trouverez l'identifiant du compte que vous utilisez.

---

## 8. Idempotence

L'API utilise un mécanisme `upsert, update or insert` basé sur **l'ensemble du payload**.
Si vous envoyez deux fois exactement le même payload, la deuxième requête retourne `HTTP 200` et ne crée pas de doublon.

En revanche, si le moindre champ diffère (y compris `event_date`), une nouvelle notification est créée (`HTTP 201`).

**Recommandation :** utilisez un `event_date` unique par notification pour éviter des collisions involontaires entre deux appels distincts.

---

## 9. Réponses HTTP

| Code               | Signification                                                                                              |
|--------------------|------------------------------------------------------------------------------------------------------------|
| `201 Created`      | Notification créée.                                                                                        |
| `200 OK`           | Notification déjà existante (payload identique).                                                           |
| `400 Bad Request`  | Payload invalide (champs manquants ou incohérents). Le corps de la réponse détaille les erreurs par champ. |
| `401 Unauthorized` | Credentials incorrects ou absents.                                                                         |
| `404 Not Found`    | Usager inconnu (selon la configuration de l'environnement).                                                |
| `5xx`              | Erreur serveur transitoire. Ré-essayez avec un délai exponentiel.                                          |

---

## 10. Exemple complet

### 10.1 Créer une démarche (statut `new`)

```bash
curl -X PUT https://ami-back-staging.osc-fr1.scalingo.io/api/v2/event \
  -H "Authorization: Basic $(echo -n 'votre_partner_id:votre_secret' | base64)" \
  -H "Content-Type: application/json" \
  -d '{
    "recipient_fc_hash": "abc123def456...",
    "content_title": "Votre demande OTV a été enregistrée",
    "content_body": "Nous avons bien reçu votre demande de surveillance.",
    "content_link": "https://votre-portail.example/demarches/42"
    "event_date": "2026-06-11T14:00:00+02:00",
    "item_type": "OTV",
    "item_id": "ref-interne-partenaire-42",
    "item_status_label": "Brouillon",
    "item_generic_status": "new",
    "item_canal": "AMI",
  }'
```

**Résultat dans AMI :** une démarche apparaît dans l'onglet **En cours** avec le statut « Brouillon » et un lien vers votre portail.

### 10.2 Mettre à jour la démarche (statut `wip`)

```bash
curl -X PUT https://ami-back-staging.osc-fr1.scalingo.io/api/v2/event \
  -H "Authorization: Basic $(echo -n 'votre_partner_id:votre_secret' | base64)" \
  -H "Content-Type: application/json" \
  -d '{
    "recipient_fc_hash": "abc123def456...",
    "content_title": "Votre demande OTV est en cours de traitement",
    "content_body": "Nos équipes examinent votre dossier.",
    "content_link": "https://votre-portail.example/demarches/42/suivi"
    "event_date": "2026-06-12T09:00:00+02:00",
    "item_type": "OTV",
    "item_id": "ref-interne-partenaire-42",
    "item_status_label": "En cours",
    "item_generic_status": "wip",
    "item_canal": "AMI",
  }'
```

**Résultat dans AMI :** la démarche reste dans **En cours**, le statut passe à « En cours » et l'URL est mise à jour.

### 10.3 Clôturer la démarche (statut `closed`)

```bash
curl -X PUT https://ami-back-staging.osc-fr1.scalingo.io/api/v2/event \
  -H "Authorization: Basic $(echo -n 'votre_partner_id:votre_secret' | base64)" \
  -H "Content-Type: application/json" \
  -d '{
    "recipient_fc_hash": "abc123def456...",
    "content_title": "Votre demande OTV est terminée",
    "content_body": "Votre dossier a été traité. Merci de votre confiance.",
    "event_date": "2026-06-20T17:00:00+02:00",
    "item_type": "OTV",
    "item_id": "ref-interne-partenaire-42",
    "item_status_label": "Terminé",
    "item_generic_status": "closed",
    "item_canal": "AMI"
  }'
```

**Résultat dans AMI :** la démarche apparaît avec le statut « Terminé ».

---

## 11. Vérification de bout en bout

### 11.1 Pré-requis

Un [compte de test FC - AMI (sandbox)](https://github.com/france-connect/sources/blob/main/docker/volumes/fcp-low/mocks/idp/databases/citizen/base.csv).

- Un accès à l'environnement staging AMI.
- Vos credentials partenaire (`partner_id` + `partner_secret`) pour l'envoi de notification par API depuis l'environnement staging.
- **Optionnel :** Votre compte ProConnect promu par AMI pour l'envoi de notification depuis l'espace d'administration AMI de l'environnement staging.


### 11.2 Procédure rapide par API

1. Récupérer le `recipient_fc_hash` du compte de test (voir [§ 6](#7-identifier-le-destinataire--recipient_fc_hash)).
2. Envoyer les trois appels successifs des exemples ci-dessus (§ 9.1, 9.2, 9.3).
3. Dans l'application AMI (connectée avec le compte de test) :
	- Après le premier appel : la démarche apparaît en page d'accueil et dans **En cours** avec le statut « Brouillon ».
	- Après le deuxième appel : le statut passe à « En cours » et l'URL est mise à jour.
	- Après le troisième appel : la démarche obtient le statut « Terminé ».

### 11.3 Procédure via l'espace web partenaire (sans API)

> L'espace partenaire sera disponible en Q4 2026.

Si vous préférez tester sans appels API directs, l'équipe AMI peut vous donner accès à l'espace d'administration partenaire :

1. Demander à l'équipe AMI d'associer votre email ProConnect à un rôle admin (
   voir [CONTRIBUTING.md](https://github.com/numerique-gouv/ami-notifications-api/blob/main/CONTRIBUTING.md#agent-admin-space-espace-partenaire-ami)).
2. Se connecter à l'espace partenaire staging :
   `https://ami-back-staging.osc-fr1.scalingo.io/agent-admin/manage/notification/`
3. Utiliser le formulaire « Envoyer une notification » en renseignant les champs listés plus haut dans ce document.

---

## 12. Limitations connues et points en évolution

- **Agenda** : les champs `item_milestone_start_date` et `item_milestone_end_date` ne sont pas encore exploités dans l'interface agenda d'AMI.
Ils sont définis dans le modèle et peuvent être envoyés sans effet visible pour l'instant.

---

## 13. Annexe: Glossaire

| Terme                     | Définition                                                                                                                                                                             |
|---------------------------|----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| **`partner_id`**          | Identifiant du partenaire fourni par AMI. Automatiquement associé à chaque notification via les credentials d'authentification.                                                        |
| **`recipient_fc_hash`**   | Hash déterministe des données pivot FranceConnect de l'usager. Permet à AMI d'identifier le destinataire sans stocker ses données d'identité.                                          |
| **`item_generic_status`** | Statut normalisé AMI : `new` (création), `wip` (mise à jour), `closed` (clôture). Pilote l'affichage dans les onglets « En cours » / « Passées ».                                      |
| **`item_status_label`**   | Statut en texte libre défini par le partenaire, visible par l'usager (ex. « Brouillon », « En cours d'instruction »).                                                                  |
| **Suivi de démarches**    | Section « Mes démarches » de l'application AMI, alimentée par reconstruction à partir des notifications `item_*`.                                                                      |
| **FCD**                   | FranceConnexion Direct: redirection fluide vers votre service sans réaffichage du bouton et de la mire FranceConnect. Voir [france-connexion-direct.md](./france-connexion-direct.md). |

---

## 14. Références

- [Envoi de notifications individuelles par API](https://ami-back-staging.osc-fr1.scalingo.io/schema/rapidoc#put-/api/v2/event)
  en vue multi-form-data pour avoir une documentation de chaque champ.
- La branche du endpoint V2 en développement : [la branche 935](https://ami-back-staging-pr935.osc-fr1.scalingo.io/schema/rapidoc#put-/api/v2/event)
- [Envoi de notifications individuelles par l'espace d'administration partenaire](https://ami-back-staging.osc-fr1.scalingo.io/agent-admin/manage/notification/)
  avec l'envoi d'un formulaire web.
- [Documentation FranceConnexion Direct](./france-connexion-direct.md): intégration du raccourci d'authentification.
- [Besoin d'intégrations partenaires](https://docs.numerique.gouv.fr/docs/d47bae28-71cc-4b62-9e84-bd7027d6e462/)
