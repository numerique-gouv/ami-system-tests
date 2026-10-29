/** Inbox notifications (`/#/notifications`), entièrement dans la WebView. */
export const notificationsLocators = {
  pageTitle: 'Notifications',
  /** Chaque notification de la liste est un <h3>. */
  notificationItem: 'h3',
  /** Éléments dont le premier, hors navigation, est le titre de la notification du haut. */
  topTitleCandidates: 'h1, h2, h3, [role="heading"], a[href]',
  /** Textes de navigation à exclure des candidats. */
  navigationTexts: ['Retour à la page précédente', 'Gérer', 'Notifications', ''],
  /** Titre imprévisible (horodaté) : XPath sur le texte propre exact. */
  notificationTitle: (title: string): string => {
    if (title.includes('"')) throw new Error(`Titre de notification avec guillemet non géré : ${title}`)
    return `//*[normalize-space(text())="${title}"]`
  },
}
