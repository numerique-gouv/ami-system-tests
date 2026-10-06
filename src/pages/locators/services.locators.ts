/**
 * Sélecteurs de Services (`/#/services`), des checklists (`/#/checklist/{id}`) et de la fiche
 * d'un service partenaire. WebView/webapp, DOM identique ; ciblage par nom accessible (vérifié en
 * live le 2026-10-02). Onglets : `role=tab`.
 */
export const servicesLocators = {
  pageTitle: 'Services',
  tabHelp: 'Trouver de l’aide',
  tabProcedures: 'Démarches et outils',
  sosHeading: 'SOS, j’ai un problème !',
  checklistsHeading: 'Comment faire si ... ?',
  directoryHeading: 'Je recherche un service public, une administration',
  directoryButtonName: 'Accéder à l’annuaire',
  sosEntries: ['Je suis victime de cybermalveillance', 'Signaler une violence conjugale, sexuelle ou sexiste', 'Test WebView AMI'],
  otherSubjectEntry: 'J’ai besoin d’aide sur un autre sujet',
  checklists: [
    'Je crée une association',
    'Je deviens parent',
    'Je pars vivre à l’étranger',
    'Je souhaite accompagner mon enfant de 15 à 18 ans dans ses droits et ses démarches',
    'Je suis affecté à l’étranger',
  ],
  /** Cartes partenaires de « Démarches et outils » dont le nom accessible commence par ces libellés. */
  partnerCardPrefixes: [
    'APIAS - Demande de prise en charge de soins hors de France métropolitaine',
    'Changement de situation familiale',
    'Contacter l\'équipe AMI',
    'Déclaration de changement d\'adresse',
    'Opération Tranquillité Vacances',
    'Rendez-vous',
  ],
  seeAllProceduresName: 'Voir toutes les démarches',
  otvRoute: '/services/service/psl/OperationTranquilliteVacances',
  otvServiceTitle: 'Opération Tranquillité Vacances',
  otvBenefitButtonName: 'Bénéficier de ce service',
  /** Un compteur « fait/total » apparaît dans le nom des sections d'une checklist (ex. « Cas général 0/7 »). */
  checklistSectionPattern: /\d+\/\d+$/,
}
