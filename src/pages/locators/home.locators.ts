import {roleSelector} from '../../helpers/spa/selectors'

export const homeContentLocators = {
  /** <h1> « Bonjour <prénom> » : le prénom est inconnu d'avance. */
  greeting: 'h1*=Bonjour',
  agendaHeading: roleSelector('heading', 'Mon agenda'),
  proceduresHeading: roleSelector('heading', 'Mes démarches'),
  /** Le nombre de notifications du texte visible varie. */
  notificationsBell: 'button*=Voir les notifications',
  seeAllEvents: roleSelector('button', 'Voir tous mes évènements'),
  seeAllProcedures: roleSelector('button', 'Voir toutes mes démarches'),
  /** Diapositive visible du carrousel Splide, hors clones (`aria-hidden`, qui répètent chaque carte) : les cartes se cherchent dans elle. */
  visibleSlide: 'li.splide__slide.is-visible:not(.splide__slide--clone)',
  /** Par classe et non par nom (il change en bout de boucle) ; transparente hors survol : cliquer avec `$().click()`. */
  carouselNext: '.splide__arrow--next',
  /** Affiché à la place des démarches tant qu'aucun consentement n'est actif. */
  followButton: roleSelector('button', 'Je veux suivre mes démarches'),
  addressCard: roleSelector('button', 'Renseignez votre adresse'),
  otvCard: roleSelector('button', 'Opération Tranquillité Vacances'),
}
