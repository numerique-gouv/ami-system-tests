import AllureReporter from '@wdio/allure-reporter'

/**
 * Section 3.1 du backlog `docs/parcours_partenaires.md`.
 *
 * Vérifie l'API de demande de notification exposée par AMI API aux partenaires :
 * authentification HTTP Basic Auth, validation du Numéro d'identification,
 * codes de retour et règles de filtrage (cf. DAT 3.5).
 *
 * Ces tests sont des appels HTTP côté driver (cf. helpers/notifications-api.ts).
 * Aucune session Appium mobile n'est strictement nécessaire pour cette suite.
 */
describe("Publications partenaires — API de demande de notification entrante", () => {
  before(async () => {
    await AllureReporter.addFeature('Publications partenaires')
    await AllureReporter.addSeverity('critical')
    // TODO pré-requis :
    //   - identifiants Basic Auth d'un partenaire de test (NOTIF_USER / NOTIF_PASS)
    //   - Numéro d'identification d'un usager connu d'AMI
    //   - URL de l'API selon l'environnement (recette)
  })

  it.skip("crée une notification quand l'appel HTTPS + Basic Auth est valide", async () => {
    // 1. POST /notifications avec Basic Auth valide + payload conforme + Numéro d'identification connu
    // 2. Vérifier la réponse 2xx
    // 3. Vérifier en base (ou via l'inbox in-app) que la notification est rattachée à l'usager
  })

  it.skip("rattache la notification au bon usager via le Numéro d'identification (dérivé FranceConnect)", async () => {
    // 1. Publier deux notifications avec deux Numéros d'identification distincts
    // 2. Vérifier côté inbox in-app que chaque usager reçoit sa notification et pas l'autre
  })

  it.skip("retourne 401 sur Basic Auth invalide (sans créer de notification)", async () => {
    // 1. POST /notifications avec un mot de passe Basic Auth incorrect
    // 2. Vérifier la réponse 401
    // 3. Vérifier qu'aucune notification n'a été créée côté AMI
  })

  it.skip("retourne une erreur explicite sur Numéro d'identification inconnu (sans créer de notification)", async () => {
    // 1. POST /notifications avec un Numéro d'identification inexistant
    // 2. Vérifier la réponse (code + message)
    // 3. Vérifier qu'aucune notification n'a été créée côté AMI
  })

  it.skip("retourne 400 sur payload invalide", async () => {
    // 1. Pour chaque cas : titre vide, corps vide, champ manquant, type incorrect
    // 2. Vérifier la réponse 400 avec un message explicite
  })

  it.skip("définit le comportement attendu en cas d'IP non autorisée (selon évolution du filtrage)", async () => {
    // À préciser — pas de filtrage IP actuellement (cf. DAT 3.5).
    // 1. Quand le filtrage sera en place, appeler depuis une IP hors liste
    // 2. Vérifier la réponse (403 ou drop) et l'absence de création
  })
})
