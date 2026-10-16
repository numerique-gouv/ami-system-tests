import {roleSelector} from '../../helpers/selectors'

/**
 * Contenu de l'accueil rendu par la SPA (WebView/webapp, DOM identique), vérifié en live le 2026-10-02.
 * L'app n'expose aucun identifiant natif (resource-id, accessibilityIdentifier) pour cet écran.
 * Sélecteurs WDIO 10 : `role/…[name=…]` (nom exact, cf. selectors.ts) ou `tag*=texte` (texte visible contient).
 */
export const homeContentLocators = {
  /** <h1> « Bonjour <prénom> » (prénom inconnu d'avance : texte qui contient « Bonjour »). */
  greeting: 'h1*=Bonjour',
  agendaHeading: roleSelector('heading', 'Mon agenda'),
  proceduresHeading: roleSelector('heading', 'Mes démarches'),
  /** Bouton cloche : texte visible « Voir les notifications(<n>) », n variable. */
  notificationsBell: 'button*=Voir les notifications',
  seeAllEvents: roleSelector('button', 'Voir tous mes évènements'),
  seeAllProcedures: roleSelector('button', 'Voir toutes mes démarches'),
  /**
   * Diapositive VISIBLE du carrousel (Splide, `type: 'loop'`, une par page) — le seul parent unique : la boucle ajoute des
   * clones (`splide__slide--clone`, `aria-hidden`, et `is-active` aussi) qui répètent chaque carte (relevé le 2026-10-13 :
   * 6 diapositives pour 2 cartes). Les cartes se cherchent DANS elle : `$(visibleSlide).$(carte)`.
   */
  visibleSlide: 'li.splide__slide.is-visible:not(.splide__slide--clone)',
  /**
   * Flèche « suivante » par la classe de Splide, pas par son nom : en bout de boucle le nom devient « Aller à la première
   * diapositive » (i18n de Splide). Transparente (`.splide__arrows { opacity: 0 }`) hors survol : cliquée avec `$().click()`.
   */
  carouselNext: '.splide__arrow--next',
  /** Bouton affiché à la place des démarches tant qu'aucun consentement n'est actif (relevé en live le 2026-10-15, Accueil et Suivi). */
  followButton: roleSelector('button', 'Je veux suivre mes démarches'),
  addressCard: roleSelector('button', 'Renseignez votre adresse'),
  otvCard: roleSelector('button', 'Opération Tranquillité Vacances'),
}
