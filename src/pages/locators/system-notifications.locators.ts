/**
 * Éléments NATIFS Android liés aux notifications (aucun n'est dans la WebView).
 *
 * - Écran « Paramètres » d'AMI (SettingsScreen.kt) : la route SPA `/#/preferences/notifications` est « promue » en natif par
 *   l'app (NavigatorMapping : PREFERENCES_NOTIFICATIONS_ACTIVATION -> Screen.Settings). Son seul interrupteur est un composant Compose,
 *   sans resource-id : on le cible par son attribut `checkable` (relevé en live le 2026-10-26, API 36).
 * - Réglages système de l'app (Settings$AppNotificationSettingsActivity) : interrupteur « All <app> notifications », resource-id système stable.
 */
export const systemNotificationsLocators = {
  /** Titre de l'écran natif « Paramètres » d'AMI. */
  amiSettingsTitle: 'android=new UiSelector().text("Paramètres")',
  /** Interrupteur de cet écran (seul élément cochable). */
  amiSettingsSwitch: 'android=new UiSelector().checkable(true)',
  /** Interrupteur « All AMI … notifications » des réglages système de l'app. */
  osAppNotificationsSwitch: 'id=android:id/switch_widget',
  /** Boîte de dialogue système « Allow AMI … to send you notifications? » (GrantPermissionsActivity, resource-id stables du contrôleur de permissions). */
  permissionAllowButton: 'id=com.android.permissioncontroller:id/permission_allow_button',
  /** Notification affichée dans le volet : titre exact (imprévisible, horodaté), donc recherché par texte. */
  shadeNotification: (title: string): string => {
    if (title.includes('"')) throw new Error(`Titre de notification avec guillemet non géré : ${title}`)
    return `android=new UiSelector().text("${title}")`
  },
}

/**
 * Éléments NATIFS iOS liés aux notifications (relevés en live le 2026-10-27, simulateur iOS 26.5, langue française ; libellés localisés).
 *
 * - Écran « Paramètres » d'AMI (SettingsView.swift) : feuille SwiftUI avec UN interrupteur. L'arbre natif l'expose DEUX fois : la ligne entière
 *   (Switch libellée « Recevoir les notifications sur mon appareil mobile », dont le tap tombe sur le texte, sans effet) et le vrai contrôle
 *   (Switch SANS libellé) : seul celui-ci bascule. Même chose dans l'app Réglages.
 * - App Réglages (com.apple.Preferences) : le simulateur n'a pas de rubrique « Notifications » à la racine ; le chemin est
 *   Apps > AMI staging > Notifications > « Autoriser les notifications ».
 * - Bannière (SpringBoard) : `NotificationShortLookView`, libellé « <APP>, maintenant, <titre>, <corps> ».
 */
export const iosSystemNotificationsLocators = {
  amiSettingsTitle: '-ios predicate string:type == "XCUIElementTypeStaticText" AND label == "Paramètres"',
  /** Bouton « Fermer » de la feuille (un second « Fermer », invisible, appartient à la SPA derrière). */
  amiSettingsClose: '-ios predicate string:type == "XCUIElementTypeButton" AND label == "Fermer" AND visible == 1',
  /** Ligne libellée de l'interrupteur (sa valeur `1`/`0` reflète l'état) ; le tap se fait sur le bord droit de son cadre, là où est le vrai contrôle. */
  amiSettingsSwitch: '-ios predicate string:type == "XCUIElementTypeSwitch" AND label == "Recevoir les notifications sur mon appareil mobile"',
  /** Interrupteur « Autoriser les notifications » de l'app Réglages : repère de la page finale (ligne entière, libellée). */
  osSettingsSwitch: '-ios predicate string:type == "XCUIElementTypeSwitch" AND label == "Autoriser les notifications"',
  osAllowNotificationsRow: '-ios predicate string:type == "XCUIElementTypeSwitch" AND label == "Autoriser les notifications"',
  osNotificationsRow: '-ios predicate string:type == "XCUIElementTypeButton" AND label BEGINSWITH "Notifications, "',
  osAppRow: '-ios predicate string:type == "XCUIElementTypeButton" AND label == "AMI staging"',
  osAppsRow: '-ios predicate string:type == "XCUIElementTypeButton" AND label == "Apps"',
  osAppsRowQuery: 'label == "Apps" AND type == "XCUIElementTypeButton"',
  banner: (title: string): string => `-ios predicate string:name == "NotificationShortLookView" AND label CONTAINS ${JSON.stringify(title)}`,
}
