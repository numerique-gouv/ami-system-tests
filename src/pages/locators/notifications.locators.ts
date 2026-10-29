/** Inbox notifications (`/#/notifications`), entièrement dans la WebView. */
export const notificationsLocators = {
  pageTitle: 'Notifications',
  /** Chaque notification de la liste est un <h3>. */
  notificationItem: 'h3',
  /** Titre imprévisible (horodaté) : XPath sur le texte propre exact. */
  notificationTitle: (title: string): string => {
    if (title.includes('"')) throw new Error(`Titre de notification avec guillemet non géré : ${title}`)
    return `//*[normalize-space(text())="${title}"]`
  },
}
