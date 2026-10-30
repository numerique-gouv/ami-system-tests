import {roleSelector} from '../../helpers/spa/selectors'

export const servicesLocators = {
  /** Tous les boutons d'un onglet. */
  anyButton: 'button',
  entryContaining: (fragment: string): string => `button*=${fragment}`,
  tab: (label: string): string => roleSelector('tab', label),
  otvServiceHeading: roleSelector('heading', 'Opération Tranquillité Vacances'),
  otvBenefitButton: roleSelector('button', 'Bénéficier de ce service'),
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
  catalogueTabName: 'Démarches et outils',
  helpTabName: 'Trouver de l’aide',
  tabpanel: (tabName: string): string => roleSelector('tabpanel', tabName),
  /** Les boutons de la liste du panneau ; « Voir toutes les démarches » n'est pas dans une liste. */
  catalogueCard: 'li button',
  cyberDiagnosticName: 'Je suis victime de cybermalveillance',
  cyberIframe: 'iframe',
  otvRoute: '/services/service/psl/OperationTranquilliteVacances',
  /** Compteur « fait/total » du nom d'une section de checklist (« Cas général 0/7 »). */
  checklistSectionPattern: /\d+\/\d+$/,
}
