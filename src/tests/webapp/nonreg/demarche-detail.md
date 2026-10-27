# Redirections vers le détail d'une démarche (recette)

Réunion 09:49–12:39 et 57:38 : « avant, ça ramenait à la liste, maintenant ça ramène à l'item ». Assertion clé : la **référence dossier**
lue sur la tuile / la notification est retrouvée sur l'écran de détail.

### S9.1 — Depuis l'Accueil
Étant donné une démarche « D3 » (référence « R3 ») publiée, consentement actif
Quand l'usager clique la tuile de « D3 » sur l'Accueil **non confirmé : la tuile affiche la référence**
Alors l'écran Détail d'une démarche affiche « D3 » et « référence dossier : R3 »
Quand il utilise le retour
Alors il retrouve l'Accueil **non confirmé**

### S9.2 — Depuis le Suivi
Étant donné la démarche « D3 »
Quand l'usager ouvre le Suivi puis la tuile de « D3 »
Alors le détail affiche « D3 » et « R3 »
Quand il utilise le retour
Alors il retrouve la liste du Suivi

### S9.3 — Depuis une notification
Étant donné la démarche « D3 » et une notification de contenu `contentLink` vers « D3 »
Quand l'usager ouvre l'inbox puis la notification
Alors le détail affiche « D3 » et « R3 » (et non la liste du Suivi)

### S9.4 — Depuis l'Agenda  (✅ couvert par S8.1)
Voir S8.1 dans [zones-agenda.md](zones-agenda.md).

### S12.1 — Connexion silencieuse FranceConnect sur une démarche
**Assertion proposée, à valider avec Édouard.**
Observé le 2026-10-15 : « Déclaration de changement d'adresse » (psl) ne passe ni par la mire ni par les identifiants FranceConnect (le jeton `caller` est posé par AMI), mais **aboutit sur la page « Se connecter | Service Public »** (200, lien « S’identifier avec FranceConnect ») : la connexion silencieuse n'y a donc pas abouti de bout en bout, ou n'est pas activée pour cette démarche (**non confirmé**).
Étant donné la carte « Déclaration de changement d'adresse » de l'écran Services
Quand l'usager l'ouvre
Alors l'URL finale n'est ni la mire FranceConnect ni une page d'erreur
Et la page finale est un formulaire de connexion Service Public : **avertissement journalisé, non bloquant** (constat à faire valider ; seule la page finale est observée, pas les redirections intermédiaires)

### S13.1 — Sous-démarche rattachée à la bonne démarche parente
**Assertion proposée, à valider avec Édouard** (rattachement des sous-démarches).
Étant donné une démarche parente « P » et une démarche enfant « E » (`publishDemarcheEnfant`, parent = P), et une autre démarche « Q »
Quand l'usager ouvre le détail de « P »
Alors la démarche « E » est listée sous « P »
Quand il ouvre le détail de « Q »
Alors « E » n'y figure pas

## Déjà couvert par les specs existantes (pas de nouveau scénario)

| Sujet de la réunion | Couvert par |
|---|---|
| « Voir toutes mes démarches » mène à la liste, « Voir tous mes évènements » à l'agenda (12:32–12:46) | `src/tests/webapp/accueil.smoke.test.ts` (ces deux boutons) — **à rejouer** : j'ai durci `SuiviDemarchesPage.assertDisplayed()` (h1) après la dernière exécution de cette spec |
| Un message envoyé s'affiche dans la démarche, dans l'ordre (26:23) | `src/tests/webapp/suivi.usage.test.ts` (`assertDetail` : messages dans l'ordre chronologique) |
| Cycle de vie d'une démarche new → wip → closed (05:54–06:07) | `src/tests/webapp/suivi.usage.test.ts` |

## Hors scénario (remarques d'UX de la réunion)

- Les messages d'une démarche ne sont pas repliables, les sous-démarches sont « en bas de tous les messages » (27:15–27:37) : suggestion de produit, pas un test.
- Le rattachement des sous-démarches aux démarches parentes (S13.1) reste à valider avec Édouard (26:54).

