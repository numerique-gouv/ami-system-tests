# Parcours partenaires — TODO list E2E

Liste des parcours partenaires identifiés à partir du DAT AMI (`../ami-dat/content/`), classés selon l'acteur. À couvrir progressivement par des tests E2E (WebdriverIO).

Légende statut :
- [ ] non implémenté
- [~] en cours / partiellement couvert
- [x] couvert par un test E2E

Sources principales : `1.1 Description du système`, `3.1 Architecture fonctionnelle`, `3.2 Architecture applicative`, `3.5 Interconnexions`, `5.1 Identification, authentification et gestion des droits d'accès`.

---

## 1. Parcours « partenaire seul » — Espace Partenaire (back-office)

Acteur : agent AMI ou agent partenaire authentifié via **ProConnect**. Pas d'usager final dans la boucle.

### 1.1 Authentification et habilitation

- [ ] Première connexion à l'Espace Partenaire via ProConnect (redirection, retour, session ouverte)
- [ ] Connexion ProConnect d'un agent **sans rôle** → affichage « Demandez l'accès à un administrateur », aucune fonctionnalité accessible
- [ ] Connexion ProConnect d'un agent **avec rôle** → accès à la HomePage connectée
- [ ] Déconnexion / invalidation de session
- [ ] Tentative d'accès direct à une URL protégée sans session → redirection vers la page de connexion

### 1.2 Administration des rôles (rôle `Administrateur·ice`)

- [ ] Attribution d'un rôle (`Administrateur·ice`, `Notification`, `Support`) à un agent
- [ ] Modification d'un rôle existant
- [ ] Retrait d'un rôle
- [ ] Ajout d'un autre administrateur ou administratrice
- [ ] Vérification de la trace d'action (date, agent à l'origine, agent cible, intitulé) après attribution / modification / retrait
- [ ] Comportement attendu en cas de tentative de retrait de son propre rôle d'administrateur (à préciser)

### 1.3 Notifications individuelles (rôle `Notification`)

- [ ] Envoi d'une notification unitaire à un usager (depuis l'Espace Partenaire) → réception côté app AMI
- [ ] Échec d'envoi (Numéro d'identification inconnu, payload invalide)
- [ ] Limites d'accès : un rôle `Support` ne voit pas l'action d'envoi

### 1.4 Consultation et statistiques (rôle `Support`)

- [ ] Accès à la page d'accueil connectée
- [ ] Accès aux pages de statistiques
- [ ] Accès à la page « Usager 360 »
- [ ] Vérification de l'absence des actions réservées (administration de rôles, suppression de données)

### 1.5 RGPD — suppression de données usager (rôle `Administrateur·ice`)

- [ ] Suppression des données d'un usager identifié
- [ ] Vérification de la disparition côté Usager 360 / statistiques
- [ ] Vérification de la trace d'action

### 1.6 À préciser (hors périmètre stabilisé du DAT)

- [ ] Paramétrage de contenus partenaires (quand ouvert aux partenaires)
- [ ] Paramétrage de règles `Rules as Code` (quand ouvert aux partenaires)
- [ ] Gestion des conventions / CGU partenaires (à finaliser)

---

## 2. Parcours « partenaire + usager final » — démarches partenaires intégrées

Acteur principal : usager final dans l'app AMI. Le partenaire intervient via webview, API d'entrée ou retour de démarche.

### 2.1 Catalogue et contenus partenaires (avant lancement de démarche)

- [ ] Récupération des contenus de catalogue (Service Public, DN) après FranceConnexion → affichage personnalisé
- [ ] Cas dégradé : indisponibilité d'un fournisseur de catalogue (Service Public, DN)
- [ ] Affichage d'un contenu partenaire personnalisé en fonction des données API Particulier

### 2.2 Lancement d'une démarche partenaire (webview intégrée)

- [ ] Tap sur une démarche partenaire → reconnexion silencieuse via AMI-FI **avant** la redirection
- [ ] Reconnexion silencieuse réussie → ouverture de la démarche en webview intégrée
- [ ] Reconnexion silencieuse échouée → cinématique à appliquer (à préciser dans DAT 5.1)
- [ ] URL partenaire **présente** dans la liste blanche → ouverture en webview intégrée
- [ ] URL partenaire **absente** de la liste blanche → ouverture dans le navigateur externe du terminal
- [ ] Le bouton retour natif fonctionne correctement dans la webview partenaire

