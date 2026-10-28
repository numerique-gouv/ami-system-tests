import HomePage from '../../pages/home.page'
import SuiviDemarchesPage from '@pages/suivi-demarches.page'
import DemarcheDetailPage from '../../pages/demarche-detail.page'
import {getBackendUrl, PARTNER_AMI, grantDemarchesConsent, publishDemarche} from '../../helpers/partner-api'
import {getUser} from '../../helpers/common/test-users'
import {isBackendPageOutsideSpa} from '../../helpers/common/first-screen'
import {getAppToStartingState} from '../../pages/authenticate.process'
import {step} from '@helpers/reporting/report'
import {platform} from '../../platform'

/**
 * Retour à l'accueil après un lien de démarche : le lien mène à une page du backend hors de la SPA (404 sur staging) ;
 * `getAppToStartingState()` doit ramener l'app sur l'accueil de la SPA, sans notification ni Réglages.
 */
describe("Démarches — retour à l'accueil après le lien externe", function () {
    this.timeout(240000)
    const user = getUser('avec_nom_dusage')

    before(async () => {
        await getAppToStartingState()
        await grantDemarchesConsent(PARTNER_AMI, user.fcHash)
    })

    it("getAppToStartingState revient à l'accueil de la SPA", async () => {
        const itemId = `E2E-${new Date().toISOString()}`
        const title = `Demarche E2E ${itemId}`
        const url = `${getBackendUrl()}/demarches/${itemId}/v1`

        step('1. Publier une démarche portant un lien externe et suivre ce lien')
        await publishDemarche({title, body: 'Retour accueil E2E', recipientFcHash: user.fcHash, contentLink: url, itemType: 'OTV', itemId, status: 'new'})
        await platform().inWebContext(async () => {
            await HomePage.ouvreSuivi()
            await SuiviDemarchesPage.waitForDemarche(title)
            await SuiviDemarchesPage.ouvreDemarche(title)
            await DemarcheDetailPage.assertLienExterne(url)
        })

        step("2. Revenir à l'état de départ")
        await getAppToStartingState()

        step("3. L'accueil de la SPA est affiché")
        await platform().inWebContext(async () => {
            await HomePage.assertHomeVisible()
            const current = await browser.getUrl()
            expect(isBackendPageOutsideSpa(current, getBackendUrl())).toBe(false)
        })
    })
})
