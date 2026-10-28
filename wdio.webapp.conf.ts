import path from 'path'
import type { Options } from '@wdio/types'
import fs from 'fs'
import { baseConfig, traceRootDir, traceServices } from './wdio.base.conf'
import { resolveEnvironment } from './src/helpers/common/environment'
import { captureAppWindow } from './src/platform/browser.adapter'
import { handleAccessKeyCookie } from './src/helpers/webapp/access-code'
import { setBackendUrl } from './src/helpers/partner-api'

const { webappUrl, apiUrl } = resolveEnvironment()

// Pas de picker natif en webapp (cf. resolveEnvironment) pour déclencher setBackendUrl()
// comme EnvironmentPickerPage.reviewEnvironmentPicker() le fait côté mobile — on le fixe
// donc ici une fois pour toute la session, dès le chargement de la config.
setBackendUrl(apiUrl)

// WEBAPP_HEADLESS=false (just test-webapp) ouvre un Chrome dédié visible,
// lancé par WDIO/Chromedriver — pratique pour observer le run en local. Par défaut (CI via
// just test-webci), headless.
const headless = process.env.WEBAPP_HEADLESS !== 'false'

const chromeProfileDir = path.resolve(__dirname, '.cache/chrome-profiles', path.basename(traceRootDir('webapp')))

function removeChromeProfile(): void {
  if (chromeProfileDir.includes(`${path.sep}chrome-profiles${path.sep}`)) fs.rmSync(chromeProfileDir, { recursive: true, force: true })
}

let specFailed = false // un worker = une spec : la variable ne vit que pour elle

// Dimensions du viewport émulé (Pixel 7, cf. mobileEmulation ci-dessous) — réutilisées pour
// dimensionner la fenêtre réelle en headless (cf. before()).
const deviceMetrics = { width: 412, height: 915 }

