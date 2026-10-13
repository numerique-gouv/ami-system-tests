/**
 * Contenu de l'accueil rendu par la SPA (WebView/webapp, DOM identique), par nom accessible —
 * vérifié en live le 2026-10-02. L'app n'expose aucun identifiant natif (resource-id,
 * accessibilityIdentifier) pour cet écran : tout passe par `src/helpers/spa.ts`.
 */
export const homeContentLocators = {
  greetingPattern: /^Bonjour /,
  agendaHeading: 'Mon agenda',
  proceduresHeading: 'Mes démarches',
  seeAllEventsName: 'Voir tous mes évènements',
  seeAllProceduresName: 'Voir toutes mes démarches',
  notificationsBellName: /^Voir les notifications/,
  /** Cartes du carrousel (chacune apparaît plusieurs fois dans le DOM). */
  carouselNextName: 'Diapositive suivante',
  addressCardName: 'Renseignez votre adresse',
  otvCardName: 'Opération Tranquillité Vacances',
}
