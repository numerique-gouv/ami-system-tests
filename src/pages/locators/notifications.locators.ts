import {roleSelector} from '../../helpers/selectors'

/**
 * Sélecteurs de l'inbox notifications (`/#/notifications`), 100 % WebView SPA (pas de sélecteur natif).
 * La page reçoit des mises à jour WebSocket en continu et est rechargée pour se rafraîchir : les éléments sont
 * donc toujours recherchés au moment de l'usage (`$()` se ré-interroge à chaque commande), jamais gardés.
 */
export const notificationsLocators = {
  /** Titre de la page inbox. */
  pageTitle: 'Notifications',
  /** Chaque notification de la liste est un <h3>. */
  notificationItem: 'h3',
  /** L'élément dont le texte propre est exactement `title` (titre imprévisible, horodaté : XPath documenté). */
  notificationTitle: (title: string): string => {
    if (title.includes('"')) throw new Error(`Titre de notification avec guillemet non géré : ${title}`)
    return `//*[normalize-space(text())="${title}"]`
  },
  /** « Gérer » : texte visible « Gérer », nom accessible = aria-label (vérifié en live le 2026-10-02). */
  manageButton: roleSelector('button', 'Gérer les notifications'),
}
