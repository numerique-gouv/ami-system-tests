# Catalogue, services et aide — aucun lien cassé (smoke)

Réunion 15:54–24:29 et 29:52 : « tous les liens du catalogue, quand on clique, on n'arrive pas sur une 404 ».
Exploré en préprod le 2026-10-15 (compte `avec_nom_dusage`).

## Observé (preuves)

- Écran Services (`#/services`), deux onglets : « Trouver de l’aide » et « Démarches et outils ».
- « Démarches et outils » : **20 cartes** (`button` dans le `tabpanel`), dont une qui est la route interne OTV. La réunion en citait 19 : le nombre dépend de l'environnement.
- Trois sortes de cibles, repérées au `data-testid` de la carte (`service-catalog-<partenaire>:<code>`) :
  - `psl:<code>` (Service Public) : **navigation dans le même onglet** vers `preprod.demarches.service-public.gouv.fr/mademarche/demarcheGenerique/?codeDemarche=<code>&caller=<jeton>` ; l'URL contient des **jetons** (`caller`, `id_token`) → ne jamais journaliser l'URL complète, ne jamais la rejouer côté Node.
  - `dinum-dn:<id>` (Démarche Numérique) : navigation vers `demarche.numerique.gouv.fr/commencer/<slug>`, sans jeton ; le titre de l'onglet commence par le nom de la démarche (« Changement de situation familiale · #136034 … »).
  - route interne de la SPA (ex. Opération Tranquillité Vacances : `#/services/service/psl/OperationTranquilliteVacances`).
