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
  /** Notification affichée dans le volet : titre exact (imprévisible, horodaté), donc recherché par texte. */
  shadeNotification: (title: string): string => {
    if (title.includes('"')) throw new Error(`Titre de notification avec guillemet non géré : ${title}`)
    return `android=new UiSelector().text("${title}")`
  },
}
