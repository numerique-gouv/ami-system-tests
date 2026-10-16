/**
 * Sélecteurs de Préférences (`/#/preferences`, `/preferences/consents`, `/preferences/notifications`).
 * WebView/webapp, DOM identique — vérifié en live le 2026-10-02.
 * Les cases à cocher sont identifiées par leur attribut `name` : `dinum-ami`, `dinum-dn`,
 * `dinum-rdvsp`, `psl`, `Test`, `test-test` (consentements), `notification-toggle` (notifications).
 */
export const preferencesLocators = {
  pageTitle: 'Préférences',
  entries: ['Suivi des démarches', 'Notifications', 'Zones scolaires'],
  consentsTitle: 'Suivi des démarches',
  notificationsTitle: 'Notifications',
  notificationToggleName: 'notification-toggle',
  /** Bouton qui active tous les consentements (relevé en live le 2026-10-15). */
  followAllName: 'Tout suivre',
  /** Toast « Attention » affiché en décochant AMI (relevé en live le 2026-10-15). Apostrophes typographiques de la SPA. */
  consentWarning: 'vous ne pourrez plus les suivre dans l’application',
  consentWarningHistory: 'L’historique de vos démarches est conservé',
}
