import type { Locator } from './onboarding.locators'

/**
 * Sélecteurs de l'inbox notifications (SPA Svelte, WebView).
 *
 * La majorité des sélecteurs sont des CSS/XPath WebView, à utiliser après
 * switchContext('WEBVIEW_*') via withWebView().
 *
 * Exception : `bellNativeAndroid` — si la cloche est exposée nativement en Android
 * (contentDescription), elle peut être tapée depuis NATIVE_APP. En pratique, Maestro
 * la trouve dans la WebView via regex `Icône de notification.*`, ce qui suggère que
 * le bouton n'a pas de contentDescription natif. À valider avec Appium Inspector.
 *
 * Les sélecteurs CSS sont des suppositions raisonnables sur la structure Svelte —
 * à affiner lors du premier run si les éléments ne sont pas trouvés.
 */

export interface NotificationsLocators {
  // Sélecteur WebView CSS pour l'icône cloche dans le header SPA
  bellCss:           Locator
  // XPath WebView du heading "Notifications" (à affiner si la structure DOM diffère)
  inboxHeadingXpath: Locator
  // CSS WebView : présence d'au moins un [aria-label] dans l'inbox (page rendue)
  inboxReadyCss:     Locator
  // CSS WebView : bouton "Gérer" unique à la vue inbox (sentinel de navigation)
  inboxGererCss:     Locator
  // CSS WebView du titre du premier item de la liste
  firstItemCss:      Locator
}

/**
 * Sélecteurs vérifiés par Maestro inspect_screen sur le staging réel.
 *
 * Home : la cloche a id="notification-icon" (HTML confirmé).
 * Inbox : heading "Notifications" visible en texte ; les items ont aria-label = titre.
 *         firstItemAriaLabel cible le premier aria-label qui n'est pas un label de nav.
 */
export const notificationsLocators: NotificationsLocators = {
  // Span/SVG intérieur de la cloche — id stable dans le DOM Svelte (confirm Maestro inspect_screen)
  bellCss:           '#notification-icon',
  // normalize-space(.) inclut les descendants (couvre <h1><span>Notifications</span></h1>)
  inboxHeadingXpath: '//*[normalize-space(.)="Notifications"]',
  // Sentinel de rendu de l'inbox : présence de n'importe quel élément avec aria-label
  inboxReadyCss:     '[aria-label]',
  // Bouton "Gérer" unique à la vue inbox (sentinel de navigation, apparaît dans le header)
  inboxGererCss:     '[aria-label="Icône de paramétrage Gérer"]',
  firstItemCss:      '[aria-label]:not([aria-label=""]):not([aria-label="Retour à la page précédente"]):not([aria-label="Icône de paramétrage Gérer"])',
}

/**
 * XPath WebView qui localise un item de l'inbox par son titre exact.
 * À utiliser avec withWebView() puis $( notifItemXpath(title) ).
 */
export function notifItemXpath(title: string): string {
  // Échappe les guillemets dans le titre pour éviter les injections XPath
  const escaped = title.replace(/"/g, '&quot;')
  return `//*[normalize-space(.)="${escaped}"] | //*[contains(@aria-label, "${escaped}")]`
}

// Pas de getXxxLocators() — un seul jeu cross-platform (SPA identique iOS/Android)
