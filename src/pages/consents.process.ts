import HomePage from './home.page'
import NavigationPage from './navigation.page'
import PreferencesPage from './preferences.page'
import {PARTNER_AMI, PARTNER_DN, checkDemarchesConsent, grantDemarchesConsent, hasPartnerCredentials, revokeDemarchesConsent, type PartnerId} from '../helpers/partner-api'

/** Ouvre Préférences › Suivi des démarches depuis l'application. */
export async function openDemarchesConsents(): Promise<void> {
  await PreferencesPage.open()
  await PreferencesPage.openDemarchesConsents()
}

/**
 * Sort de Préférences et y revient (Accueil puis réouverture) : la SPA relit le serveur à l'entrée dans l'écran, sans recharger la page
 * (constaté le 2026-10-28 : un consentement changé par l'API y apparaît au retour). Préférences n'a pas de barre basse : on repart de l'Accueil.
 */
export async function reopenDemarchesConsents(): Promise<void> {
  await NavigationPage.goToRoute('/')
  await HomePage.assertHomeVisible()
  await openDemarchesConsents()
}

/** Le consentement du partenaire aux démarches vu par le backend atteint-il `expected` ? (la bascule d'une case est asynchrone) */
export async function waitForBackendDemarchesConsent(partner: PartnerId, fcHash: string, expected: boolean): Promise<void> {
  await browser.waitUntil(async () => await checkDemarchesConsent(partner, fcHash) === expected, {
    timeout: 10000, interval: 500, timeoutMsg: `Le backend ne renvoie pas « consentement ${partner} = ${expected} » après 10000ms`,
  })
}

/**
 * Rétablit l'état d'origine relevé dans `before()` : par les cases, puis par l'API (un test a pu changer un consentement sans passer
 * par la case ; DN seulement si ses identifiants sont fournis).
 */
export async function restoreDemarchesConsents(original: Record<string, boolean>, fcHash: string): Promise<void> {
  await openDemarchesConsents()
  await PreferencesPage.restoreDemarchesConsents(original)
  const partners = hasPartnerCredentials(PARTNER_DN) ? [PARTNER_AMI, PARTNER_DN] : [PARTNER_AMI]
  for (const partner of partners) {
    if (original[partner]) await grantDemarchesConsent(partner, fcHash)
    else await revokeDemarchesConsent(partner, fcHash)
  }
}

/** Décoche toutes les cases de Préférences › Suivi des démarches (4 en préprod, 6 en staging) ; retourne leurs clés. */
export async function uncheckAllDemarchesConsents(): Promise<string[]> {
  const keys = Object.keys(await PreferencesPage.demarchesConsentStates())
  for (const key of keys) await PreferencesPage.setDemarchesConsent(key, false)
  return keys
}
