# Environnements — staging, préprod, production

Source : réunion du 2026-10-06 (transcript 27:42–29:32 et 18:21–18:40). **Statut : 📝 à décider / à implémenter.**

## Où les specs tournent aujourd'hui

Tout a été exploré et exécuté en **préprod** (`AMI_ENV=preprod`), le 2026-10-15. **Rien n'a été exécuté en staging ni en production.** L'environnement est choisi par `AMI_ENV` (`src/helpers/environment.ts` : préprod, review app `<n>`, sinon staging).

### ENV1 — Les mêmes specs passent sur staging et sur les branches de staging
Défi posé par la réunion (27:42) : « les tests soient faisables en staging, sur des branches de staging qui intègrent le staging plus tard, et sur la préprod ».
Étant donné la suite `webapp_nonreg`
Quand elle est lancée avec `AMI_ENV=staging`, puis avec `AMI_ENV=<n° de review app>`
Alors elle passe avec les mêmes assertions
**Points à vérifier (non confirmés)** :
- le **catalogue** y est différent (nombre de cartes, partenaires) : S1.1 n'a pas de nombre codé en dur, c'est voulu ;
- **S7** suppose une tuile de l'agenda qui cite « Zone B » ; elle se choisit dynamiquement ;
- **S12.1** (carte « Déclaration de changement d'adresse ») suppose cette carte au catalogue : en staging, **non confirmé** ;
- l'URL des cibles diffère (`preprod.demarches.service-public.gouv.fr` en préprod) : les assertions ne doivent pas coder un hôte — seul S2.1 contrôle `service-public.gouv.fr`.
Action : lancer `webapp_nonreg` en staging, relever les écarts, et décider des tests propres à un environnement (tag ou garde explicite — pas de `if` silencieux).

**Résultat du premier passage sur staging (2026-10-15, `AMI_ENV=staging`, suite `webapp_nonreg`)** : 13 réussis, 1 suspendu (S11.2), 5 en échec. Aucun n'est une régression de l'application constatée ; trois sont des **écarts d'environnement**, deux des **hypothèses de mes specs trop étroites** :

| Spec | Constat sur staging | Nature |
|---|---|---|
| S1.1, S12.1 | 3 cartes Service Public (« Déclaration de changement d'adresse », « Déposer une pré-demande de Pacs », « Opération Tranquillité Vacances ») ouvrent `qualif.demarches.service-public.gouv.fr/mademarche/demarcheGenerique/` : **page d'erreur du navigateur, aucune réponse** depuis cette machine. 17 cartes au catalogue (20 en préprod) | **Écart d'environnement** : le staging pointe sur la *qualif* de Service Public, probablement joignable seulement depuis un réseau privé, comme la gendarmerie en préprod. **Non confirmé** — décision à prendre : l'ajouter à `PRIVATE_NETWORK_HOSTS` ? |
| S10.2 | L'agenda de staging n'a qu'**un seul élément** (« Vacances de la Toussaint ») et aucun jour férié | Hypothèse de ma spec : assouplie (un jour férié de préférence, sinon tout élément fixe) |
| S1.3 | `Cannot read properties of undefined (reading 'scrollIntoView')` : l'entrée n° i n'était pas encore rendue après le retour | Fragilité de ma spec : garde-fou ajouté (attente de l'entrée) |
| S3 | Le menu « Plus » ne s'ouvre pas depuis la page Suivi (« La suite de la navigation » absent après 5 s), après deux vérifications réussies ; au rejeu : bouton « suivre » absent car `Test` et `test-test` étaient restés à vrai | **Cause trouvée** : staging a 6 consentements (préprod 4), « Tout suivre » les active tous et ma restauration n'en reprenait que 4. Corrigé (`restoreConsents` porte sur toutes les cases) et compte staging remis en état. L'échec « Plus » initial n'est **pas expliqué** |

Tous les autres scénarios passent sur staging (S1.2, S2.1, S9.1–S9.3, S13.1, S7, S8.1, S10.1, S4.1, S4.2, S5.1, S6.1, S11.1). Le catalogue y est différent (17 cartes contre 20) : S1.1 n'a pas de nombre codé en dur.

**Décisions du 2026-10-15** : (1) `qualif.demarches.service-public.gouv.fr` est ajouté aux hôtes tolérés en avertissement, comme la gendarmerie (S1.1 et S12 sur staging) ; (2) un scénario propre à un environnement se saute avec une **garde explicite** : `environmentKind()` (`preprod` / `staging` / `review`, `src/helpers/environment.ts`), `log.warn` du motif puis `this.skip()` — jamais un `if` silencieux, jamais de suite séparée par environnement.

### ENV2 — Smoke de production avec un utilisateur de test FranceConnect
Source : 27:55–29:32 (« Darty lance un tunnel d'achat avec sa carte bleue à lui à chaque mise en prod… »).
Objectif de la réunion : **vérifier que les systèmes communiquent**, pas la donnée ni la configuration des démarches (29:17–29:35).
Étant donné un utilisateur de test FranceConnect **de production** **(à demander à FranceConnect — décision en attente, 28:06–29:32)**
Quand la suite smoke s'authentifie via FranceConnect en production
Alors l'Accueil « Bonjour <prénom> » s'affiche
Et rien n'est modifié (aucune publication, aucun changement de consentement ni de zones)
**Pas implémentable tant que** : l'utilisateur de production n'existe pas, et que le périmètre autorisé en production n'est pas arrêté (la réunion hésite : « même est-ce qu'on a besoin d'aller jusqu'à la prod ? »). Les specs qui publient (`publishDemarche`, `publishNotification`) sont **interdites** en production.

### ENV3 — Déconnexion FranceConnect (outil de test en staging)
Source : 18:21–18:40 (« on a mis déconnexion France Connect pour nous : on se déconnecte de FranceConnect et on retourne sur AMI en étant déconnecté, en ayant enlevé le cookie »).

**Observé en live le 2026-10-15 sur staging** (session figée, compte `avec_nom_dusage`) :
- La carte est dans Services > « Démarches et outils », libellé visible « 1. Déconnexion FC Déconnexion FC » (donc la carte « Déconnexion FC » du catalogue ; le préfixe « 1. » sert apparemment à l'ordre — **non confirmé**). Un clic l'ouvre **dans l'onglet courant**.
- Elle mène au **fournisseur de service de démonstration FranceConnect** (hôte `fsp1-low.sbx.fcp.fournisseur-de-service.fr`, chemin `/login`, titre « Mock Service Provider », bac à sable) : page « Bienvenue sur le démonstrateur de fournisseur de service FC v2 » avec le bouton « Connexion à FranceConnect ». Elle **n'effectue aucune déconnexion à elle seule**.
- Avec une session FranceConnect ouverte, « Connexion à FranceConnect » mène à l'écran de consentement de FranceConnect (« Continuer sur FSP1 LOW - Sandbox », hôte `fcp-low.sbx.dev-franceconnect.fr`) ; « Continuer » ouvre la page « Mock Service Provider - Login Callback » (identité de l'usager) avec le lien **« Se déconnecter »**.
- « Se déconnecter » ramène sur la page de connexion du démonstrateur (`/login`), **pas sur AMI**. Les cookies FranceConnect (`fc_session_id`, `trustedDevice`) ont disparu du navigateur ; une nouvelle « Connexion à FranceConnect » affiche alors le **choix du compte** (« Démonstration eIDAS faible »…) au lieu du consentement : la session FranceConnect est bien retirée.
- La session **AMI** n'est pas touchée : en rechargeant la racine d'AMI juste après, l'Accueil (« Bonjour … ») s'affiche et le cookie `token` est toujours présent. Autrement dit, l'énoncé de la réunion (« on retourne sur AMI en étant déconnecté ») **n'est pas ce qui est observé** : on reste sur le démonstrateur et AMI reste connecté.

**Non confirmé** : disponibilité en préprod (le catalogue de préprod, relevé le 2026-10-15, n'a pas cette carte), en production et sur les review apps ; si le retour sur AMI est prévu par la configuration du démonstrateur ; l'effet sur la connexion silencieuse (S12.1) d'une carte partenaire quand la session FranceConnect a été retirée (à vérifier avant d'utiliser cette carte pour la rendre répétable).

**Scénario implémenté** (`deconnexion-fc.test.ts`, suite `webapp_nonreg`, groupe 2 après `consentement.test.ts`) :
Étant donné un usager connecté sur AMI, en staging
Quand il ouvre la carte « Déconnexion FC », se connecte à FranceConnect depuis le démonstrateur puis clique « Se déconnecter »
Alors il est sur la page de connexion du démonstrateur
Et une nouvelle connexion à FranceConnect affiche le choix du compte (session FC retirée)
Restauration : le test se reconnecte à FranceConnect depuis le démonstrateur (eIDAS faible + identifiants), puis `getAppToStartingState()` ramène sur l'Accueil d'AMI.
Garde : `environmentKind() !== 'staging'` → `log.warn` + `this.skip()`. Exécuté : staging 1 réussi (2 fois), préprod 1 sauté avec son motif.
