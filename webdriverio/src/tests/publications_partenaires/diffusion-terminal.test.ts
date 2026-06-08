import AllureReporter from '@wdio/allure-reporter'

/**
 * Section 3.2 du backlog `docs/parcours_partenaires.md`.
 *
 * Vérifie la diffusion d'une notification reçue par AMI vers le terminal usager :
 * push natif via Firebase Cloud Messaging si terminal enrôlé + permission OS,
 * fallback dans l'inbox in-app, et réception temps réel via websocket app ouverte.
 * Driver : Appium mobile.
 */
describe("Publications partenaires — diffusion vers le terminal usager", () => {
  before(async () => {
    await AllureReporter.addFeature('Publications partenaires')
    await AllureReporter.addSeverity('critical')
    // TODO pré-requis :
    //   - usager FranceConnect sandbox connecté
    //   - helper publishNotification disponible (src/helpers/notifications-api.ts)
    //   - Numéro d'identification correspondant à l'usager connecté
  })

  it.skip("reçoit un push natif quand les notifications OS sont acceptées et le terminal enrôlé FCM", async () => {
    // 1. Compléter l'onboarding avec acceptation des notifications OS
    // 2. Vérifier l'enrôlement FCM (token transmis au back-end)
    // 3. Publier une notification via l'API partenaire
    // 4. Vérifier la réception du push natif (titre + corps) côté terminal
  })

  it.skip("affiche la notification dans l'inbox in-app quand l'usager a refusé le push OS", async () => {
    // 1. Compléter l'onboarding sans acceptation des notifications OS
    // 2. Publier une notification via l'API partenaire
    // 3. Vérifier l'absence de push natif
    // 4. Vérifier la présence de la notification dans l'inbox in-app
    // Référence : src/tests/notifications.test.ts (scénario vanilla déjà implémenté)
  })

  it.skip("reçoit la notification en temps réel via websocket quand l'app est ouverte", async () => {
    // 1. Ouvrir l'app et atteindre une page rafraîchie par websocket
    // 2. Publier une notification via l'API partenaire
    // 3. Vérifier l'apparition immédiate dans l'UI sans rechargement (cf. notifications.test.ts)
  })

  it.skip("ouvre la bonne page après un tap sur le push, app fermée", async () => {
    // 1. Fermer l'app
    // 2. Publier une notification avec une cible interne précise (deep link)
    // 3. Taper sur le push depuis la barre de notification
    // 4. Vérifier que l'app s'ouvre directement sur l'écran cible
  })
})
