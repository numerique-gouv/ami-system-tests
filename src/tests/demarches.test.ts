import AllureReporter from '@wdio/allure-reporter'
import HomePage from '../pages/home.page'
import DemarchesPage from '../pages/demarches.page'
import DemarcheDetailPage from '../pages/demarche-detail.page'
import {getBackendUrl, publishNotification} from '../helpers/notifications-api'
import {getUser} from '../helpers/test-users'
import {authenticate} from '../helpers/authenticate'

/**
 * Cycle de vie d'une démarche partenaire dans l'app AMI.
 *
 * Vérifie que les notifications publiées via l'API partenaire avec des champs `item_*`
 * créent et mettent à jour une entrée dans le suivi de démarches de l'usager :
 *   new  → démarche créée, visible sur home et en haut des "En cours", statut "Brouillon"
 *          absente des "Passées"
 *   wip  → URL externe mise à jour (V2), toujours dans "En cours"
 *   closed → démarche clôturée, présente dans "Passées" avec statut "Terminé"
 *
 * Les 3 tests partagent le même `itemId` (même démarche, états successifs).
 * Pré-requis : variables NOTIF_* dans .env.
 */
describe("Démarches — cycle de vie via notifications partenaire", () => {
    const user = getUser('avec_nom_dusage')
    let itemId: string
    let title: string
    let urlV1: string
    let urlV2: string

    after(async () => {
        try {
            await DemarchesPage.goToHome()
        } catch { /* session déjà terminée */
        }
    })

    before(async function () {
        this.timeout(180000)
        await AllureReporter.addFeature('Démarches')
        await AllureReporter.addSeverity('critical')
        const domainUrl = getBackendUrl()
        itemId = `E2E-${new Date().toISOString()}`
        title = `Demarche E2E ${itemId}` // Démarche avec l'accent plante la recherche par innerText (document.body.innerText.includes(t))
        urlV1 = domainUrl+`/demarches/${itemId}/v1`
        urlV2 = domainUrl+`/demarches/${itemId}/v2`

        if (!await HomePage.isHomeReachable(1000)) {
            await authenticate()
        }
    })

    it("crée une démarche visible dans le suivi (statut new)", async () => {
        let titleNew = `${title} 0`;
        await AllureReporter.addStep('1. Ouvrir la page de suivi des démarches')
        await HomePage.ouvreSuivi()

        await AllureReporter.addStep('2. Publier la notification avec tous les champs')
        await publishNotification({
            title: titleNew,
            body: 'Corps de la notification E2E',
            recipientFcHash: user.fcHash,
            privateBody: 'Contenu privé E2E',
            icon: 'fr-icon-notification-3-line',
            contentLink: urlV1,
            itemType: 'OTV',
            itemId,
            itemStatusLabel: 'Brouillon',
            itemGenericStatus: 'new',
            itemCanal: 'AMI',
        })

        await AllureReporter.addStep('3. Attendre que la démarche apparaisse sur le Suivi')
        await DemarchesPage.waitForDemarche(titleNew)

        await AllureReporter.addStep('4. Vérifier statut sur la liste')
        await DemarchesPage.assertVisibleDemarcheWith(titleNew, 'Brouillon')

        await AllureReporter.addStep('5. Ouvrir la démarche et vérifier le lien externe V1')
        await DemarchesPage.ouvreDemarche(titleNew)
        await DemarcheDetailPage.assertLienExterne(urlV1)
        await DemarchesPage.navigueBackJusqua(titleNew)
    })

    it("met à jour l'URL externe de la démarche (statut wip)", async () => {
        let titleUpdate = `${title} 1`
        // Pas de HomePage.ouvreSuivi() ici : assertLienExterne() du test précédent a déjà
        // laissé l'app sur la page Suivi (cf. demarches.page.ts).
        await AllureReporter.addStep('1. Publier la notification avec la nouvelle URL')

        await publishNotification({
            title: titleUpdate,
            body: 'Mise à jour E2E',
            recipientFcHash: user.fcHash,
            contentLink: urlV2,
            itemType: 'OTV',
            itemId,
            itemStatusLabel: 'En cours',
            itemGenericStatus: 'wip',
            itemCanal: 'AMI',
        })

        await AllureReporter.addStep('2. Attendre que la démarche apparaisse sur le Suivi')
        await DemarchesPage.waitForDemarche(titleUpdate)

        await AllureReporter.addStep('3. Vérifier statut sur la liste')
        await DemarchesPage.assertVisibleDemarcheWith(titleUpdate, 'En cours')

        await AllureReporter.addStep('4. Ouvrir la démarche et vérifier le lien externe V2')
        await DemarchesPage.ouvreDemarche(titleUpdate)
        await DemarcheDetailPage.assertLienExterne(urlV2)
    })

    it("ferme la démarche (statut closed)", async () => {
        let titleClosing = `${title} 2`
        // Pas de HomePage.ouvreSuivi() ici : assertLienExterne() du test précédent a déjà
        // laissé l'app sur la page Suivi (cf. demarches.page.ts).
        await AllureReporter.addStep('1. Publier la notification de clôture')
        await publishNotification({
            title: titleClosing,
            body: 'Clôture E2E',
            recipientFcHash: user.fcHash,
            contentLink: urlV2,
            itemType: 'OTV',
            itemId,
            itemStatusLabel: 'Terminé',
            itemGenericStatus: 'closed',
            itemCanal: 'AMI',
        })
        await AllureReporter.addStep('2. Attendre que la démarche apparaisse sur le Suivi')
        await DemarchesPage.waitForDemarche(titleClosing)

        await AllureReporter.addStep('3. Vérifier statut sur la liste')
        await DemarchesPage.assertVisibleDemarcheWith(titleClosing, 'Terminé')

        await AllureReporter.addStep('4. Ouvrir la démarche et vérifier le lien externe V2')
        await DemarchesPage.ouvreDemarche(titleClosing)
        await DemarcheDetailPage.assertLienExterne(urlV2)
    })
})
