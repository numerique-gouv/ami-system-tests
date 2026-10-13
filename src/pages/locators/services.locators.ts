import {roleSelector} from '../../helpers/selectors'

/**
 * Sélecteurs de Services (`/#/services`), des checklists (`/#/checklist/{id}`) et de la fiche
 * d'un service partenaire. WebView/webapp, DOM identique ; ciblage par nom accessible (vérifié en
 * live le 2026-10-02). Onglets : `role=tab`.
 */
export const servicesLocators = {
  /** Entrée (bouton) dont le texte visible contient `fragment` : titre d'une carte, d'une checklist… */
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
  seeAllProceduresName: 'Voir toutes les démarches',
  otvRoute: '/services/service/psl/OperationTranquilliteVacances',
  /** Un compteur « fait/total » apparaît dans le nom des sections d'une checklist (ex. « Cas général 0/7 »). */
  checklistSectionPattern: /\d+\/\d+$/,
}
