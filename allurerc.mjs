import { defineConfig } from 'allure'

/**
 * Configuration Allure Report 3 — remplace categories.json / environment.properties
 * (absents en Allure 3, cf. https://allurereport.org/docs/v3/migrate/).
 *
 * historyPath : fichier unique en JSON Lines (append), remplace le dossier
 * allure-report/history/ d'Allure 2. Restauré/publié en CI comme artefact séparé
 * (cf. .github/workflows/workflow-e2e-main.yml) — requis pour que les compteurs
 * new/flaky/retry et les tendances ne restent pas à zéro.
 */
export default defineConfig({
  name: 'AMI — tests système E2E',
  output: './allure-report',
  historyPath: './.allure/history.jsonl',
  appendHistory: true,

  // Widget "Metadata" du rapport. AMI_ENV pilote aussi le picker mobile et
  // resolveEnvironment() côté webapp (cf. CLAUDE.md §Secrets).
  variables: {
    'Environnement AMI': process.env.AMI_ENV ?? 'staging',
    'Node': process.version,
  },

  // Partitionne le rapport fusionné (webapp+android sur la même VM, cf.
  // workflow-e2e-main.yml) à partir du label posé par beforeTest dans
  // wdio.base.conf.ts — nécessaire pour éviter que des tests homonymes sur deux
  // plateformes soient vus comme des retries l'un de l'autre (cf. commentaire
  // beforeTest et docs/adr/2026-08-04-Integration-continue-Github-Actions.md).
  environments: {
    webapp: {
      matcher: ({ labels }) => labels.some((l) => l.name === 'platform' && l.value === 'webapp'),
    },
    android: {
      matcher: ({ labels }) => labels.some((l) => l.name === 'platform' && l.value === 'android'),
    },
    ios: {
      matcher: ({ labels }) => labels.some((l) => l.name === 'platform' && l.value === 'ios'),
    },
  },

  // Règles évaluées dans l'ordre — la première qui matche gagne. Construites à partir
  // des messages d'erreur réellement levés dans src/helpers/ (pas de vocabulaire inventé) :
  // src/helpers/access-code.ts, src/helpers/notifications-api.ts, et des timeouts
  // WebdriverIO/Appium génériques (waitForDisplayed/waitUntil, contexte WebView perdu).
  categories: {
    rules: [
      {
        id: 'env-locale-manquante',
        name: 'Configuration locale manquante (.env.local)',
        matchers: {
          message: /WEB_APP_ACCESS_KEYS est absent|Variable d'environnement manquante/,
        },
        groupBy: ['environment'],
      },
      {
        id: 'api-notifications-partenaire',
        name: "Échec API partenaire (publishNotification)",
        matchers: {
          message: /PUT \/api\/v2\/event/,
        },
        groupBy: ['environment', { label: 'feature' }],
      },
      {
        id: 'contexte-webview-perdu',
        name: 'Contexte WebView/Appium perdu ou session fermée',
        matchers: {
          message: /no such context|session is either terminated|invalid session id/,
        },
        groupBy: ['environment'],
      },
      {
        id: 'timeout-attente-element',
        name: "Timeout d'attente d'un élément (waitForDisplayed / waitUntil)",
        matchers: {
          message: /waitForDisplayed|waitUntil|still not displayed|element.*not found/i,
          statuses: ['broken', 'failed'],
        },
        groupBy: ['environment', { label: 'feature' }],
      },
      {
        id: 'flaky-ou-regresse',
        name: 'Flaky ou régressé',
        matchers: [{ flaky: true }, (data) => data.transition === 'regressed'],
        groupBy: ['environment', 'transition'],
      },
    ],
  },

  plugins: {
    awesome: {
      options: {
        reportName: 'AMI E2E',
        singleFile: false,
        reportLanguage: 'fr',
      },
    },
  },
})
