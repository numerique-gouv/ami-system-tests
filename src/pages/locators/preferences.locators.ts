/**
 * Préférences (`/#/preferences`, `/preferences/consents`, `/preferences/notifications`), WebView et webapp.
 * Les cases du suivi des démarches sont identifiées par leur attribut `name` (`dinum-ami`, `dinum-dn`, `dinum-rdvsp`, `psl`, `Test`, `test-test`) ;
 * `notification-toggle` est l'interrupteur global des notifications push.
 */
export const preferencesLocators = {
  pageTitle: 'Préférences',
  entries: ['Suivi des démarches', 'Notifications', 'Zones scolaires'],
  demarchesConsentsTitle: 'Suivi des démarches',
  notificationsTitle: 'Notifications',
  pushNotificationsToggleName: 'notification-toggle',
  followAllDemarchesName: 'Tout suivre',
  /** Toast « Attention » affiché en décochant AMI. Apostrophes typographiques de la SPA. */
  demarchesConsentWarning: 'vous ne pourrez plus les suivre dans l’application',
  demarchesConsentWarningHistory: 'L’historique de vos démarches est conservé',
}
