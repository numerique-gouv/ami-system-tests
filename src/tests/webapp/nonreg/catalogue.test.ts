import {AssertionError} from 'node:assert'
import logger from '@wdio/logger'
import ServicesPage from '../../../pages/services.page'
import AideContactPage from '../../../pages/aide-contact.page'
import {getAppToStartingState} from '../../../pages/authenticate.process'
import {describeByHttp, describeTarget, isBrokenTarget, isDeferred, isExpectedUnreachable, isInternalErrorRoute, isLoginWall, mapWithConcurrency, statusOf, titleMentionsCard, type DeferredLink, type LinkTarget} from '../../../helpers/link-check'
import {step} from '../../../helpers/reporting/report'

const log = logger('test')

/** Requêtes HTTP simultanées pour le contrôle des cibles interceptées. */
const HTTP_CONCURRENCY = 6

/**
 * Smoke — aucun lien cassé dans le catalogue, les services et l'aide (plan : catalogue.md, scénarios S1.1, S1.2, S2.1).
 * Réunion du 2026-10-06 : « tous les liens du catalogue, quand on clique, on n'arrive pas sur une 404 ».
 *
 * Chaque carte ou entrée est cliquée pour obtenir sa cible : les boutons n'exposent aucune adresse dans le DOM (elle est calculée au
 * clic). Une cible externe sans jeton n'est pas chargée : le clic est intercepté, puis la page est contrôlée en HTTP (concurrence
 * bornée). Une adresse à jeton à usage unique (catalogue Service Public) est suivie par le navigateur (`followAndDescribe`).
 * Rien de plus que `hôte + chemin` n'est affiché ou journalisé.
 */
describe('Non-régression — catalogue, services et aide (smoke)', function () {
  // Délai posé ICI et non dans le corps du test : WDIO fixe son propre délai d'après le délai du test AVANT de l'exécuter
  // (@wdio/utils, executeAsync), un `this.timeout()` écrit dans un `it` ou un hook arrive trop tard et reste à 120 s.
  this.timeout(900000)

  before(async function () {
    await getAppToStartingState()
  })

  beforeEach(async function () {
    await getAppToStartingState()
  })

  it('S1.1 — chaque carte du catalogue mène à une page valide', async function () {
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
        if (isExpectedUnreachable(target)) log.warn(`ANOMALIE tolérée (hôte joignable seulement depuis un réseau privé) : ${line}`)
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
    const described = await mapWithConcurrency(deferred, HTTP_CONCURRENCY, async ({link}) => await describeByHttp(link))
    for (const [position, {label}] of deferred.entries()) judge(label, described[position])

    // Une page de connexion répond 200 : elle n'est pas un lien cassé, mais le signaler évite de la prendre pour un succès.
    if (loginWalls.length > 0) log.warn(`ANOMALIE ? ${loginWalls.length} carte(s) aboutissent sur une page de connexion : ${loginWalls.join(' | ')}`)
    if (broken.length > 0) throw new AssertionError({message: `${broken.length} lien(s) cassé(s) sur ${labels.length} :\n${broken.join('\n')}`})
  })

  it('S1.2 — « Trouver de l’aide » : le diagnostic cybermalveillance et les checklists s’ouvrent', async function () {
    await ServicesPage.open()
    await ServicesPage.assertDisplayed()

    step('diagnostic cybermalveillance')
    const sources = await ServicesPage.openCyberDiagnostic()
    expect(sources.length).toBeGreaterThan(0)
    for (const source of sources) {
      const status = await statusOf(source, `${new URL(await browser.getUrl()).origin}/`)
      const where = describeTarget({host: new URL(source).host, path: new URL(source).pathname})
      if (status === null || status >= 400) throw new AssertionError({message: `Iframe du diagnostic cybermalveillance : ${where} répond ${status}`})
    }

    for (const checklist of ['Je crée une association', 'Je deviens parent', 'Je pars vivre à l’étranger', 'Je souhaite accompagner mon enfant de 15 à 18 ans dans ses droits et ses démarches', 'Je suis affecté à l’étranger']) {
      step(`checklist « ${checklist} »`)
      // Par l'adresse et non par la barre basse : la route du diagnostic (puis une checklist) n'a pas de barre de navigation.
      await ServicesPage.returnFromExternal()
      await ServicesPage.openChecklist(checklist)
      expect((await ServicesPage.checklistSections()).length).toBeGreaterThan(0)
    }
  })

  it('S1.3 — chaque entrée de « Trouver de l’aide » mène à une page valide', async function () {
    await ServicesPage.open()
    await ServicesPage.assertDisplayed()
    const labels = await ServicesPage.helpLabels()
    expect(labels.length).toBeGreaterThan(0)
    log.info(`aide : ${labels.length} entrées`)

    const broken: string[] = []
    const judge = (label: string, target: LinkTarget): void => {
      if (target.internal) {
        if (isInternalErrorRoute(target)) broken.push(`« ${label} » → page d'erreur de l'application (${target.route})`)
      } else if (isBrokenTarget(target)) {
        const line = `« ${label} » → ${describeTarget(target)} (statut ${target.status}, « ${target.title} »${target.excerpt ? ` : ${target.excerpt.slice(0, 120)}` : ''})`
        // Hôte de préproduction partenaire joignable seulement depuis un réseau privé : avertissement, pas un échec (décision 2026-10-15).
        if (isExpectedUnreachable(target)) log.warn(`ANOMALIE tolérée (hôte joignable seulement depuis un réseau privé) : ${line}`)
        else broken.push(line)
      }
    }

    // Même principe que S1.1 : cibles externes sans jeton interceptées au clic puis contrôlées en HTTP en parallèle ; routes internes
    // et adresses à jeton suivies par le navigateur.
    const deferred: {label: string, link: DeferredLink}[] = []
    for (const [index, label] of labels.entries()) {
      step(`${index + 1}/${labels.length} — ${label}`)
      const target = await ServicesPage.openHelpEntry(index, {deferExternal: true})
      if (isDeferred(target)) {
        deferred.push({label, link: target})
        continue
      }
      judge(label, target)
      await ServicesPage.returnFromExternal()
      await ServicesPage.helpLabels()
    }
    step(`contrôle HTTP de ${deferred.length} cible(s) interceptée(s)`)
    const described = await mapWithConcurrency(deferred, HTTP_CONCURRENCY, async ({link}) => await describeByHttp(link))
    for (const [position, {label}] of deferred.entries()) judge(label, described[position])
    if (broken.length > 0) throw new AssertionError({message: `${broken.length} entrée(s) d'aide cassée(s) sur ${labels.length} :\n${broken.join('\n')}`})
  })

  it('S2.1 — « Aide et contact » : l’aide de l’administration répond et « Nous contacter » s’affiche', async function () {
    await AideContactPage.openHelpCenter()
    const target = await AideContactPage.openAdministrationHelp()
    if (isBrokenTarget(target)) throw new AssertionError({message: `Aide de l'administration : ${describeTarget(target)} répond ${target.status} (« ${target.title} »)`})
    expect(target.host).toContain('service-public.gouv.fr')

    await AideContactPage.returnFromExternal()
    await AideContactPage.openContactFromHelpCenter()
    await AideContactPage.openContactDialog()
  })
})