- Le statut HTTP de la navigation est lisible dans le navigateur : `performance.getEntriesByType('navigation')[0].responseStatus`.
- **Une cible peut répondre 200 et être inutile** : « Déclaration de changement d'adresse » (psl) aboutit sur `preprod.auth.service-public.gouv.fr` (« Se connecter | Service Public », statut 200) avec un lien « S’identifier avec FranceConnect ». Un contrôle « pas de 404 » la déclarerait valide.
- « Trouver de l’aide » : « Je suis victime de cybermalveillance » → route interne `#/procedure-17cyber` contenant un iframe `pprd.cybermalveillance.gouv.fr/widget-diagnostic` ; « Signaler une violence… » et « J’ai besoin d’aide sur un autre sujet » : **non explorés** ; 5 « Comment faire si ... ? » (checklists, `#/checklist/<id>/`) ; « Accéder à l’annuaire » : **non confirmé** (le clic de l'exploration a ouvert la checklist « Je deviens parent », probablement un mauvais ciblage).
- Checklist : sections `n/m` puis cases à cocher ; **aucun lien externe ni page intermédiaire observé** dans « Pendant la grossesse » — les listes d'étapes CNMSS à 1 ou plusieurs liens décrites en réunion ne sont **pas** celles-ci (non retrouvées : **non confirmé**).
- « Aide et contact » (`#/help-center`) : « J’ai besoin de l’aide de l’administration » → `https://www.service-public.gouv.fr/contact/accueil` (200, « Contact | Service Public ») ; « Je rencontre un problème sur l’application » → écran « Nous contacter » (`#/contact`).

## Critère « lien KO » (à valider avec Kevin)

`isBrokenTarget(status, title, text)` : KO si statut ≥ 400, ou titre / texte d'une page d'erreur. Un 200 sur une page de connexion n'est **pas** déclaré KO par ce critère (il est signalé en avertissement, pas en échec) — décision à confirmer.

### S1.1 — Chaque carte du catalogue mène à une page valide
Étant donné un usager connecté sur l'écran Services, onglet « Démarches et outils »
Quand il relève la liste des cartes
Alors il y en a au moins une et chaque libellé est non vide
Quand il ouvre une carte et que la cible est externe
Alors la navigation répond avec un statut < 400
Et la page rendue n'est pas une page d'erreur
Quand il revient dans l'application
Alors l'écran Services est affiché et l'usager est toujours connecté

### S1.2 — « Trouver de l’aide » : cybermalveillance et checklists
Étant donné un usager connecté sur l'écran Services, onglet « Trouver de l’aide »
Quand il ouvre « Je suis victime de cybermalveillance »
Alors l'écran affiche un iframe dont l'adresse répond avec un statut < 400
Quand il ouvre chaque « Comment faire si ... ? »
Alors l'écran Checklist s'affiche avec au moins une section `n/m`

### S1.3 — Chaque entrée de « Trouver de l’aide » mène à une page valide  (✅ implémenté ; 1 entrée tolérée en avertissement)
Source : transcript 20:12–20:40 (« des liens en dur, qui ne sont pas paramétrables… qu'on sache si Service Public a changé l'URL »). Ce sont les entrées de l'onglet « Trouver de l’aide » : elles ne sont pas dans le catalogue paramétrable.
**Observé en préprod le 2026-10-15** — 9 entrées, parcourues **sans coder leurs libellés** (ils changent : « Signaler une violence conjugale, sexuelle ou sexiste » vu le matin a été remplacé par « Dialoguer avec la police ou la gendarmerie » dans la journée) :

| Entrée | Destination (hôte + chemin) | Résultat |
|---|---|---|
| Dialoguer avec la police ou la gendarmerie | `www.masecurite-form.pp.gendarmerie.interieur.gouv.fr/fr/tchat-choix-de-force` (via `login_redirect_url`) | **ERR_CONNECTION_TIMED_OUT** depuis la machine de test |
| Je suis victime de cybermalveillance | route interne `#/procedure-17cyber` (iframe) | ✅ (voir S1.2) |
| J’ai besoin d’aide sur un autre sujet | `www.service-public.gouv.fr/contact/accueil` | 200, « Contact \| Service Public » |
| 5 × « Comment faire si… » | routes internes `#/checklist/<id>/` | ✅ |
| Accéder à l’annuaire | `lannuaire.service-public.gouv.fr/` | 200, « Annuaire \| Service Public » |

Étant donné un usager connecté sur Services > « Trouver de l’aide »
Quand il ouvre chaque entrée de l'onglet, l'une après l'autre
Alors une route interne n'est pas une page d'erreur de l'application (`#/technical-error`, `#/network-error`, `#/forbidden`)
Et une cible externe répond (statut < 400) et n'est pas une page d'erreur
Et la liste des entrées cassées est rapportée **en une fois**, avec l'hôte et le chemin visés (jamais la requête)
**Constats à faire valider** :
- « Dialoguer avec la police ou la gendarmerie » ne répond pas depuis une machine publique : l'hôte `…pp.gendarmerie…` est une **préproduction joignable seulement depuis un réseau privé** (précision de l'équipe, 2026-10-15). **Décision : son échec est journalisé en avertissement (`ANOMALIE tolérée…`) sans faire échouer le test.** La tolérance est étroite : liste d'hôtes `PRIVATE_NETWORK_HOSTS` dans `src/helpers/webapp/link-check.ts` **et** absence totale de réponse. Une réponse HTTP, même 404, reste un échec. Elle s'applique aussi à S1.1 et S1.4. Revenir sur ce choix : retirer l'hôte de la liste.
- ~~« Accéder à l’annuaire » recouvert par la barre de navigation basse~~ : **constat retiré le 2026-10-15**. Il venait du défilement de WDIO (qui replie sur un mode laissant le bouton sous la barre quand l'API Actions refuse), pas de l'application : avec un `scrollIntoView` natif, le bouton est au milieu de l'écran, entièrement dégagé (mesuré sur préprod et staging). Ne pas le remonter comme défaut d'espacement.
- Durée : ~5 min 40 s. Une cible injoignable coûte le délai de connexion du navigateur (~2 min), et `service-public.gouv.fr/contact` bloque les commandes ~1 min (ressources tierces lentes) — remède possible : `pageLoadStrategy: 'eager'` pour la webapp, **non fait** car global.

### S1.4 — Listes d'étapes : chaque lien fonctionne  (✅ implémenté dans `liste-etapes.test.ts`, résultat ci-dessous)
Source : transcript 20:40–21:51 et 22:02–22:41. Une liste d'étapes (ex. CNMSS, générée depuis un XML) contient des sections, des items ; un item à **1 lien** mène directement à la page externe, un item à **plusieurs liens** affiche une **page intermédiaire** listant ses liens. Kevin : « est-ce qu'on peut tester que chaque lien fonctionne ? au moins ça ».
**Point d'entrée trouvé (2026-10-15)** : les « Comment faire si… » de Services > « Trouver de l’aide » (`data-testid` des boutons préfixé `service-steps-`). Ce sont ces 5 listes en préprod :

| Liste (id dans la route) | Sections | Items à lien |
|---|---|---|
| Je crée une association (`F3109`) | Cas général 0/7, Alsace-Moselle 0/7 | 6 par section : 4 directs + 2 pages intermédiaires |
| Je suis affecté à l’étranger (`CNMSS001`, partenaire « test ») | Avant mon départ 0/10, Pendant mon affectation 0/6, À mon retour 0/3 | 11 : 8 directs + 3 pages intermédiaires |
| Je deviens parent (`F16225`) | 2 sections (17 items chacune) | **aucun** bouton-lien |
| Je pars vivre à l’étranger (`F2485`) | EEE ou Suisse 0/23, Ailleurs 0/25 | **aucun** bouton-lien |
| Je souhaite accompagner mon enfant de 15 à 18 ans… (`F39617`) | 11 sections | **aucun** bouton-lien |

Deux listes ont pour identifiant leur **libellé** (« Je crée une association », « Je pars vivre à l’étranger ») dans le `data-testid`, mais leur route utilise bien un code (`F3109`, `F2485`) : elles ne sont donc pas navigables par le libellé.
**Mécanique relevée** :
- `item-button-direct-link-<id>` : lien direct, nom accessible = texte du lien (ex. « Consulter le Guide du départ en outre-mer ou à l’étranger… » → `guide-depart.cnmss.fr/guide-du-depart-132.html`, 200 ; « rattachement des enfants à la CNMSS » → `demarche.numerique.gouv.fr/commencer/demande-de-rattachement-des-enfants-mineurs`, 200).
- `item-button-page-link-<id>` : nom accessible « Voir le détail de ce point » ; ouvre `…/checks/<section>/item/<id>/`, qui liste ses liens en boutons (ex. « Compléter le formulaire d'affectation » → `www.cnmss.fr/document/questionnaire-avant-votre-affectation-hors-de-france-dans-une-com-ou-mayotte` en HTML, 200 ; « Envoyer le formulaire à la CNMSS » → `www.cnmss.fr/vos-demarches/contactez-la-cnmss/contact-beneficiaire`, 200).
- **Ces boutons-liens mesurent 0×0 px** (motif DSFR du « lien étiré » : la zone cliquable est un pseudo-élément). WDIO les refuse (« did not become interactable ») : la spec les déclenche par `HTMLElement.click()`. C'est aussi un point d'accessibilité à signaler (un bouton de taille nulle n'est pas atteignable au clavier de façon visible) — **non confirmé** pour un lecteur d'écran.
- Aucun lien en ligne (`<a href>`) n'a été relevé dans les sections explorées, mais seules CNMSS001 et F3109 ont été ouvertes en détail : **non confirmé** pour les 3 autres listes.
- La réunion parlait de « 2 sous-listes » : F3109 en a 2, CNMSS001 en a 3.

Étant donné un usager connecté sur Services > « Trouver de l’aide »
Quand il ouvre chaque liste d'étapes, chacune de ses sections, puis chaque item à lien
Alors un item à lien direct mène à une page externe (jamais à une page intermédiaire) qui répond avec un statut < 400
Et un item à plusieurs liens ouvre une page intermédiaire qui en liste au moins 2
Et chacun de ces liens répond avec un statut < 400
Et les liens cassés sont rapportés en une fois, avec la liste, la section et l'item
**Résultat du 2026-10-15 (préprod)** : 38 liens suivis (dans les 5 listes ; seules « Je crée une association » et « Je suis affecté à l’étranger » ont des items à lien), **1 défaut réel** :
- `Je suis affecté à l’étranger › Pendant mon affectation › « Guide du départ en outre-mer ou à l’étranger »` ouvre `preprod.ami.beta.numerique.gouv.fr/(https://guide-depart.cnmss.fr/guide-du-depart-132.html` : l'URL saisie dans la liste porte une **parenthèse ouvrante parasite** devant `https://`, le navigateur la traite comme un chemin relatif d'AMI et l'usager reste dans l'application. Le même guide, saisi correctement dans « Avant mon départ », mène à `guide-depart.cnmss.fr/guide-du-depart-132.html` (200). C'est le type d'erreur de saisie que la réunion voulait détecter (24:44, « pas à l'abri qu'il y ait une erreur dans l'URL »). **À faire corriger dans le contenu de la liste** (non fait : ce n'est pas du code de ce dépôt). Reproduit deux fois : ce n'est pas une course.
- Ce test reste donc **en échec tant que le contenu n'est pas corrigé** — c'est le comportement voulu.
Limite assumée par la réunion : ni wording ni ordre (« ce n'est pas nous qui avons la main sur le wording », 21:34).

### S1.5 — Le titre de la page cible est cohérent avec la carte  (❓ à décider)
Source : transcript 16:19–19:28. Kevin : l'URL est paramétrée à la main, donc « le titre doit avoir une cohérence avec le titre de la démarche » ; Nicolas : « je peux capturer un titre et faire un égal égal », pas une distance de similarité ; un formalisme « nom de service – titre » n'existe pas (17:59–18:21). Kevin lui-même juge le niveau « trop complexe » à ce stade : « c'est le step suivant ».
Observé (2026-10-15) : sur une carte Démarche Numérique, le titre d'onglet **commence** par le nom de la démarche (« Changement de situation familiale · #136034 … »). Sur une carte Service Public, le titre n'a pas été relevé.
Étant donné une carte du catalogue dont le libellé est « <nom de démarche> <service> »
Quand l'usager l'ouvre
Alors le titre de la page cible contient le nom de la démarche **non confirmé : vrai pour toutes les cartes DN, à mesurer sur les 20**
Décision à prendre avec Kevin : règle d'égalité retenue (préfixe ? sous-chaîne normalisée ?), et liste des cartes exemptées (les noms « sont ceux des pages Service Public, normalement les mêmes » mais il « préfère ne pas l'assurer », 19:00).
Action préalable : relever titre d'onglet et libellé des 20 cartes et compter les écarts, avant de choisir la règle.

Relevé de données (2026-10-15, préprod, compte `avec_nom_dusage`, 20 cartes de Services > « Démarches et outils »), obtenu en ouvrant chaque carte (`ServicesPage.openCatalogueCard` + `followAndDescribe`, qui ne gardent que hôte, chemin et titre). **Aucune règle d'égalité n'est choisie ici** (décision de Kevin) : ce sont des mesures.

« Libellé » = texte visible de la carte, espaces normalisés ; il se termine par le nom du service (« <démarche> <service> »). « Contient le libellé complet » : comparaison insensible à la casse, aux accents et à la ponctuation, entités HTML décodées. « Début retrouvé » : nombre de mots du libellé, pris depuis le début, qui se retrouvent d'affilée dans le titre (indicatif, ce n'est pas une règle).

| Libellé de la carte | Hôte de la page cible | Titre d'onglet | Le titre contient le libellé complet ? | Début du libellé retrouvé |
|---|---|---|---|---|
| APIAS - Demande de prise en charge de soins hors de France métropolitaine pour un militaire blessé en service Caisse nationale militaire de sécurité sociale (CNMSS) | demarche.numerique.gouv.fr | APIAS - Demande de prise en charge de soins hors de France métropolitaine pour un militaire blessé en service · #141965 · APIAS - Demande de prise en... · demarche.numerique.gouv.fr | non | 19/26 mots |
| Changement de situation familiale Caisse nationale militaire de sécurité sociale (CNMSS) | demarche.numerique.gouv.fr | Changement de situation familiale · #136034 · Changement de situation fam... · demarche.numerique.gouv.fr | non | 4/11 mots |
| Déclaration de changement d'adresse Service Public | preprod.auth.service-public.gouv.fr | Se connecter / Service Public | non | 0/6 mots |
| Déclaration de changement de nom d'usage (nom d'époux ou d'épouse) Service Public | preprod.auth.service-public.gouv.fr | Se connecter / Service Public | non | 0/12 mots |
| Demande d'acte de décès (survenu à l’étranger) - Service gratuit Service central d'état civil | preprod.auth.service-public.gouv.fr | Se connecter / Service Public | non | 0/14 mots |
| Demande d'acte de mariage (célébré à l'étranger) - Service gratuit Service central d'état civil | preprod.auth.service-public.gouv.fr | Se connecter / Service Public | non | 0/14 mots |
| Demande d'acte de naissance : copie intégrale ou extrait (naissance à l'étranger) - Service gratuit Service central d'état civil | www.preprod.service-public.gouv.fr | Demande d'acte de naissance : copie intégrale ou extrait (naissance à l'étranger) - Service gratuit / Service Public | non | 16/19 mots |
| Demande d'acte de naissance : copie intégrale ou extrait (naissance en France) - Service gratuit Mairie | www.preprod.service-public.gouv.fr | Demande d'acte de naissance : copie intégrale ou extrait (naissance en France) - Service gratuit / Service Public | non | 15/16 mots |
| Demande d'affiliation en qualité de militaire retraité sans activité professionnelle Caisse nationale militaire de sécurité sociale (CNMSS) | demarche.numerique.gouv.fr | Demande d'affiliation en qualité de militaire retraité sans activité professionnelle · #128238 · Demande d&#39;affiliation en qu... · demarche.numerique.gouv.fr | non | 10/17 mots |
| Demande d'immatriculation des étrangers pensionnés du Service des Retraites de l'État (SRE) Caisse nationale militaire de sécurité sociale (CNMSS) | demarche.numerique.gouv.fr | Demande d'immatriculation des étrangers pensionnés du Service des Retraites de l'État (SRE) · #136100 · Demande d&#39;immatriculation d... · demarche.numerique.gouv.fr | non | 12/19 mots |
| Demande de prise en charge de soins liés à une pension militaire d'invalidité (PMI) dans les DROM-COM Caisse nationale militaire de sécurité sociale (CNMSS) | demarche.numerique.gouv.fr | Demande de prise en charge de soins liés à une pension militaire d'invalidité (PMI) dans les DROM-COM · #141968 · Demande de prise en charge ... · demarche.numerique.gouv.fr | non | 17/24 mots |
| Demande de rattachement des enfants mineurs à l'un ou aux deux parents assurés Caisse nationale militaire de sécurité sociale (CNMSS) | demarche.numerique.gouv.fr | Jeuness'Sport - Prise en charge de 25 € sur la licence sportive de votre enfant · #126569 · Jeuness&#39;Sport - Prise en ch... · demarche.numerique.gouv.fr | non | 0/20 mots |
| Demande de recensement citoyen obligatoire Mairie - Consulat | preprod.auth.service-public.gouv.fr | Se connecter / Service Public | non | 0/8 mots |
| Déposer une pré-demande de Pacs Mairie | preprod.auth.service-public.gouv.fr | Se connecter / Service Public | non | 0/6 mots |
| Jeuness'Sport - Prise en charge de 25 € sur la licence sportive de votre enfant Caisse nationale militaire de sécurité sociale (CNMSS) | demarche.numerique.gouv.fr | Jeuness'Sport - Prise en charge de 25 € sur la licence sportive de votre enfant · #126569 · Jeuness&#39;Sport - Prise en ch... · demarche.numerique.gouv.fr | non | 15/22 mots |
| Mise à jour de votre situation professionnelle Caisse nationale militaire de sécurité sociale (CNMSS) | demarche.numerique.gouv.fr | Mise à jour de votre situation professionnelle · #138622 · Mise à jour de votre situat... · demarche.numerique.gouv.fr | non | 7/14 mots |
| Opération Tranquillité Vacances Police Nationale - Gendarmerie Nationale | preprod.demarches.service-public.gouv.fr | Opération Tranquillité Vacances :: Votre demande / Service-public.gouv.fr | non | 3/8 mots |
| Professionnel de santé : Demande de prise en charge de soins liés à une pension militaire d’invalidité (PMI) dans un DROM-COM Caisse nationale militaire de sécurité sociale (CNMSS) | demarche.numerique.gouv.fr | Professionnel de santé : Demande de prise en charge de soins liés à une pension militaire d’invalidité (PMI) dans un DROM-COM · #145731 · Professionnel de santé : De... · demarche.numerique.gouv.fr | non | 21/28 mots |
| Rendez-vous Rendez-vous Service Public | rdv.anct.gouv.fr | Accueil - RDV Service Public | non | 0/4 mots |
| Sport sur ordonnance Caisse nationale militaire de sécurité sociale (CNMSS) | demarche.numerique.gouv.fr | Sport sur ordonnance · #136513 · Sport sur ordonnance · demarche.numerique.gouv.fr | non | 3/10 mots |

Constats chiffrés (observés, non interprétés) :
- le titre ne contient le libellé **complet** pour aucune des 20 cartes (le libellé se termine par le nom du service, absent des titres) ;
- les 10 cartes `demarche.numerique.gouv.fr` ont un titre qui **contient le début de leur libellé** (nom de la démarche), sauf une : « Demande de rattachement des enfants mineurs… » ouvre une page dont le titre est celui de « Jeuness'Sport - Prise en charge de 25 € sur la licence sportive… » (même numéro de démarche `#126569` que la carte Jeuness'Sport) ; **non confirmé** : erreur de configuration de l'URL de la carte ou comportement voulu ;
- des titres de démarche numérique portent une entité HTML littérale (`&#39;` à la place de l'apostrophe) ;
- 6 cartes Service Public aboutissent sur la page de connexion (titre « Se connecter / Service Public », hôte `preprod.auth.service-public.gouv.fr`) : leur titre ne dit rien de la carte ;
- « Rendez-vous Rendez-vous Service Public » ouvre « Accueil - RDV Service Public » (`rdv.anct.gouv.fr`).

Implémentation provisoire (règle en **avertissement**, jamais un échec), dans la boucle de S1.1 (`titleMentionsCard`, `src/helpers/webapp/link-check.ts`) : le titre doit CONTENIR le nom de la carte, après normalisation (casse, accents, ponctuation, espaces, entités HTML). Le nom de service accolé au libellé ne peut pas être isolé du texte brut : il est ignoré par approximation (libellé amputé de 0 à 8 mots finaux, 2 mots minimum). Calibrage sur le tableau ci-dessus : le libellé complet donnait 20 avertissements sur 20 (run S1.1 du 2026-10-15, `1 passing`, 8 min 52 s) ; la règle ajustée n'en laisse, sur les données du tableau, que : les 6 cartes Service Public sur « Se connecter / Service Public », « Demande de rattachement des enfants mineurs… » (titre Jeuness'Sport) et « Rendez-vous Rendez-vous Service Public » (« Accueil - RDV Service Public »), soit 8 sur 20. Ce décompte est une vérification hors ligne sur le tableau de B (10 cas contrôlés à la main) ; **le test n'a pas été relancé avec la règle ajustée**. TODO : isoler le nom par le DOM de la carte, et trancher la règle avec Kevin.

### S2.1 — Aide et contact
Étant donné un usager connecté sur « Aide et contact »
Quand il ouvre « J’ai besoin de l’aide de l’administration »
Alors la cible est `service-public.gouv.fr` et répond avec un statut < 400
Quand il revient et ouvre « Je rencontre un problème sur l’application »
Alors l'écran « Nous contacter » s'affiche
