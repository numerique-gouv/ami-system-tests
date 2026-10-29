import {AssertionError} from 'node:assert'
import logger from '@wdio/logger'
import ServicesPage from '../../../pages/services.page'
import {getAppToStartingState} from '../../../pages/authenticate.process'
import {describeDeferred, describeTarget, isBrokenTarget, isDeferred, isExpectedUnreachable, toleratedUnreachableWarning, isLoginWall, titleMentionsCard, type DeferredLink, type LinkTarget} from '../../../helpers/webapp/link-check'
import {step} from '../../../helpers/reporting/report'

const log = logger('test')

/**
 * Smoke — aucun lien cassé dans le catalogue des démarches et outils (onglet « Démarches et outils » de Services).
 * Les moments de vie (« Trouver de l'aide ») sont dans moments-de-vie.parcours.test.ts, les listes d'étapes dans liste-etapes.parcours.test.ts.
 * Réunion du 2026-10-06 : « tous les liens du catalogue, quand on clique, on n'arrive pas sur une 404 ».
 *
 * Chaque carte ou entrée est cliquée pour obtenir sa cible : les boutons n'exposent aucune adresse dans le DOM (elle est calculée au
 * clic). Une cible externe sans jeton n'est pas chargée : le clic est intercepté, puis la page est contrôlée en HTTP (concurrence
 * bornée). Une adresse à jeton à usage unique (catalogue Service Public) est suivie par le navigateur (`followAndDescribe`).
 * Rien de plus que `hôte + chemin` n'est affiché ou journalisé.
 */
describe('Non-régression — catalogue des démarches et outils (smoke)', function () {
  // Délai posé ICI et non dans le corps du test : WDIO fixe son propre délai d'après le délai du test AVANT de l'exécuter
  // (@wdio/utils, executeAsync), un `this.timeout()` écrit dans un `it` ou un hook arrive trop tard et reste à 120 s.
  this.timeout(900000)

  beforeEach(async function () {
    await getAppToStartingState()
  })

  it('chaque carte du catalogue mène à une page valide', async function () {
    await ServicesPage.open()
    await ServicesPage.assertDisplayed()
    const labels = await ServicesPage.catalogueLabels()
    expect(labels.length).toBeGreaterThan(0)
    expect(labels.every(label => label.length > 0)).toBe(true)
    log.info(`catalogue : ${labels.length} cartes`)

    const broken: string[] = []
    const loginWalls: string[] = []
    const judge = (label: string, target: LinkTarget): void => {
      if (target.internal) return
      if (isBrokenTarget(target)) {
        const line = `« ${label} » → ${describeTarget(target)} (statut ${target.status}, titre « ${target.title} »)`
        if (isExpectedUnreachable(target)) log.warn(toleratedUnreachableWarning(line))
        else broken.push(line)
      }
      else if (isLoginWall(target)) loginWalls.push(`« ${label} » → ${describeTarget(target)} (« ${target.title} »)`)
      // S1.5, règle PROVISOIRE (avertissement seulement, jamais un échec) : le titre de la page doit contenir le nom de la carte.
      if (!isBrokenTarget(target) && !titleMentionsCard(target.title, label)) {
        log.warn(`ANOMALIE ? Titre de la page « ${target.title} » sans rapport avec la carte « ${label} »`)
      }
    }

    // Cartes sans jeton dans leur adresse : cible interceptée au clic (jamais chargée), contrôlée ensuite en HTTP, en parallèle.
    // Les autres (jeton à usage unique, route interne) sont suivies par le navigateur, comme avant.
    const deferred: {label: string, link: DeferredLink}[] = []
    for (const [index, label] of labels.entries()) {
      step(`${index + 1}/${labels.length} — ${label}`)
      const target = await ServicesPage.openCatalogueCard(index, {deferExternal: true})
      if (isDeferred(target)) {
        // Navigation annulée : la page est restée affichée, la liste des cartes est toujours valide.
        deferred.push({label, link: target})
        continue
      }
      judge(label, target)
      // Un lien suivi par le navigateur recharge la SPA au retour : les cartes sont reconstruites, l'onglet affiché est celui par défaut.
      await ServicesPage.returnFromExternal()
      await ServicesPage.catalogueLabels()
    }
    step(`contrôle HTTP de ${deferred.length} cible(s) interceptée(s)`)
    const described = await describeDeferred(deferred)
    for (const [position, {label}] of deferred.entries()) judge(label, described[position])

    // Une page de connexion répond 200 : elle n'est pas un lien cassé, mais le signaler évite de la prendre pour un succès.
    if (loginWalls.length > 0) log.warn(`ANOMALIE ? ${loginWalls.length} carte(s) aboutissent sur une page de connexion : ${loginWalls.join(' | ')}`)
    if (broken.length > 0) throw new AssertionError({message: `${broken.length} lien(s) cassé(s) sur ${labels.length} :\n${broken.join('\n')}`})
  })
})
