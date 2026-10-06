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
  consentsPartnerNames: ['dinum-ami', 'dinum-dn', 'dinum-rdvsp', 'psl', 'Test', 'test-test'],
  amiConsentName: 'dinum-ami',
  followAllButtonName: 'Tout suivre',
  notificationsTitle: 'Notifications',
  notificationToggleName: 'notification-toggle',
  notificationToggleLabel: 'Recevoir les notifications sur mon appareil mobile',
  consentLabelPattern: /^Suivre mes démarches .+ sur mon appareil mobile$/,
}
