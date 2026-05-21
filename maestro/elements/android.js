// Sélecteurs Android — aucune logique conditionnelle.
// Chaque propriété output.xxx est une chaîne Maestro utilisée via ${output.xxx} dans les YAML.
// Android privilégie contentDescription (accessibility label) pour les éléments natifs.

output.reviewPicker_title = 'Choix de la review'; // titre de l'écran ReviewAppsScreen
output.reviewPicker_default = 'Staging';             // première entrée (environnement de base)

// FranceConnexionScreen (écran natif Android)
output.fc_button = 'franceConnect button'; // contentDescription (FranceConnexionScreen.kt:81)
// fc_description intentionnellement absent : le texte multi-ligne Compose n'est pas
// retrouvé par Maestro via assertVisible (rendu en blocs séparés).
output.fc_info = "Qu'est ce que FranceConnect ?";
output.fc_tchap = 'Contactez-nous sur Tchap';

// OnboardingNotificationScreen
output.onboarding_title = 'Activez les notifications pour suivre vos démarches';
output.onboarding_desc = 'Recevez des alertes de suivi';
output.onboarding_enable = 'Activer';
output.onboarding_later = 'Peut-être plus tard';

// SettingsScreen (plein écran natif Android)
output.settings_open_button = '^[A-Z]$';        // avatar profil SPA (initiale utilisateur, regex exact)
output.settings_menu_first = 'Mon profil';      // 1er item du menu — sentinel d'accessibilité WebView
output.settings_menu_prefs = 'Préférences';     // entrée du menu profil → déclenche /#/settings
output.settings_menu_logout = 'Me déconnecter'; // entrée du menu profil → logout
output.settings_menu_prefs_notif = 'Notifications';     // entrée du menu profil → déclenche /#/settings
output.settings_title = 'Paramètres';
output.settings_notif_label = 'Recevoir les notifications sur mon appareil mobile';
output.settings_back = 'back'; // contentDescription (BackBar.kt:37)

// WifiErrorScreen
output.offline_indicator = 'connection lost'; // contentDescription (WifiErrorScreen.kt:38)
output.offline_title = 'Problème de connexion Internet';
output.offline_desc = 'Vérifiez votre réseau';

// Mire de login FranceConnect mock (WebView OIDC, même contenu sur les deux plateformes)
// Formulaire FCP-LOW mock (WebView) : labels HTML non accessibles via l'arbre d'accessibilité.
// Identifiant pré-rempli → clearText + réécriture. Password ciblé par coordonnées.
output.login_identifier_label = 'Identifiant';
output.login_password_label = 'Mot de passe';
output.login_identifier = 'avec_nom_dusage';
output.login_password = '123';
output.fc_hash = 'b09ba1d3248ce7dcaf159b271923545bc5ea977ff50919e5244861cfdf4b2ddb';
output.login_submit_label = 'Valider';

// Bouton export logs (page contact, WebViewScreen.kt)
output.logs_button = 'Télécharger les logs';
output.logs_share_hint = 'Partager'; // Android Intent chooser

// Notifications push
output.notifications_enabled_banner = 'Les notifications ont été activées'; // strings.xml:notification_permission_granted
output.os_allow_button = 'Autoriser'; // dialog système permission notifications Android 13+
output.inbox_url_hash = '/#/notifications'; // fragment SPA Svelte — inbox notifications
