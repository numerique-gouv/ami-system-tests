import path from 'path'
import type { Options } from '@wdio/types'
import { baseConfig } from './wdio.base.conf'
import { resolveEnvironment } from './src/helpers/environment'
import { resolveSpecs } from './test-suites'
import { captureAppWindow } from './src/platform/browser.adapter'
import { registerReplHelpers } from './src/helpers/repl'
import { navigateAndHandleAccessCode } from './src/helpers/access-code'

const { webappUrl } = resolveEnvironment()

// WEBAPP_HEADLESS=false (just test-webapp / test-webapp-suite) ouvre un Chrome dédié visible,
// lancé par WDIO/Chromedriver — pratique pour observer le run en local. Par défaut (CI via
// just test-webci / test-webci-suite), headless.
const headless = process.env.WEBAPP_HEADLESS !== 'false'

export const config: Options.Testrunner = {
  ...baseConfig,

  specs: resolveSpecs(path.resolve(__dirname, 'src/tests/webapp/**/*.test.ts')),

  baseUrl: webappUrl,

  capabilities: [
    {
      browserName: 'chrome',
      'goog:chromeOptions': {
        args: headless ? ['--headless=new'] : [],
        // detach:true — le process Chrome ne dépend plus du cycle de vie de la session
        // Chromedriver : il survit à la fin de session normale ET à une interruption
        // (Ctrl+C saute tous les hooks JS, y compris after() ci-dessous). Seulement en
        // mode visible : en headless (CI), inutile de garder un process fantôme.
        detach: !headless,
        // La SPA est conçue pour un rendu WebView mobile — émulation d'un viewport de
        // référence (dimensions Pixel 7, cf. src/driver/capabilities.ts:ANDROID_DEVICE_NAME)
        // plutôt qu'un rendu desktop, pour rester cohérent avec les locators partagés.
        mobileEmulation: {
          deviceMetrics: { width: 412, height: 915, pixelRatio: 2.625 },
          userAgent:
            'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) ' +
            'Chrome/128.0.0.0 Mobile Safari/537.36',
        },
      },
    } as WebdriverIO.Capabilities,
  ],

  // Pas de service Appium — session Chrome pilotée directement par WebdriverIO/Chromedriver.
  services: [],

  before: async (): Promise<void> => {
    // Compose avec le before() partagé (registerReplHelpers, cf. wdio.base.conf.ts) plutôt que
    // de le dupliquer ou de le remplacer — la navigation initiale + capture du handle sont
    // spécifiques à la webapp (pas de notion d'onglet côté Appium/mobile), donc gérées ici.
    registerReplHelpers()
    // Équivalent webapp du lancement automatique de l'app mobile via les capabilities.
    // Les mobiles commenent sur une première page (review picker, login, home)
    // Cette première navigation vers home ammène les scenario en webapp sur les mêmes endroits que les senarios mobiles.
    // On en profite pour valider le code d'accès.
    await navigateAndHandleAccessCode('/')
    // Capture le handle de cet onglet une fois pour toutes, avant qu'un flow OIDC ne puisse
    // en ouvrir d'autres — cf. src/platform/browser.adapter.ts pour pourquoi (partenaires
    // FranceConnect/DN/CNSM/OTC… inconnus à l'avance, un handle stable évite d'avoir à les
    // reconnaître par URL).
    await captureAppWindow()
  },

  // `result` : 0 si tout est passé, non nul sinon (cf. doc WDIO du hook `after`).
  // detach:true (capabilities ci-dessus) empêche déjà toute fermeture forcée du process Chrome
  // — y compris sur Ctrl+C, qui saute ce hook. Ici on ferme explicitement la fenêtre en plus,
  // mais seulement si tout est vert : sinon, laissé ouvert pour inspection post-mortem (bug
  // applicatif, ou débogueur en pause — cf. ENSURE_APP_WINDOW_TIMEOUT_MS dans
  // src/platform/browser.adapter.ts).
  after: async (result): Promise<void> => {
    if (!headless && result === 0) {
      await browser.closeWindow().catch(() => {})
    }
  },
} as Options.Testrunner
