/**
 * Sélecteurs de Aide et contact (`/#/help-center`), Contact (`/#/contact`) et des pages légales
 * (`/#/page/{slug}`). WebView/webapp, DOM identique — vérifié en live le 2026-10-02.
 * Les liens sortants (service-public.gouv.fr, demarche.numerique.gouv.fr) quittent la SPA :
 * seule la présence des entrées est testée, pas la disponibilité de ces sites tiers.
 */
export const aideContactLocators = {
  helpTitle: 'Aide et contact',
  helpAppProblemEntry: 'Je rencontre un problème sur l’application',
  contactTitle: 'Nous contacter',
  contactTeamButtonName: 'Contacter notre équipe',
  contactOnlineRequestName: 'Faire une demande en ligne',
  contactMailName: 'Envoyer un mail',
}
