import AllureReporter from '@wdio/allure-reporter'
import LoginPage from '../pages/login.page'
import FranceConnectPage from '../pages/franceconnect.page'
import OnboardingNotificationsPage from '../pages/onboarding-notifications.page'
import HomePage from '../pages/home.page'
import DemarchesPage from '../pages/demarches.page'
import {publishNotification} from '../helpers/notifications-api'
import {getUser} from '../helpers/test-users'

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

  before(async () => {
    await AllureReporter.addFeature('Démarches')
    await AllureReporter.addSeverity('critical')

    itemId = `E2E-${new Date().toISOString()}`
    title  = `Demarche E2E ${itemId}` // Démarche avec l'accent plante la recherche par innerText (document.body.innerText.includes(t))
    urlV1  = `https://staging.partenaire.example/demarches/${itemId}/v1`
    urlV2  = `https://staging.partenaire.example/demarches/${itemId}/v2`

    await LoginPage.reviewEnvironmentPicker()
    await LoginPage.tapFranceConnect()
    await FranceConnectPage.loginWithSandbox(user)
    await OnboardingNotificationsPage.dismiss()
    try {
      await LoginPage.tapFranceConnect(1000)
    } catch {
      // absent dans la majorité des cas
    }
    const ready = await HomePage.isHomeVisible(60000)
    if (!ready) throw new Error('SPA home non prête après 60s')
  })

  it("crée une démarche visible dans le suivi (statut new)", async () => {
    await AllureReporter.addStep('1. Publier la notification avec tous les champs')
    let titleNew = `${title} 0`;
    await publishNotification({
      title: titleNew,
      body:              'Corps de la notification E2E',
      recipientFcHash:   user.fcHash,
      privateBody:       'Contenu privé E2E',
      icon:              'fr-icon-notification-3-line',
      itemType:          'OTV',
      itemId,
      itemStatusLabel:   'Brouillon',
      itemGenericStatus: 'new',
      itemCanal:         'AMI',
      itemExternalUrl:   urlV1,
    })

    await AllureReporter.addStep('2. Attendre que la démarche apparaisse sur la page d\'accueil')
    await HomePage.waitForDemarche(titleNew)

    await AllureReporter.addStep('3. Ouvrir la page de suivi des démarches')
    await HomePage.ouvreSuivi()

    await AllureReporter.addStep('4. Vérifier la présence de la démarche avec le statut "Brouillon"')
    await DemarchesPage.waitForItemWithStatus(titleNew, 'Brouillon')
    await DemarchesPage.waitForItemExternalUrl(titleNew, urlV1)

    await AllureReporter.addStep('5. Vérifier que la démarche est absente des "Passées"')
    await DemarchesPage.switchToPassees()
    await DemarchesPage.assertItemAbsent(titleNew)
  })

  it("met à jour l'URL externe de la démarche (statut wip)", async () => {
    let titleUpdate = `${title} 1`
    await AllureReporter.addStep('1. Publier la notification avec la nouvelle URL')
    await publishNotification({
      title: titleUpdate,
      body:              'Mise à jour E2E',
      recipientFcHash:   user.fcHash,
      itemType:          'OTV',
      itemId,
      itemStatusLabel:   'En cours',
      itemGenericStatus: 'wip',
      itemCanal:         'AMI',
      itemExternalUrl:   urlV2,
    })

    await AllureReporter.addStep("2. Retour sur la page d'accueil")

    await DemarchesPage.goToHome()

    await AllureReporter.addStep('3. Attendre que la démarche apparaisse sur la page d\'accueil')
    await HomePage.waitForDemarche(titleUpdate)

    await AllureReporter.addStep('4. Ouvrir la page de suivi des démarches')
    await HomePage.ouvreSuivi()

    await AllureReporter.addStep('5. Vérifier que la démarche utilise la nouvelle URL (V2)')
    await DemarchesPage.waitForItemWithStatus(titleUpdate, 'En cours')
    await DemarchesPage.waitForItemExternalUrl(titleUpdate, urlV2)

    await AllureReporter.addStep('6. Vérifier que la démarche est absente des "Passées"')
    await DemarchesPage.switchToPassees()
    await DemarchesPage.assertItemAbsent(titleUpdate)
  })

  it("ferme la démarche (statut closed)", async () => {
    let titleClosing = `${title} 2`
    await AllureReporter.addStep('1. Publier la notification de clôture')
    await publishNotification({
      title:             titleClosing,
      body:              'Clôture E2E',
      recipientFcHash:   user.fcHash,
      itemType:          'OTV',
      itemId,
      itemStatusLabel:   'Terminé',
      itemGenericStatus: 'closed',
      itemCanal:         'AMI',
      itemExternalUrl:   urlV2,
    })

    await AllureReporter.addStep("2. Retour sur la page d'accueil")
    await DemarchesPage.goToHome()

    await AllureReporter.addStep('3. Ouvrir la page de suivi des démarches')
    await HomePage.ouvreSuivi()
    await AllureReporter.addStep('4. Vérifier que la démarche est absente des "En cours"')
    await DemarchesPage.assertItemAbsent(titleClosing)

    await AllureReporter.addStep('5. Basculer sur l\'onglet "Passées"')
    await DemarchesPage.switchToPassees()

    await AllureReporter.addStep('6. Vérifier la démarche clôturée avec le statut "Terminé"')
    await DemarchesPage.waitForItemWithStatus(titleClosing, 'Terminé')
    await DemarchesPage.waitForItemExternalUrl(titleClosing, urlV2)
  })
})
