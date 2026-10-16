> **🚫 Hors périmètre — décision du 2026-10-15.** L'Espace Partenaire sort de ce dossier ; ce fichier est conservé comme **archive** de ce que la réunion en disait. Rien ici n'a été observé ni implémenté, et aucun sous-agent n'y travaille.

# Espace Partenaire — scénarios à implémenter

Source : réunion du 2026-10-06 (transcript 13:42, 22:56–23:23, 30:47–32:31, 31:23–35:35, 36:37–37:09, 46:51–49:07).
**Statut : 📝 à implémenter — rien n'a été observé.** Le modèle (`docs/process/model/apps/espace-partenaire.yaml`) le dit : « AUCUN écran n'a été observé », tout vient d'intitulés de tests squelettes. Chaque libellé ci-dessous vient donc de la **réunion** (Kevin montrait l'écran en visio), pas d'une exploration : tout est **non confirmé** jusqu'à une session d'exploration.

## Prérequis à lever avant d'implémenter (non confirmé)

- **Authentification** : l'Espace Partenaire se connecte via ProConnect (agent), pas via FranceConnect. Le moyen de la piloter n'est pas décidé (modèle : « le moyen de la piloter n'est pas décidé »). Il faut un compte agent de test avec les bons rôles.
- **Rôles** : l'envoi de notifications, la gestion du catalogue, des listes d'étapes, des pages et des partenaires dépendent de rôles (« Administrateur·ice, Notification, Support » d'après le modèle). Lesquels pour chaque scénario : à relever.
- **Environnement** : préprod (comme le reste). L'URL de l'Espace Partenaire de préprod est à relever.
- **Hors de portée des tests** : la whitelist de partenaires n'est active que si une variable est posée sur Scalingo (transcript 47:28) — non pilotable depuis un test.

Les scénarios EP1 à EP5 chaînent l'Espace Partenaire **et** l'application AMI : ils ont besoin d'une session navigateur par application (deux fenêtres) ou d'une reconnexion à la SPA entre les deux.

### EP1 — Une page légale modifiée dans l'Espace Partenaire est reflétée dans l'application
Source : 30:47–32:31. Seules les **sections** des pages « Données personnelles » et « Accessibilité » sont modifiables (on ne crée pas de page, 31:38–32:06). Cache de 5 minutes côté application, contourné par une déconnexion / reconnexion (32:31–33:00).
Étant donné un agent connecté à l'Espace Partenaire, sur la page « Données personnelles » **non confirmé : intitulé**
Quand il ajoute une section de titre horodaté `E2E-<horodatage>`
Et qu'un usager se déconnecte puis se reconnecte à l'application
Et qu'il ouvre Plus > Données personnelles et sécurité
Alors la liste des sections contient `E2E-<horodatage>`
Quand l'agent supprime la section
Et que l'usager se reconnecte
Alors la section n'est plus listée
Restauration : section supprimée dans tous les cas (`after()`).
Variante à valider : sans reconnexion, la section n'apparaît qu'après ≈ 5 min — **ne pas la tester telle quelle** (attente de 5 min, jugée fragile ; à décider).

### EP2 — Réinitialiser les données d'un usager vide sa personnalisation
Source : 13:36–14:09 (« l'admin des partenaires, si je supprime l'utilisateur, ça réinitialise tout »). La réinitialisation fait réapparaître les éléments d'agenda supprimés (vacances, jours fériés) et supprime la personnalisation.
Étant donné un usager qui a supprimé un élément fixe de son agenda (voir S10.2 dans [zones-agenda.md](zones-agenda.md)) et décoché « Zone B »
Quand un agent supprime les données de cet usager depuis l'Espace Partenaire (page « Suppression de données d'un usager (RGPD) », d'après le modèle)
Et que l'usager se reconnecte
Alors l'élément supprimé réapparaît dans l'agenda
Et ses zones scolaires sont revenues à l'état initial **non confirmé : à relever**
**Risque** : destructeur pour le compte partagé (consentements, démarches). À ne jouer que sur un compte dédié — décision à prendre.

### EP3 — Une démarche ajoutée au catalogue depuis l'Espace Partenaire apparaît dans l'application avec un lien valide
Source : 24:31–24:50 (saisie à la main, « pas à l'abri d'une erreur dans l'URL »), 36:37–37:09 (champs : partenaire, item type = code de la démarche présent dans l'URL, titre, service, description, URL, connexion silencieuse, restriction à des utilisateurs).
Étant donné un agent sur « Gestion du catalogue de démarches » **non confirmé : intitulé**
Quand il ajoute une démarche de titre `E2E-<horodatage>` avec une URL valide connue
Et qu'un usager recharge Services > Démarches et outils (après reconnexion, cache)
Alors une carte `E2E-<horodatage>` est listée
Quand l'usager l'ouvre
Alors la cible répond avec un statut < 400 (même critère que S1.1)
Quand l'agent supprime la démarche
Alors elle n'est plus listée après reconnexion
Restauration : démarche supprimée dans tous les cas.

### EP4 — Une liste d'étapes publiée est affichable dans l'application
Source : 22:56–23:23 (« je publie ma liste d'étapes et je vérifie dans l'application qu'elle est affichable »), 33:26–36:37 (le JSON est généré depuis un XML, `external ID` ≈ `internal ID` de l'API, **non clarifié**).
Étant donné un agent sur « Gestion des listes d'étapes » **non confirmé : intitulé**
Quand il ajoute une liste d'étapes de test (JSON valide, `external ID` horodaté)
Alors elle apparaît dans la liste de l'Espace Partenaire
Quand un usager ouvre Services > Trouver de l'aide
Alors la liste est présente et s'ouvre sans erreur
Restauration : liste supprimée.
**Dépend de** : savoir où l'application affiche une liste ajoutée à la main (transcript 34:32 : elle apparaît dans « Comment faire si… »), et de la clarification `external ID` / `internal ID` (point ouvert de la réunion).

### EP5 — Envoyer une notification depuis l'Espace Partenaire
Source : 47:44–49:07. Aujourd'hui seul AMI peut envoyer (« les partenaires n'ont pas encore besoin d'envoyer ») ; la notification n'est reçue que si le **consentement AMI** est actif (48:18–48:39).
Étant donné un usager avec le consentement AMI actif, inbox ouverte
Quand un agent envoie une notification de titre `E2E-<horodatage>` à cet usager depuis la page « Notifications unitaires (envoi) » (modèle)
Alors l'inbox de l'usager affiche `E2E-<horodatage>`
Étant donné le même usager **sans** consentement AMI
Quand l'agent envoie une autre notification
Alors elle n'est pas reçue **non confirmé : cohérence avec S5.1 de [consentement.md](consentement.md)**
Variante : le test par l'API reste utile car « il teste l'API pour les partenaires » (48:58) — les deux chemins sont complémentaires, pas substituables.

### EP6 — Accès à l'Espace Partenaire (déjà décrit dans les squelettes `src/tests/next/`)
Étant donné un agent sans rôle
Quand il se connecte via ProConnect
Alors il voit « Demandez l'accès à un administrateur »
Source : intitulés du modèle (`access-request`), pas la réunion. **Non confirmé** — listé pour mémoire, hors des sujets de la réunion.
