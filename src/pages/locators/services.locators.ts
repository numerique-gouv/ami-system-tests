/**
 * Sélecteurs de Services (`/#/services`), des checklists (`/#/checklist/{id}`) et de la fiche
 * d'un service partenaire. WebView/webapp, DOM identique ; ciblage par nom accessible (vérifié en
 * live le 2026-10-02). Onglets : `role=tab`.
 */
export const servicesLocators = {
  pageTitle: 'Services',
  sosHeading: 'SOS, j’ai un problème !',
  checklistsHeading: 'Comment faire si ... ?',
  directoryHeading: 'Je recherche un service public, une administration',
  checklists: [
    'Je crée une association',
    'Je deviens parent',
    'Je pars vivre à l’étranger',
    'Je souhaite accompagner mon enfant de 15 à 18 ans dans ses droits et ses démarches',
    'Je suis affecté à l’étranger',
  ],
  seeAllProceduresName: 'Voir toutes les démarches',
  otvRoute: '/services/service/psl/OperationTranquilliteVacances',
  otvServiceTitle: 'Opération Tranquillité Vacances',
  otvBenefitButtonName: 'Bénéficier de ce service',
  /** Un compteur « fait/total » apparaît dans le nom des sections d'une checklist (ex. « Cas général 0/7 »). */
  checklistSectionPattern: /\d+\/\d+$/,
}