export const config: Options.Testrunner = {
  ...baseConfig,

  rootDir: traceRootDir('webapp'),

  specs: [path.resolve(__dirname, 'src/tests/webapp/**/*.test.ts')],

  baseUrl: webappUrl,

  // Cache persistant (gitignoré) plutôt que $TMPDIR, que macOS purge.
  cacheDir: path.resolve(__dirname, '.cache'),

  capabilities: [
    {
      browserName: 'chrome',
      webSocketUrl: true,
      // `eager` : les commandes (clic, navigation) reviennent dès `DOMContentLoaded`, sans attendre l'événement `load` des ressources tierces
      // lentes des pages externes (service-public.gouv.fr/contact bloquait les commandes ~1 min). Les helpers qui lisent l'état du document
      // (`followAndDescribe`) ne dépendent pas de `load`.
      pageLoadStrategy: 'eager',
      'goog:chromeOptions': {
        args: [
          ...(headless ? ['--headless=new'] : []),
          // Profil Chrome propre à ce run (jamais partagé entre deux runs simultanés), conservé d'une spec à l'autre : la session
          // ouverte par une spec est reprise par les suivantes (cookies), sans se réauthentifier. Supprimé en début et fin de série
          // (il contient les cookies de session).
          `--user-data-dir=${chromeProfileDir}`,
        ],
        // Désactive la bulle native "Enregistrer le mot de passe ?" de Chrome après la
        // connexion FranceConnect — sans lien avec la boîte de dialogue passkey (cf.
        // addVirtualAuthenticator() dans before() ci-dessous pour celle-ci), gardé par
        // prudence pour ne pas masquer les éléments de l'app sous cette bulle.
        prefs: {
          credentials_enable_service: false,
          'profile.password_manager_enabled': false,
        },
        // Pas de detach : Chrome se ferme avec la session (fin de chaque spec) et libère le profil ci-dessus, que la spec
        // suivante rouvre. Avec detach:true, Chrome resterait ouvert et verrouillerait ce profil (non vérifié en mode visible).
        detach: false,
        // La SPA est conçue pour un rendu WebView mobile — émulation d'un viewport de
        // référence (dimensions Pixel 7, cf. src/driver/capabilities.ts:ANDROID_DEVICE_NAME)
        // plutôt qu'un rendu desktop, pour rester cohérent avec les locators partagés.
        mobileEmulation: {
          deviceMetrics: { ...deviceMetrics, pixelRatio: 2.625 },
          userAgent:
            'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) ' +
            'Chrome/128.0.0.0 Mobile Safari/537.36',
        },
      },
    } as WebdriverIO.Capabilities,
  ],

  // Pas de service Appium — session Chrome pilotée directement par WebdriverIO/Chromedriver.
  // En mode visible, le service devtools (mode trace) fait clignoter la fenêtre : il prend une capture d'écran avant chaque action
  // (clic, navigation…) et à chaque assertion, sans option pour l'éviter ; sous émulation mobile, chaque capture Chromedriver
  // applique puis annule un changement de métriques (effet « zoom »). Traces donc actives en headless (CI), coupées en visible,
  // sauf WEBAPP_TRACE=1 pour les réactiver.
  services: headless || process.env.WEBAPP_TRACE === '1' ? [...traceServices] : [],
  before: async (): Promise<void> => {
    // La navigation initiale et la capture du window handle sont spécifiques à la webapp (pas de notion
    // d'onglet côté Appium/mobile) : gérées ici.
    // Authenticator virtuel WebDriver (spec WebAuthn niveau 2) : sans lui, tout appel
    // navigator.credentials.create()/.get() — qu'il vienne d'un clic explicite sur "Ajouter
    // une clé d'accès" ou d'une offre automatique de Chrome après une connexion par mot de
    // passe (observé en pratique juste après FranceConnectCredentialsPage.fillCredentials())
    // — délègue à l'authenticateur de la plateforme et ouvre une boîte de dialogue système
    // (macOS Trousseau/Touch ID) hors DOM : aucune commande WebDriver ne peut plus l'atteindre
    // ni la fermer, la session entière reste figée jusqu'au timeout Mocha. L'enregistrer route
    // ces appels vers l'authenticateur virtuel (isUserConsenting: approuve sans prompt).
    await browser.addVirtualAuthenticator(
      'ctap2', 'internal',
      /* hasResidentKey */ true, /* hasUserVerification */ true,
      /* isUserConsenting */ true, /* isUserVerified */ true
    )
    // Aligne la fenêtre réelle sur le viewport émulé (cf. deviceMetrics ci-dessus) — sans ça,
    // la fenêtre headless par défaut est trop petite et les actions WebDriver (scrollIntoView,
    // click…) échouent en "move target out of bounds" dès qu'un élément sort de cette zone.
    await browser.setWindowSize(deviceMetrics.width, deviceMetrics.height)
    // Équivalent webapp du lancement automatique de l'app mobile via les capabilities.
    // Les mobiles commencent sur une première page (sélecteur d'environnement, login, accueil).
    // Cette première navigation vers l'accueil place les scénarios webapp au même endroit que les scénarios mobiles.
    // On en profite pour valider le code d'accès (gate window.prompt() côté SPA) — sans passer
    // par le popup : handleAccessKeyCookie() pose directement le cookie access_key en amont,
    // ce qui couvre ensuite toute la session (cookie navigateur, pas besoin de le rejouer).
    await handleAccessKeyCookie(webappUrl)
    await browser.url(webappUrl)
    // Capture le handle de cet onglet une fois pour toutes, avant qu'un flow OIDC ne puisse
    // en ouvrir d'autres — cf. src/platform/browser.adapter.ts pour pourquoi (partenaires
    // FranceConnect/DN/CNSM/OTC… inconnus à l'avance, un handle stable évite d'avoir à les
    // reconnaître par URL).
    await captureAppWindow()
  },

  // authentification.smoke.test.ts et nonreg/passkey.usage.test.ts supposent une session vierge (la webapp démarre sur l'écran de connexion) : le
  // profil Chrome conservé, qui porte la session ouverte par les specs précédentes, est supprimé avant le démarrage du navigateur.
  beforeSession: (_config, _capabilities, specs): void => {
    if (specs.some(spec => spec.endsWith('authentification.smoke.test.ts') || spec.endsWith('passkey.usage.test.ts'))) removeChromeProfile()
  },

  // Une spec en échec laisse sa session (cookies, stockage de la SPA) dans le profil conservé : la suivante repart d'un profil neuf plutôt que
  // d'un état peut-être sali par l'échec (onglets et fenêtres de dialogue, eux, meurent avec le Chrome de la session).
  after: (result: number): void => { specFailed = result !== 0 },
  afterSession: (): void => { if (specFailed) removeChromeProfile() },

  // Début et fin de série : le profil Chrome de ce run est supprimé (début : état propre, fin : il contient les cookies de session).
  onPrepare: (): void => removeChromeProfile(),
  onComplete: [baseConfig.onComplete as () => void, (): void => removeChromeProfile()],
} as Options.Testrunner
