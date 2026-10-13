/**
 * Squelette d'exploration : exécute le `before` standard du projet (accès à la webapp, connexion FranceConnect, onboarding,
 * consentement partenaire), puis MET LE TEST EN PAUSE dans l'app connectée pour que vous l'explorez à la main.
 *
 * Utilisation (cf. docs/tutoriels/automatiser-un-scenario-a-la-main.md, étape 3) :
 *   1. copier ce fichier dans src/tests/webapp/ (les imports ci-dessous en dépendent) :
 *        cp docs/tutoriels/squelette-exploration.test.ts src/tests/webapp/mon-scenario.test.ts
 *   2. just debug-webapp src/tests/webapp/mon-scenario.test.ts
 *      → quelques secondes de connexion, puis « Paused in … » : la session s'appelle debug-0-0.
 *   3. dans un autre terminal : just s debug-0-0 snapshot -i  (puis find, click, fill, wait…)
 *   4. just s debug-0-0 resume  pour terminer le test ; just s debug-0-0 close pour le faire échouer à la place.
 *
 * Avant de commiter : supprimer `browser.debug()`. Le lint (règle wdio/no-debug) le refuse volontairement : une pause oubliée
 * bloquerait la CI.
 */
import {getAppToStartingState} from '../../pages/authenticate.process'

describe('Mon scénario', () => {
  // `before` standard des tests webapp (cf. src/tests/webapp/aide-contact.test.ts) : connecte l'app si besoin
  // et donne le consentement partenaire par défaut (getAppToStartingState).
  before(async function () {
    this.timeout(180000)
    await getAppToStartingState()
  })

  // Remet l'app dans l'état de départ avant chaque test : le test précédent a pu s'arrêter n'importe où (page hors SPA,
  // déconnexion, onboarding). Repart de l'état courant : la vraie connexion n'a lieu qu'au premier appel, ensuite la session
  // est reprise (rechargement de la racine). Redonne aussi le consentement partenaire.
  beforeEach(async function () {
    this.timeout(180000)   // un hook peut devoir se reconnecter : le délai par défaut (120 s) serait juste
    await getAppToStartingState()
  })

  it('à compléter', async () => {
    await browser.debug()   // PAUSE : explorer avec `just s debug-0-0 …` ; à remplacer par les étapes du scénario
  })
})
