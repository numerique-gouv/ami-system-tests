# Consentement et suivi des démarches (recette)

Réunion 03:45–09:40. Deux choses à ne pas confondre : le consentement aux **démarches**, propre à chaque partenaire (refusé, le backend refuse les événements du partenaire et l'app ne reçoit pas ses démarches), et les **notifications push**, réglage global à AMI, local à l'app, sans endpoint (permission du système : navigateur, Android ; iOS : appareil physique seulement, donc pas sur simulateur). Dans le code : `…DemarchesConsent(partenaire, fcHash)` (`PARTNER_AMI`, `PARTNER_DN`) pour le premier, aucun helper API pour le second. `/api/v1/consent/{fc_hash}` est la porte du partenaire pour ses événements. **Non confirmé** (S5, S5.2) : qu'un événement « notification » simple passe par cette même porte ; `publishNotification` appelle la même garde, d'où l'option neutre `verifyPartnerConsent`. Le consentement AMI aux démarches (`dinum-ami`) se pilote par cette API (`grantDemarchesConsent`/`revokeDemarchesConsent`/`checkDemarchesConsent`) ;
les autres (DN, SP, …) par les switchs de Préférences > Suivi des démarches. Restauration : état d'origine relevé dans `before()`.


## Partenaires de test et identifiants (2026-10-26)

Backend (`ami/partner/models.py`, `notification/api_views_v2.py`) : `PUT /api/v2/event` et `POST /api/v1/notifications` passent par la même porte ; le blocage dépend du flag `consent_is_enabled` du **partenaire**. Vrai (`dinum-dn`, `dinum-rdvsp`) : sans utilisateur / consentement absent ou retiré, **404** (`User not found`, `Consent not found`, `Consent not given`), rien n'est créé. Faux (`psl`) : consentement ignoré. `dinum-ami` est le partenaire **système** AMI ; sur staging il a répondu **201 sans consentement** : il ne peut pas exercer les scènes « sans consentement ».

Conséquence : S5, S5.2 et S6.3 utilisent **`dinum-dn`** (`PARTNER_DN`). Un partenaire réel fait GET `/api/v1/consent/{fc_hash}` puis PUT (c'est ce que simule `publishEvent` par défaut) ; pour tester le **refus du backend** on appelle le PUT directement (`verifyPartnerConsent: false`) et on exige `publicationOutcome` = `refusée` (404).

Variables d'environnement (`.env.local`, jamais commitées ; gabarit `.env`) :

| Partenaire | Identifiant | Secret (valeur : variable `PARTNERS_<SLUG>_SECRET` de l'app Scalingo du backend) |
|---|---|---|
| AMI (`dinum-ami`) | `NOTIF_PARTNER_ID` | `NOTIF_PARTNER_SECRET` |
| Autre partenaire `<slug>` | `NOTIF_PARTNER_<SLUG>_ID` | `NOTIF_PARTNER_<SLUG>_SECRET` (`<SLUG>` = slug en majuscules, non alphanumériques → `_`) |
| Démarche Numérique (`dinum-dn`) | `NOTIF_PARTNER_DINUM_DN_ID` | `NOTIF_PARTNER_DINUM_DN_SECRET` |

Le paramètre `partner` des helpers (`publishEvent`, `publishNotification`, `publishDemarche`, `…DemarchesConsent`) choisit les identifiants de l'appel (`client.ts`). Sans les variables DN, S5, S5.2 et S6.3 sont **SKIPPÉS (BLOQUÉS)** avec un message qui nomme les variables manquantes (`skipUnlessPartnerCredentials`) : aucun faux succès. Valeur réelle de `consent_is_enabled` de `dinum-dn` sur staging : non confirmée tant que ces scénarios n'ont pas tourné.

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
Étant donné un usager **sans** consentement du partenaire `dinum-dn` (`revokeDemarchesConsent`)
Quand une notification « N1 » est publiée par appel direct (`publishNotification` avec `verifyPartnerConsent: false`) : le backend la **refuse** (404)
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
**Implémenté en mode constat** (`consentement.usage.test.ts`, « S6.2 — constat… », pas encore exécuté) : D4 (`Demarche E2E <iso> s62`) est publiée et retrouvée dans le Suivi ; le consentement AMI est décoché PAR L'INTERFACE ; le test journalise (`OBS S6.2 …`) si D4 est listée sur l'Accueil et sur le Suivi, puis recoche et observe de nouveau, avec le statut (« En cours » attendu, publiée `wip`). Il n'échoue jamais sur ce comportement ; il n'asserte que le chargement des pages (h1 « Mes démarches » du Suivi, signalé `ANOMALIE ?` s'il manque) et le consentement rétabli côté backend. **Constat du 2026-10-15 (préprod, un run, `2 passing` avec S5.2, 1 min 4 s)** :
- Consentement retiré (backend confirmé) : `OBS S6.2 consentement retiré : D4 listée sur l'Accueil : false ; sur le Suivi : false ; statut : sans objet` (le h1 « Mes démarches » du Suivi était affiché).
- Consentement recoché : `OBS S6.2 consentement rétabli : D4 listée sur l'Accueil : true ; sur le Suivi : true ; statut : En cours`.
- Donc, sur ce run, l'application MASQUE D4 pendant le retrait et la RETROUVE ensuite, avec son statut. Cela correspond à l'hypothèse de travail, mais la règle reste **à confirmer par Édouard** (une seule observation ; l'Accueil sans consentement affiche le bouton « Je veux suivre mes démarches » à la place du bloc, cf. S3).

### S5.2 — Notifications reçues avec consentement : bonnes conditions inverses  (📝 à implémenter, petite)
Source : transcript 06:27–06:53 — « si je ne l'ai pas mis, la notification n'arrive pas ; si je l'ai mis, elle arrive bien ». S5.1 (✅) couvre « activation après coup » ; il manque le cas simple :
Étant donné un usager **sans** consentement `dinum-dn`, inbox ouverte
Quand une notification est publiée par appel direct (`verifyPartnerConsent: false`)
Alors le backend la **refuse** (404) et elle n'apparaît pas dans l'inbox (même après rechargement)
Étant donné le même usager **avec** consentement
Quand une notification est publiée
Alors elle apparaît
Remarque : l'observation du 2026-10-15 (S5.1 : visible après activation) laisse penser que « n'apparaît pas » est à vérifier d'abord avec Édouard avant d'en faire une assertion bloquante.
**Constat historique, avec le partenaire AMI (système)** — remplacé le 2026-10-26 par les assertions ci-dessus avec `dinum-dn` (la visibilité observée venait du 201 d'AMI, pas d'un défaut de consentement ; à confirmer avec DN) : ancien mode constat (`consentement.usage.test.ts`) : sans consentement et inbox ouverte, la notification est publiée (`verifyPartnerConsent: false`) et le test observe pendant 5 s, puis après rechargement (8 s), si elle apparaît (`OBS S5.2 …` ou `ANOMALIE ? S5.2 …`) sans jamais échouer sur ce point. Seul le fait certain est asserté : consentement redonné, une seconde notification apparaît dans l'inbox. **Constat du 2026-10-15 (préprod, un run)** : `ANOMALIE ? S5.2 : la notification publiée SANS consentement est visible dans l'inbox (avant rechargement : true, après : true)`. Elle est donc visible dès la publication, consentement retiré (backend confirmé), et reste visible après rechargement. La démo filmée du même jour le confirme, et elle reste visible une fois le consentement redonné : le constat de S5.1 (« visible après activation ») est moins fort que celui-ci. La seconde notification, publiée avec consentement, apparaît (fait asserté). L'attente « n'apparaît pas » reste non confirmée (question à Édouard) ; rien n'est durci.

### S6.3 — D1 prime refusée sans consentement, jamais reçue ; D1 bis reçue après consentement  (implémenté dans `consentement-demarches.usage.test.ts`, dinum-dn)
Décision de l'utilisateur (2026-10-26), qui remplace les attentes « mise à jour de D1 absente » et « D1/D2 absentes des notifications après consentement » (une démarche est une notification : D1 bis y apparaît normalement). Champ discriminant : `content_link` (backend, `ami/followup/schemas.py` : le lien externe d'une démarche est le dernier `content_link` non vide de toutes les notifications REÇUES). `content_body` est obligatoire (non vide) : il sert de marqueur, pas de champ vide.
Étant donné le consentement DN retiré (par l'interface ; le backend le confirme)
Quand le partenaire publie D1 prime (corps, sous-titre, lien) par appel direct
Alors le backend la **refuse** (404) ; après 4 s et rechargement, elle est **absente** du Suivi et des notifications
Quand le consentement est redonné (par l'interface)
Et que le partenaire publie D1 bis (même `item_id`, corps seul : ni sous-titre ni lien)
Alors D1 bis est au Suivi, D1 prime toujours absente
Et le détail de la démarche n'a PAS le bouton « Accéder à ma démarche » (champ vide comme dans D1 bis) et ne contient ni le corps ni le sous-titre de D1 prime : l'app n'a jamais reçu D1 prime
Et D1 bis est dans les notifications, D1 prime n'y est jamais
Restauration : consentement d'origine (`after()`). Les démarches publiées restent sur le compte.
