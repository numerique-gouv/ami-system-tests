// Page native seule : éléments Android et iOS des notifications et de leurs réglages système (aucun n'est dans la WebView).
const android = {
  /** Écran « Paramètres » d'AMI : son seul interrupteur est un composant Compose sans resource-id, ciblé par `checkable`. */
  amiSettingsTitle: 'android=new UiSelector().text("Paramètres")',
  amiSettingsSwitch: 'android=new UiSelector().checkable(true)',
  /** Réglages système de l'app : interrupteur « All <app> notifications ». */
  osAppNotificationsSwitch: 'id=android:id/switch_widget',
  /** Boîte de dialogue système de permission. */
  permissionAllowButton: 'id=com.android.permissioncontroller:id/permission_allow_button',
  /** Titre exact, imprévisible (horodaté) : recherché par texte. */
  shadeNotification: (title: string): string => {
    if (title.includes('"')) throw new Error(`Titre de notification avec guillemet non géré : ${title}`)
    return `android=new UiSelector().text("${title}")`
  },
}

// Éléments natifs iOS (libellés en français). Les interrupteurs sont exposés deux fois : la ligne libellée (dont le tap tombe sur le texte)
// et le vrai contrôle sans libellé ; on lit la valeur de la ligne et on tape son bord droit.
const ios = {
  amiSettingsTitle: '-ios predicate string:type == "XCUIElementTypeStaticText" AND label == "Paramètres"',
  /** Un second « Fermer », invisible, appartient à la SPA derrière la feuille. */
  amiSettingsClose: '-ios predicate string:type == "XCUIElementTypeButton" AND label == "Fermer" AND visible == 1',
  amiSettingsSwitch: '-ios predicate string:type == "XCUIElementTypeSwitch" AND label == "Recevoir les notifications sur mon appareil mobile"',
  /** App Réglages : repère de la page finale Apps > AMI staging > Notifications. */
  osSettingsSwitch: '-ios predicate string:type == "XCUIElementTypeSwitch" AND label == "Autoriser les notifications"',
  osNotificationsRow: '-ios predicate string:type == "XCUIElementTypeButton" AND label BEGINSWITH "Notifications, "',
  osAppRow: '-ios predicate string:type == "XCUIElementTypeButton" AND label == "AMI staging"',
  osAppsRow: '-ios predicate string:type == "XCUIElementTypeButton" AND label == "Apps"',
  osAppsRowQuery: 'label == "Apps" AND type == "XCUIElementTypeButton"',
  /** Bannière SpringBoard : libellé « <APP>, maintenant, <titre>, <corps> ». */
  banner: (title: string): string => `-ios predicate string:name == "NotificationShortLookView" AND label CONTAINS ${JSON.stringify(title)}`,
}

export const systemNotificationsLocators = {android, ios}
