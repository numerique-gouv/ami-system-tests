/**
 * Sélecteurs de l'écran d'onboarding « Zones scolaires » (SPA Svelte, route `/#/welcome/zones`).
 *
 * Affiché par `login-callback/+page.svelte` quand l'URL de retour OIDC porte
 * `user_first_login=true`, avant l'écran d'onboarding des notifications.
 *
 * WebView/webapp, DOM identique : un seul jeu de sélecteurs (pas de getXxxLocators()).
 * Ciblage par nom accessible (CONTRIBUTING.md §2). Vérifié en live sur staging le 2026-10-02 :
 * <h2>Zones scolaires</h2>, bouton « Passer » (data-testid="skip-button" existe aussi).
 */
export interface OnboardingZonesLocators {
  skipButtonName: RegExp // « Passer »
}

export const onboardingZonesLocators: OnboardingZonesLocators = {
  skipButtonName: /^passer/i,
}
