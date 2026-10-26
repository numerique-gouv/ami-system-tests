# Consentement et suivi des démarches (recette)

Réunion 03:45–09:40. Deux choses à ne pas confondre : le consentement aux **démarches**, propre à chaque partenaire (refusé, le backend refuse les événements du partenaire et l'app ne reçoit pas ses démarches), et les **notifications push**, réglage global à AMI, local à l'app, sans endpoint (permission du système : navigateur, Android ; iOS : appareil physique seulement, donc pas sur simulateur). Dans le code : `…DemarchesConsent(partenaire, fcHash)` (`PARTNER_AMI`, `PARTNER_DN`) pour le premier, aucun helper API pour le second. `/api/v1/consent/{fc_hash}` est la porte du partenaire pour ses événements. **Non confirmé** (S5, S5.2) : qu'un événement « notification » simple passe par cette même porte ; `publishNotification` appelle la même garde, d'où l'option neutre `verifyPartnerConsent`. Le consentement AMI aux démarches (`dinum-ami`) se pilote par cette API (`grantDemarchesConsent`/`revokeDemarchesConsent`/`checkDemarchesConsent`) ;
les autres (DN, SP, …) par les switchs de Préférences > Suivi des démarches. Restauration : état d'origine relevé dans `before()`.

## Observé en préprod (2026-10-15)

- Préférences > Suivi des démarches (`#/preferences/consents`) : bouton « Tout suivre » + 4 cases : « Suivre mes démarches AMI | Démarche Numérique | RDV Service Public | Service Public sur mon appareil mobile ». État d'origine du compte : **AMI seul**.
- Sans aucun consentement : « Je veux suivre mes démarches » est visible sur l'**Accueil** et sur le **Suivi** ; avec **DN seul** (AMI décoché) il disparaît et « Mes démarches » réapparaît. Vérifié.
- Décocher AMI affiche un toast « Attention » : « Si vous avez des démarches AMI en cours ou à venir, vous ne pourrez plus les suivre dans l’application. L’historique de vos démarches est conservé. » (bouton « Fermer le toast »). Le message dit que l'historique est conservé ; le comportement réel (que voit-on ensuite ?) reste à valider avec Édouard.
- « Tout suivre » coche les 4 cases. L'état est persisté après rechargement.

### S3 — « Je veux suivre mes démarches » est proposé sans consentement et disparaît dès qu'un seul est actif
Étant donné un usager dont **aucun** consentement n'est activé (les 4 cases décochées)
Quand il ouvre l'Accueil
Alors le bouton « Je veux suivre mes démarches » est visible
Quand il ouvre le Suivi
Alors le bouton y est également visible
Quand il active **un seul** consentement, hors AMI (« Démarche Numérique »)
Et qu'il retourne sur l'Accueil
Alors le bouton n'est plus affiché (il l'était : la disparition prouve que le consentement est pris en compte)
Quand il ouvre le Suivi
Alors le bouton n'y est plus affiché
Restauration : consentements d'origine (AMI seul)

### S4.1 — Un switch basculé est persisté côté backend
Étant donné un usager sur Préférences > Suivi des démarches, le switch « dinum-ami » activé (API : `checkDemarchesConsent` = vrai)
Quand il désactive le switch
Alors `checkDemarchesConsent` côté API renvoie faux (relecture, pas seulement l'état de l'UI)
Quand il le réactive
Alors `checkDemarchesConsent` renvoie vrai
Et, après rechargement de la page, le switch est activé

### S4.2 — « Tout suivre » active tous les consentements
Étant donné un usager dont tous les consentements sont désactivés
Quand il clique « Tout suivre »
Alors tous les switchs de Préférences > Suivi des démarches sont activés
Et `checkDemarchesConsent` renvoie vrai
Restauration : état d'origine de chaque switch

### S5.1 — Une notification reçue sans consentement n'apparaît jamais, même après activation
Étant donné un usager **sans** consentement du partenaire `dinum-ami` (`revokeDemarchesConsent` ; le rapport de cette porte avec les notifications est non confirmé)
Quand une notification « N1 » est publiée (`publishNotification` avec `verifyPartnerConsent: false`)
Et que l'usager active son consentement (`grantDemarchesConsent`)
Et qu'une notification « N2 » est publiée
Alors l'inbox (Notifications) affiche « N2 »
Et n'affiche pas « N1 »

