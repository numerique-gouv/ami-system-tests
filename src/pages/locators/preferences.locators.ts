/**
 * Sélecteurs de Préférences (`/#/preferences`, `/preferences/consents`, `/preferences/notifications`).
 * WebView/webapp, DOM identique — vérifié en live le 2026-10-02.
 * Les cases à cocher du suivi des démarches (consentements aux DÉMARCHES, une par partenaire) sont identifiées par leur attribut `name` : `dinum-ami`, `dinum-dn`,
 * `dinum-rdvsp`, `psl`, `Test`, `test-test` (consentements aux démarches), `notification-toggle` (interrupteur GLOBAL des notifications push, distinct des consentements par partenaire).
 */
export const preferencesLocators = {
  pageTitle: 'Préférences',
  entries: ['Suivi des démarches', 'Notifications', 'Zones scolaires'],
  demarchesConsentsTitle: 'Suivi des démarches',
  notificationsTitle: 'Notifications',
  pushNotificationsToggleName: 'notification-toggle',
  /** Bouton qui active tous les consentements (relevé en live le 2026-10-15). */
  followAllDemarchesName: 'Tout suivre',
  /** Toast « Attention » affiché en décochant AMI (relevé en live le 2026-10-15). Apostrophes typographiques de la SPA. */
  demarchesConsentWarning: 'vous ne pourrez plus les suivre dans l’application',
  demarchesConsentWarningHistory: 'L’historique de vos démarches est conservé',
}
