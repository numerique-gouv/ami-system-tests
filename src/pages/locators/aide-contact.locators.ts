/**
 * Sélecteurs de Aide et contact (`/#/help-center`), Contact (`/#/contact`) et des pages légales
 * (`/#/page/{slug}`). WebView/webapp, DOM identique — vérifié en live le 2026-10-02.
 * Les liens sortants (service-public.gouv.fr, demarche.numerique.gouv.fr) quittent la SPA :
 * seule la présence des entrées est testée, pas la disponibilité de ces sites tiers.
 */
export const aideContactLocators = {
  helpTitle: 'Aide et contact',
  helpAdministrationEntry: 'J’ai besoin de l’aide de l’administration',
  helpAppProblemEntry: 'Je rencontre un problème sur l’application',
  contactTitle: 'Nous contacter',
  contactTeamButtonName: 'Contacter notre équipe',
  contactOnlineRequestName: 'Faire une demande en ligne',
  contactMailName: 'Envoyer un mail',
  personalDataTitle: 'Données personnelles et sécurité',
  personalDataSections: [
    'Qui traite vos données ?',
    'Finalité et base légale',
    'Catégories de données et durée de conservation',
    'Qui sont les destinataires de vos données',
    'Quels sont vos droits sur vos données et comment les exercer',
    'Transfert de données hors de l’union européenne',
  ],
  accessibilityTitle: 'Accessibilité',
  accessibilitySections: ['Déclaration d’accessibilité', 'Retour d’information et contact', 'Voies de recours'],
}
