# 10-06 Réunion : Stratégie de tests et gestion de l'espace partenaire

> **Date :** 2026-10-06 14:12:27
> **Lieu :** [Insérer le lieu]
> **Participants :** [Nicolas Fedou] [Kevin]
## Notes de réunion
### Stratégie et périmètre des tests
#### Authentification, passkeys et consentement
- Les tests existants gèrent l'authentification via `before each` et `before`. Un nouveau parcours pour les "passkeys" doit être ajouté, incluant les options "ajouter une clé" ou "peut-être plus tard".
- Il est crucial de tester le mécanisme de consentement :
  - Un scénario doit vérifier la page d'accueil pour un utilisateur sans consentement activé (le bouton "Je veux suivre mes démarches" doit être visible).
  - Inversement, si au moins un consentement est actif (parfois via d'autres plateformes comme DN ou SP), ce bouton ne doit pas apparaître.
  - La synchronisation des "switchs" de consentement avec le backend doit être vérifiée.
- Le cycle de vie des notifications lié au consentement nécessite des tests spécifiques : un utilisateur qui active son consentement ne doit voir que les nouvelles notifications, pas celles reçues avant l'activation. La désactivation d'un consentement pendant une démarche en cours doit afficher une erreur.
#### Paramétrages et affichage (zones scolaires, agenda)
- Le paramétrage des zones scolaires (ex: ajouter/supprimer la zone B) doit être correctement reflété dans la page des préférences et dans le calendrier.
- Les échéances de démarches peuvent apparaître dans l'agenda personnel, une fonctionnalité récente à tester. La suppression d'un élément de l'agenda doit être permanente pour l'utilisateur, sauf réinitialisation.
- Un changement visuel mineur dans l'agenda (le libellé du jour n'est plus répété pour plusieurs rendez-vous) est noté pour information.
#### Navigation et vérification des liens
- Il faut s'assurer que cliquer sur une démarche (depuis l'agenda, une notification ou une liste) redirige vers la page de détail de cette démarche, et non plus vers la liste générale.
- Une vérification de non-régression (absence de 404/KO) est prioritaire pour tous les liens cliquables du catalogue (environ 19 items), des pages de service et des liens "en dur".
- La validation des titres de page est délicate en raison des variations de wording. Une vérification d'égalité stricte ne sera utilisée que lorsque pertinent.
- La connexion silencieuse via FranceConnect doit être testée sur au moins une démarche.
#### Tests en production et outillage
- Une discussion a eu lieu sur la mise en place de "smoke tests" en production, par exemple en utilisant un compte de test fourni par FranceConnect pour valider la communication entre les systèmes.
- La stratégie de test s'organise sur deux niveaux : une suite de smoke tests minimale et une suite plus complète pour automatiser les cas manuels pénibles.
- Les travaux de migration vers WebdriverIO 10 sont en cours.
### Gestion des démarches et de l'espace partenaire
#### Catalogue des démarches et listes d'étapes
- De nombreuses démarches issues des sources (DN, SP) sont trop spécifiques pour le catalogue global actuel. Le filtrage est nécessaire en attendant une personnalisation par géolocalisation.
- Les "listes étapes" de Service Public sont partiellement incomplètes. Le formulaire actuel, calqué sur celui des démarches, est inadapté et nécessite une refonte UX (onglets, tableau, champs).
- Le processus d'intégration implique une transformation de XML en JSON. L'usage des identifiants (`external ID` vs `internal ID`) doit être clarifié.
#### Administration via l'espace partenaire
- Les modifications de contenu sur les pages statiques ("Données personnelles", "Accessibilité") via l'espace partenaire sont répercutées dans l'application après un cache de 5 minutes (sauf déconnexion/reconnexion).
- Les partenaires ne peuvent pas encore envoyer de notifications aux utilisateurs via cet espace. De plus, une notification n'apparaît dans l'espace partenaire que si le consentement AMI est activé.
- L'activation de certaines fonctions, comme la whitelist de partenaires, dépend de variables sur Scalingo.
#### Évolution de l'espace partenaire et CMS
- Une discussion a été engagée sur l'opportunité d'utiliser un CMS externe (comme Wagtail via "site conforme") pour bénéficier du Design Système de l'État (DSFR), de workflows de publication et éviter de "refaire un CMS" en interne. Un POC est envisagé.
- L'organisation inclut trois sites : le site d'administration partenaire, le site de ressources (Docs), et un site interne "guide de survie".
### Sujets techniques et organisationnels
#### Sécurité, notifications ciblées et OPSEC
- La diffusion de liens d'activation pour des segments sensibles (ex: militaires via la CNMSS) pose des risques de sécurité. Une diffusion contrôlée par le partenaire est privilégiée. Le besoin de durcir les pratiques et l'OPSEC des utilisateurs est souligné.
- L'idée de "mini univers" où l'utilisateur s'auto-déclare (ex: "je suis militaire") pour recevoir des notifications ciblées est préférée à court terme, utilisant le stockage local.
- L'automatisation du renouvellement des certificats (ACME) via webhook sur Scalingo a été présentée comme une nécessité sécuritaire malgré sa complexité perçue.
#### Usage de l'IA et documentation
- L'équipe dev est encore réfractaire à l'usage des LLM. Un atelier est proposé pour aborder l'IA sous trois angles : aide à la production de code, bureautique (résumés, specs), et une future intégration dans le produit.
- Un moteur de recherche interne a été créé pour naviguer dans les données réelles des 49 000 démarches issues de DN et SP.
- Pour formaliser les tests, il est nécessaire de converger vers un vocabulaire commun (basé sur une arborescence Miro) et une structure de scénarios plus normative, en précisant les assertions clés pour chaque parcours.
## Prochaines étapes
- [ ] **Tests & Scénarios :**
  - [ ] Ajouter un parcours de test pour la création et la gestion des passkeys.
  - [ ] Développer des scénarios pour le mécanisme de consentement (notifications avant/après, affichage du bouton "suivre").
  - [ ] Créer des tests pour la synchronisation des zones scolaires (préférences et calendrier).
  - [ ] Vérifier que les redirections depuis l'agenda/notifications mènent bien aux pages de détail.
  - [ ] Mettre en place des tests pour la suppression d'éléments dans l'agenda.
  - [ ] Mettre en place une suite de smoke tests garantissant l'absence de 404 pour tous les liens du catalogue et des pages de service.
  - [ ] Structurer un format standard pour les scénarios de test et lister les assertions clés.
  - [ ] Regénérer les captures d'écran en pré-production.
  - [ ] Finaliser la migration vers WebdriverIO 10.