### 2.3 FranceConnexion directe chez le partenaire

- [ ] Partenaire qui implémente la FranceConnexion directe (paramètres `idp_hint=AMI-FI`, `prompt=login`) → l'usager n'est pas reconfronté à la page d'information FranceConnect
- [ ] Partenaire qui **n'implémente pas** la FranceConnexion directe → parcours FranceConnect standard fonctionne quand même
- [ ] Cas session FranceConnect expirée côté partenaire malgré la reconnexion silencieuse

### 2.4 Préremplissage de démarche

- [ ] Préremplissage via JWT signé par AMI, chiffré avec la clé publique du partenaire (déchiffrement et lecture OK côté partenaire)
- [ ] Préremplissage via URL HTTPS (modalité simplifiée type DN)
- [ ] Vérification que les données préremplies correspondent à ce qui était attendu (sans fuite supplémentaire)
- [ ] Cas où aucun préremplissage n'est prévu pour la démarche → ouverture vierge

### 2.5 Retour de démarche partenaire vers AMI

- [ ] Fin de démarche partenaire → message de retour via `postMessage` entre frontaux
- [ ] Vérification de la signature du message de retour (cible)
- [ ] Mise à jour de l'historique / suivi de démarches dans AMI après le retour
- [ ] Cas d'abandon de démarche (l'usager ferme la webview avant la fin)
- [ ] Cas message de retour mal formé ou non signé → comportement de rejet

### 2.6 Recherche de démarche générique (flux sortant léger)

- [ ] Recherche de démarche avec critère de contexte (par ex. localité) → appel sortant vers un tiers
- [ ] Vérification de la minimisation des données transmises (périmètre à préciser dans DAT 3.5)

---

## 3. Parcours « partenaire → AMI » — notifications transactionnelles

Acteur : back-end partenaire qui appelle l'API de demande de notification exposée par AMI API. Vérification côté usager dans l'app.

### 3.1 Demande de notification entrante

- [ ] Appel partenaire en HTTPS + HTTP Basic Auth → notification créée côté AMI
- [ ] Rattachement au bon usager via le `Numéro d'identification` (dérivé FranceConnect)
- [ ] Auth Basic invalide → 401 (sans création de notification)
- [ ] `Numéro d'identification` inconnu → erreur explicite (sans création de notification)
- [ ] Payload invalide → 400
- [ ] Comportement attendu en cas d'IP non autorisée (selon évolution du filtrage)

### 3.2 Diffusion vers le terminal usager

- [ ] Usager ayant **accepté** les notifications push, terminal enrôlé FCM → réception du push natif (titre + corps)
- [ ] Usager **n'ayant pas accepté** les notifications push → notification visible uniquement dans l'historique in-app
- [ ] App ouverte → réception via websocket et affichage temps réel
- [ ] App fermée → réception via FCM, ouverture sur la bonne page après tap

### 3.3 Historique et suivi de démarches

- [ ] Une notification partenaire reçue alimente l'historique des événements de l'usager
- [ ] Plusieurs notifications successives sur la même démarche → ordonnancement correct
- [ ] Suppression RGPD côté Espace Partenaire → disparition des notifications associées

---

## 4. Parcours transverses à surveiller en compatibilité descendante

Spécifique au critère « apps natives N-1 / N-2 vs webapp à jour » du dépôt.

- [ ] Démarche partenaire ouverte depuis une app native N-1 → préremplissage et retour OK
- [ ] FranceConnexion silencieuse depuis une app native N-2 → fallback ou message clair si non supportée
- [ ] Notification entrante reçue par une app native N-2 → affichage et historique OK

---

## Hors périmètre (rappel DAT 1.1)

Les fonctionnalités ci-dessous **ne sont pas** à couvrir dans ce backlog tant qu'elles ne sont pas livrées :

- Tchat
- Authentification forte complémentaire
- Usages à destination des professionnels