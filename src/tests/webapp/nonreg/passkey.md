# Onboarding passkey (recette)

Réunion 01:12–01:40. L'authentificateur virtuel WebAuthn est déjà monté dans `before` de `wdio.webapp.conf.ts`.
Le parcours doit partir d'une session vierge (comme `authentification.smoke.test.ts`, dont le profil Chrome est supprimé avant la spec).

### S11.1 — « Peut-être plus tard » passe à la suite
Étant donné un usager qui vient de s'authentifier via FranceConnect et arrive sur l'onboarding passkey
Quand il clique « Peut-être plus tard »
Alors l'écran suivant de l'onboarding (zones scolaires) s'affiche

### S11.2 — « Ajouter une clé » crée une passkey  (**suspendu, `it.skip`**)
Raison : crée une passkey persistante sur le compte de préprod partagé, sans suppression connue ; à jouer sur un compte dédié après accord de l'équipe.
Étant donné un usager sur l'onboarding passkey
Quand il clique « Ajouter une clé » **non confirmé : libellé ; locator noté « non validé en live »**
Alors une credential est enregistrée dans l'authentificateur virtuel (`getCredentials`)
Et l'écran suivant de l'onboarding s'affiche
