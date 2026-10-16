import ErrorPage from '../../pages/error.page'
import {getAppToStartingState} from '../../pages/authenticate.process'

/** Pages d'erreur statiques de la SPA, atteintes par leur route. Lecture seule. */
describe('Pages d\'erreur', function () {
  this.timeout(180000) // WDIO lit le délai avant d'exécuter un it/hook : il se pose au niveau du describe
  before(async function () {
    await getAppToStartingState()
  })

  afterEach(async function () {
    await getAppToStartingState()
  })

  const pages: Array<[string, string]> = [
    ['/network-error', 'Problème de connexion Internet'],
    ['/technical-error', 'Petit problème de notre côté...'],
    ['/forbidden', 'L’application n’est pas ouverte au public'],
  ]
  for (const [route, title] of pages) {
    it(`${route} affiche « ${title} »`, async () => {
      await ErrorPage.openRoute(route)
      await ErrorPage.assertDisplayed(title)
    })
  }
})