### S6.1 — Désactiver un consentement alors qu'une démarche est suivie affiche un message
Étant donné un usager avec une démarche suivie d'un partenaire (`publishDemarche`)
Quand il désactive le switch de ce partenaire dans Préférences > Suivi des démarches
Alors un toast « Attention » s'affiche, contenant « vous ne pourrez plus les suivre dans l’application » et « L’historique de vos démarches est conservé »
**Non défini par la réunion** : le sort des démarches déjà synchronisées (masquées ? purgées ?) — question à poser à Édouard ;
aucune assertion n'est posée dessus.

### S6.2 — Après désactivation du consentement, les démarches sont masquées puis retrouvées à la réactivation  (❓ à définir — bloqué par une question à Édouard)
Source : transcript 07:37–09:40. Kevin désactive le consentement : « j'ai plus rien, je peux plus voir mes démarches, mais comme on les avait déjà récupérées… on les a gardées en base » ; Nicolas : « c'est pas purgé quand tu désactives ? » — Kevin : « non, pas purgé » ; Nicolas : « si je refais tout le scénario de quand je réactive, je peux reconsulter les anciennes données ». Le toast de l'application dit la même chose (« L’historique de vos démarches est conservé »). **Aucune règle de gestion n'est écrite** : Kevin note la question pour Édouard (08:53–09:18), Nicolas choisit « on vérifie pas, c'est indéfini, on fait un check » (09:29).
Hypothèse de travail (**non confirmée**, à valider avant d'écrire la spec) :
Étant donné une démarche « D4 » visible dans le Suivi, consentement AMI actif
Quand l'usager décoche le consentement AMI
Alors « D4 » n'est plus listée dans le Suivi (ni sur l'Accueil)
Quand il recoche le consentement AMI
Alors « D4 » est de nouveau listée avec son statut et son historique de messages
Restauration : consentement AMI actif.
Question à poser à Édouard (reprise de la réunion, 09:01) : que doit-il arriver aux événements déjà envoyés quand on désactive le consentement — masqués, purgés, ou conservés visibles ? Tant que la réponse n'est pas donnée, S6.2 reste **un constat à documenter**, pas une assertion.
**Implémenté en mode constat** (`consentement.test.ts`, « S6.2 — constat… », pas encore exécuté) : D4 (`Demarche E2E <iso> s62`) est publiée et retrouvée dans le Suivi ; le consentement AMI est décoché PAR L'INTERFACE ; le test journalise (`OBS S6.2 …`) si D4 est listée sur l'Accueil et sur le Suivi, puis recoche et observe de nouveau, avec le statut (« En cours » attendu, publiée `wip`). Il n'échoue jamais sur ce comportement ; il n'asserte que le chargement des pages (h1 « Mes démarches » du Suivi, signalé `ANOMALIE ?` s'il manque) et le consentement rétabli côté backend. **Constat du 2026-10-15 (préprod, un run, `2 passing` avec S5.2, 1 min 4 s)** :
- Consentement retiré (backend confirmé) : `OBS S6.2 consentement retiré : D4 listée sur l'Accueil : false ; sur le Suivi : false ; statut : sans objet` (le h1 « Mes démarches » du Suivi était affiché).
- Consentement recoché : `OBS S6.2 consentement rétabli : D4 listée sur l'Accueil : true ; sur le Suivi : true ; statut : En cours`.
- Donc, sur ce run, l'application MASQUE D4 pendant le retrait et la RETROUVE ensuite, avec son statut. Cela correspond à l'hypothèse de travail, mais la règle reste **à confirmer par Édouard** (une seule observation ; l'Accueil sans consentement affiche le bouton « Je veux suivre mes démarches » à la place du bloc, cf. S3).

### S5.2 — Notifications reçues avec consentement : bonnes conditions inverses  (📝 à implémenter, petite)
Source : transcript 06:27–06:53 — « si je ne l'ai pas mis, la notification n'arrive pas ; si je l'ai mis, elle arrive bien ». S5.1 (✅) couvre « activation après coup » ; il manque le cas simple :
Étant donné un usager **sans** consentement AMI, inbox ouverte
Quand une notification est publiée (`verifyPartnerConsent: false`)
Alors elle n'apparaît pas dans l'inbox (même après rechargement)
Étant donné le même usager **avec** consentement
Quand une notification est publiée
Alors elle apparaît
Remarque : l'observation du 2026-10-15 (S5.1 : visible après activation) laisse penser que « n'apparaît pas » est à vérifier d'abord avec Édouard avant d'en faire une assertion bloquante.
**Implémenté en mode constat** (`consentement.test.ts`, « S5.2 — … », pas encore exécuté) : sans consentement et inbox ouverte, la notification est publiée (`verifyPartnerConsent: false`) et le test observe pendant 5 s, puis après rechargement (8 s), si elle apparaît (`OBS S5.2 …` ou `ANOMALIE ? S5.2 …`) sans jamais échouer sur ce point. Seul le fait certain est asserté : consentement redonné, une seconde notification apparaît dans l'inbox. **Constat du 2026-10-15 (préprod, un run)** : `ANOMALIE ? S5.2 : la notification publiée SANS consentement est visible dans l'inbox (avant rechargement : true, après : true)`. Elle est donc visible dès la publication, consentement retiré (backend confirmé), et reste visible après rechargement. La démo filmée du même jour le confirme, et elle reste visible une fois le consentement redonné : le constat de S5.1 (« visible après activation ») est moins fort que celui-ci. La seconde notification, publiée avec consentement, apparaît (fait asserté). L'attente « n'apparaît pas » reste non confirmée (question à Édouard) ; rien n'est durci.

### S6.3 — Démarches publiées sans consentement au suivi : Suivi et notifications  (✅ implémenté dans `consentement-demarches.test.ts` ; 4 attentes de l'équipe non tenues)
Scénario décrit par l'équipe le 2026-10-15 (consentement **au suivi des démarches**, case « AMI » de Préférences > Suivi des démarches). Les attentes sont vérifiées étape par étape **sans interrompre** le déroulé (écarts collectés, listés à la fin) pour que la vidéo montre tout.
Étant donné le consentement AMI retiré (par l'interface ; le backend le confirme)
Quand le partenaire publie la démarche D1 (sans consentement) et que l'usager attend 4 secondes puis recharge l'Accueil
Et qu'il ouvre le Suivi des démarches
Alors D1 est **absente** du Suivi
Et, dans les notifications, D1 est **absente**
Quand le consentement est redonné (par l'interface)
Et que le partenaire publie une mise à jour de D1, puis la création d'une 2ᵉ démarche D2
Et que l'usager ouvre le Suivi et attend D2
Alors D2 est présente et la mise à jour de D1 est **absente**
Et, dans les notifications, D1 et D2 sont **absentes**
Restauration : consentement AMI d'origine (`after()`). Les démarches publiées restent sur le compte (aucune suppression connue).

**Résultat du 2026-10-15 (préprod, vidéo `webm`, 1 test en échec, 1 min 45 s)** — 2 attentes tenues, 4 non tenues :

| Étape | Attente de l'équipe | Observé |
|---|---|---|
| Suivi, sans consentement | D1 absente | **absente** ✅ (l'Accueil et le Suivi n'affichent que « Je veux suivre mes démarches ») |
| Notifications, sans consentement | D1 absente | **présente** ❌ : « Création de D1 (sans consentement) » est dans l'inbox |
| Suivi, après consentement | D2 présente | **présente** ✅ (« Brouillon », « Création de D2 ») |
| Suivi, après consentement | mise à jour de D1 absente | **présente** ❌ : D1 apparaît « En cours », « Mise à jour de D1 » |
| Notifications, après consentement | D1 absente | **présente** ❌ |
| Notifications, après consentement | D2 absente | **présente** ❌ |

Lecture des images (planche contact de la vidéo) : sans consentement, l'inbox liste déjà la notification de création de D1 ; après consentement, D1 réapparaît au Suivi à partir de la **mise à jour** (la création, publiée sans consentement, n'a pas créé la démarche au Suivi), et D1 comme D2 sont dans l'inbox. **Non confirmé** : si l'attente « absentes des notifications » est une règle de gestion ou une hypothèse (les démarches publiées avec consentement figurent aussi dans l'inbox, observé aussi dans la vidéo de S5) ; à confronter à Édouard. Les 4 écarts sont donc **à arbitrer** : défauts de l'application, ou attentes à corriger.

