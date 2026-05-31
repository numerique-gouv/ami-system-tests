// Sélecteurs iOS — aucune logique conditionnelle.
// Chaque propriété output.xxx est une chaîne Maestro utilisée via ${output.xxx} dans les YAML.
// iOS sans accessibilityIdentifier : on cible le texte visible (AMIL10n fallbacks en français).

output.reviewPicker_title   = 'Choix de la review';
output.reviewPicker_default = 'Staging';             // première entrée (environnement de base)

// HomeView — pas d'écran FC natif sur iOS : le bouton FC est dans la WebView SPA.
// fc_button cible le bouton FranceConnect dans la WebView Svelte (tapOn + attente notVisible).
// fc_back_button cible le bouton natif "AMI ◁" (HomeView.swift:42) visible sur les pages OIDC.
output.fc_button      = 'S’identifier avec FranceConnect'; // texte du bouton dans la SPA WebView (+page.svelte:126)
output.fc_back_button = 'AMI';           // AMIL10n.amiTitle (Label natif OIDC, HomeView.swift:48)
output.fc_description = 'Pour accéder à vos droits'; // texte visible dans la SPA WebView
output.fc_info        = "Qu'est ce que FranceConnect ?";
output.fc_tchap       = 'Contactez-nous sur Tchap';

output.login_identifier_label = 'Identifiant';
output.login_password_label = 'Mot de passe';
output.login_identifier = 'avec_nom_dusage';
output.login_password = '123';
output.fc_hash = 'b09ba1d3248ce7dcaf159b271923545bc5ea977ff50919e5244861cfdf4b2ddb';
output.login_submit_label = 'Valider';

// OnboardingView (sheet SwiftUI — mêmes chaînes qu'Android, OnboardingView.swift:17,35,46)
output.onboarding_title  = 'Activez les notifications pour suivre vos démarches';
output.onboarding_desc   = 'Recevez des alertes de suivi';
output.onboarding_enable = 'Activer';
output.onboarding_later  = 'Peut-être plus tard';

// SettingsView (sheet SwiftUI — fermeture via bouton "Fermer" dans toolbar, SettingsView.swift:20)
output.settings_open_button = '^[A-Z]$';        // avatar profil SPA (initiale utilisateur, regex exact)
output.settings_menu_first   = 'Mon profil';    // 1er item du menu — sentinel d'accessibilité WebView
output.settings_menu_prefs   = 'Préférences';   // entrée du menu profil → déclenche /#/settings
output.settings_menu_logout  = 'Me déconnecter'; // entrée du menu profil → logout
output.settings_title       = 'Paramètres';
output.settings_notif_label = 'Recevoir les notifications sur mon appareil mobile';
output.settings_back        = 'Fermer'; // AMIL10n.commonClose (Strings-Generated.swift:20)

// InformationBanner hors-ligne (AMIAppState.swift:54)
output.offline_indicator = 'Vous êtes hors ligne';
output.offline_title     = 'Problème de connexion Internet';
output.offline_desc      = 'Vérifiez votre réseau';

// Mire de login FranceConnect mock (WebView OIDC, même contenu sur les deux plateformes)
// Formulaire FCP-LOW mock (WebView) : labels HTML non accessibles via l'arbre d'accessibilité.
output.login_identifier   = 'avec_nom_dusage';
output.login_password     = '123';
output.login_submit_label = 'Valider';
output.fc_hash = 'b09ba1d3248ce7dcaf159b271923545bc5ea977ff50919e5244861cfdf4b2ddb';
    
// Bouton export logs (HomeView.swift:88)
output.logs_button     = 'Télécharger les logs';
output.logs_share_hint = 'Copier'; // UIActivityViewController iOS

// Notifications push
output.os_allow_button    = 'Autoriser'; // dialog système UNUserNotificationCenter en FR
output.inbox_url_hash     = '/#/notifications'; // fragment SPA Svelte — inbox notifications
output.notification_icon  = 'Icône de notification.*'; // icône cloche header SPA Svelte
