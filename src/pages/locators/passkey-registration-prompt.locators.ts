/**
 * Sélecteurs de l'écran de proposition de création de clé d'accès (passkey), affiché sur
 * `/login-callback` après l'authentification FranceConnect, avant l'onboarding notifications.
 *
 * WebView, DOM identique Android/iOS/webapp (route SPA Svelte `login-callback/+page.svelte`,
 * gardée par le feature flag `PUBLIC_FEATURE_FLAG_SILENT_FC_ENABLED` côté app — n'apparaît donc
 * pas systématiquement). Ciblage par nom accessible (CONTRIBUTING.md §2 : sélecteur sémantique
 * avant data-testid), bien que l'app expose aussi `data-testid="create-passkey-button"`.
 *
 * Non validé en live (feature flag/état utilisateur non reproduits localement au moment de
 * l'écriture) — dérivé directement du composant source
 * `ami-notifications-api/public/mobile-app/src/routes/login-callback/+page.svelte`.
 */

export interface PasskeyRegistrationPromptLocators {
  createButtonName: RegExp // "Ajouter une clé d'accès"
  laterButtonName: RegExp  // "Peut-être plus tard"
}

export const passkeyRegistrationPromptLocators: PasskeyRegistrationPromptLocators = {
  createButtonName: /ajouter une clé/i,
  laterButtonName: /plus tard/i,
}

// Pas de getXxxLocators() — un seul jeu cross-platform (écran WebView pur)