- [ ] **Espace Partenaire & Démarches :**
  - [ ] Lancer un POC sur "site conforme"/Wagtail pour l'administration partenaire et l'intégration du DSFR.
  - [ ] Préparer la réunion de jeudi sur l'espace partenaire (avec Édouard, Lauréline, Fred).
  - [ ] Définir et prioriser la refonte UX du formulaire des "listes étapes".
  - [ ] Définir les critères pour filtrer les démarches DN dans le catalogue global.
  - [ ] Documenter le flux de données XML → JSON et l'usage des identifiants (`external ID`/`internal ID`).
- [ ] **Clarifications & Stratégie :**
  - [ ] Demander à Édouard de clarifier le comportement attendu lors de la désactivation du consentement pour des démarches existantes.
  - [ ] Clarifier avec Édouard le rattachement des sous-démarches aux démarches parentes.
  - [ ] Demander à France Connect un utilisateur de production pour les tests.
  - [ ] Organiser un atelier d'équipe sur l'usage de l'IA (développement et bureautique).
  - [ ] Définir la stratégie de ciblage "mini univers" et le stockage associé.
  - [ ] Examiner les options de diffusion sécurisée des liens pour la CNMSS.
## Suggestions de l'IA
> **Suggestions de l'IA**
> L'IA a identifié les problèmes suivants qui n'ont pas été résolus au cours de la réunion ou qui manquent d'actions claires ; veuillez y prêter attention :
> 1. **Gouvernance des tests :** La définition d'un protocole précis pour la "connexion silencieuse" FranceConnect et la décision sur l'exécution ou non de tests en production restent en suspens. Les critères de validation d'un lien (au-delà du statut 200) et la gestion des divergences de wording dans les titres ne sont pas formalisés.
> 2. **Stratégie Espace Partenaire :** La décision finale sur l'adoption d'un CMS externe (Wagtail) par rapport au développement interne n'est pas prise. Le périmètre du POC et l'effort d'intégration du DSFR doivent être estimés.
> 3. **Gestion des consentements et données :** Le comportement attendu lorsqu'un utilisateur désactive son consentement pour des démarches déjà synchronisées n'est pas défini (masquer, purger ?). De même, la politique de notification via l'espace partenaire (qui notifie et à quelles conditions) et la gouvernance des données pour les "mini univers" restent à clarifier.
> 4. **Processus techniques :** La méthode de définition des démarches via l'espace partenaire (rôle de l'`external ID`, format XML) manque de clarté. L'alignement de l'équipe sur l'automatisation des certificats (ACME) et les politiques internes sur l'usage de l'IA dans le code nécessitent une formalisation.
> 5. **Sécurité :** La méthode de sécurisation des liens d'activation (ex: CNMSS) pour prévenir la divulgation de listes d'affiliés n'est pas arrêtée.