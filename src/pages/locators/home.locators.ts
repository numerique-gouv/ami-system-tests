import type { Locator } from './types'

/**
 * L'app AMI est 100% Svelte SPA rendue dans un android.webkit.WebView / WKWebView.
 * Il n'existe aucun resource-id Android ni accessibilityIdentifier iOS côté natif
 * (les écrans Compose/SwiftUI n'exposent pas de testTag).
 *
 * Stratégie :
 *   screenRoot → sélecteur natif qui détecte la présence du conteneur WebView
 */
export interface HomeLocators {
  screenRoot:    Locator  // Natif : conteneur WebView
}

export const androidHomeLocators: HomeLocators = {
  // UiSelector sur la classe du conteneur WebView (seul identifiant natif disponible)
  screenRoot:    'android=new UiSelector().className("android.webkit.WebView")',
}

export const iosHomeLocators: HomeLocators = {
  // XCUITest : type WebView natif
  screenRoot:    '//XCUIElementTypeWebView',
}

/**
 * Contenu de l'accueil rendu par la SPA (WebView/webapp, DOM identique), par nom accessible —
 * vérifié en live le 2026-10-02.
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

export function getHomeLocators(): HomeLocators {
  return driver.isIOS ? iosHomeLocators : androidHomeLocators
}
