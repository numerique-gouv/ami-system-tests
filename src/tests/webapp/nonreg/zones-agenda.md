# Zones scolaires et agenda (recette)

Réunion 01:40–03:08, 12:46–14:43. Deux vérifications distinctes : (1) le réglage dans Préférences, (2) l'effet dans l'Agenda.
La suppression d'un élément d'agenda est **définitive** pour l'usager (seul un reset utilisateur ou une reconnexion restaure les éléments fixes) :
le scénario S10 ne supprime que des éléments créés par le test.

## Observé en préprod (2026-10-15)

- Zones (`#/preferences/zones`, page et non dialogue) : 13 cases ; **Zone A, Zone B, Zone C, Corse cochées** à l'origine.
- La tuile « Vacances de la Toussaint » **ne cite aucune zone** (identique pour tous). C'est « **Vacances d'Hiver** » (6 février) qui cite : « Zone C », « Zone A, Corse », « Zone B » avec leurs dates. Décocher Zone B la fait disparaître de cette tuile et reste décochée après rechargement. Vérifié, puis restauré.
- Agenda : chaque élément est un conteneur avec un bouton « Ouvrir les options pour <titre> » (`data-testid="agenda-item-<clé>-open-modal-button"` ; avant le 2026-10-26 : « Ouvrir la modale liée à l’élément de l’agenda », `open-agenda-item-modal-*`) et un titre `h4 > button` (`data-testid="agenda-item-link"`). Le clic sur le titre d'un jour férié ne fait rien ; c'est le bouton d'ouverture qui ouvre la modale (`dialog`, bouton « Fermer » ; action « Masquer l’élément de l’agenda <titre> », texte visible « Masquer », `data-testid="agenda-item-<clé>-hide-button"` ; ex-« Cacher… »/« Supprimer » avant le 2026-10-26).
- Entrée liée à une démarche (jalon) : **non encore observée** (publication à faire par la spec).

### S7 — Retirer une zone se reflète dans les préférences et l'agenda, la remettre aussi
Étant donné un usager dont « Zone B » est cochée, et une tuile de l'agenda qui la cite (la première trouvée : « Vacances d'Hiver » en octobre 2026, **non confirmé** pour les autres périodes — hors vacances affichées le scénario est ignoré avec un avertissement)
Quand il ouvre Préférences > Zones scolaires et décoche « Zone B »
Alors, après rechargement de la page, « Zone B » est décochée
Quand il ouvre l'Agenda
Alors le texte de la tuile ne cite pas « Zone B » et cite encore une autre zone
Quand il recoche « Zone B »
Et qu'il ouvre l'Agenda
Alors la tuile cite de nouveau « Zone B »
Restauration : zones d'origine

### S8.1 — Une démarche avec échéance apparaît dans l'agenda et mène à son détail
Étant donné une démarche « D1 » publiée avec un jalon (`milestoneStartDate`) dans le futur, référence dossier « R1 »
Quand l'usager ouvre l'Agenda
Alors une entrée liée à « D1 » est affichée
Quand il l'ouvre
Alors l'écran Détail d'une démarche s'affiche pour « D1 » avec « référence dossier : R1 »

### S10.1 — Un élément supprimé de l'agenda disparaît et ne revient pas au rechargement  (✅ implémenté)
Étant donné une démarche « D2 » publiée avec un jalon, visible dans l'Agenda
Quand l'usager ouvre l'entrée et clique « Masquer » (texte visible ; ex-« Supprimer » avant le 2026-10-26)
Alors l'entrée n'est plus dans l'Agenda
Et, après rechargement de la page, elle reste absente
Note : l'élément a été créé par le test (pas de restauration nécessaire). La reconnexion n'est **pas** vérifiée ici : voir S10.2.

### S10.2 — Une reconnexion fait réapparaître les éléments supprimés de l'agenda  (✅ implémenté)
Source : transcript 13:53–14:09 — « même s'il se déconnecte, reconnecte, c'est une des manières de faire réafficher les éléments de l'agenda… les trucs qu'on a fixés, les vacances, ça les fera réapparaître, ça supprime toute la personnalisation ».
**Observé en préprod le 2026-10-15** (spec d'exploration jetable, supprimée) : après suppression de « Toussaint 📅 » (jour férié) **et** d'une démarche avec échéance, puis rechargement (les deux absents, 22 éléments sur 24), une déconnexion / reconnexion les fait réapparaître **tous les deux** (24 éléments). Zones scolaires (A, B, C, Corse cochées) et consentements (AMI seul) sont **inchangés** par la reconnexion.
Écart avec la réunion : Kevin dit « pas ses rendez-vous » (14:04) ; en préprod la démarche avec échéance réapparaît aussi. Intentionnel ou limite : **non confirmé** — c'est pourquoi la spec n'asserte que l'élément fixe, seul comportement affirmé par la réunion.
Étant donné un élément fixe de l'Agenda (catégorie « Vacances et jours fériés », titre ne commençant pas par « Vacances » : un jour férié, stable, indépendant des zones)
Quand l'usager le supprime
Alors il est absent après rechargement
Quand il se déconnecte puis se reconnecte via FranceConnect
Et qu'il ouvre l'Agenda
Alors l'élément fixe est de nouveau listé
Restauration : aucune (la reconnexion restaure) ; si l'élément n'est pas revenu, l'échec laisse le compte avec un élément en moins jusqu'à la prochaine déconnexion.
Effet de bord relevé : la suppression est donc une personnalisation **perdue à la déconnexion** — S10.1 reste vrai tant que l'usager ne se déconnecte pas.

### Dette de données de test relevée
L'agenda du compte `avec_nom_dusage` contient désormais une entrée par démarche avec échéance créée par S8.1, et S10.1 réapparaît à chaque déconnexion : 24 éléments dont 9 `Demarche E2E … agenda|suppression`. Aucun moyen de nettoyage n'est connu (la réunion cite la suppression des données d'un usager depuis l'Espace Partenaire, voir EP2). Les tests utilisent des titres horodatés pour s'y retrouver, mais l'agenda grossira à chaque exécution.

### S10.3 — L'état vide de l'agenda  (🚫 non décrit)
Kevin dit « on peut tout supprimer » (13:17) : le sens est « n'importe quel élément », pas « supprimer en bloc ». Le rendu d'un agenda entièrement vide n'est pas décrit par la réunion et n'a pas été observé : **aucun scénario** tant qu'il n'est pas relevé.
