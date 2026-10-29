import {AssertionError} from 'node:assert'
import logger from '@wdio/logger'
import ServicesPage from '../../../pages/services.page'
import {getAppToStartingState} from '../../../pages/authenticate.process'
import {describeDeferred, describeTarget, isBrokenTarget, isDeferred, isExpectedUnreachable, isInternalErrorRoute, statusOf, type DeferredLink, type LinkTarget} from '../../../helpers/webapp/link-check'
import {step} from '../../../helpers/reporting/report'

const log = logger('test')

/**
 * Smoke — les moments de vie (onglet « Trouver de l'aide » de Services) mènent à des pages valides .
 * Les listes d'étapes (checklists « Je crée une association »…) ont leur propre parcours, liste-etapes.parcours.test.ts : elles sont
 * ignorées ici, pour ne rien vérifier deux fois. Le catalogue des démarches est dans catalogue.parcours.test.ts.
 *
 * Même principe que le catalogue : chaque entrée est cliquée pour obtenir sa cible ; une cible externe sans jeton est interceptée au clic
 * puis contrôlée en HTTP (concurrence bornée), une route interne ou une adresse à jeton est suivie par le navigateur.
 */
describe('Non-régression — moments de vie, « Trouver de l’aide » (smoke)', function () {
  // Délai posé ICI et non dans le corps du test : WDIO fixe son propre délai d'après le délai du test AVANT de l'exécuter
  // (@wdio/utils, executeAsync), un `this.timeout()` écrit dans un `it` ou un hook arrive trop tard et reste à 120 s.
  this.timeout(900000)

  beforeEach(async function () {
    await getAppToStartingState()
  })

  it('chaque entrée de « Trouver de l’aide », hors listes d’étapes, mène à une page valide', async function () {
    await ServicesPage.open()
    await ServicesPage.assertDisplayed()
    const labels = await ServicesPage.helpLabels()
    expect(labels.length).toBeGreaterThan(0)
    const stepsLists = new Set(await ServicesPage.stepsListLabels())
    log.info(`aide : ${labels.length} entrées dont ${stepsLists.size} listes d'étapes ignorées (liste-etapes.parcours.test.ts)`)

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

    const deferred: {label: string, link: DeferredLink}[] = []
    for (const [index, label] of labels.entries()) {
      if (stepsLists.has(label)) continue
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
    const described = await describeDeferred(deferred)
    for (const [position, {label}] of deferred.entries()) judge(label, described[position])
    if (broken.length > 0) throw new AssertionError({message: `${broken.length} entrée(s) d'aide cassée(s) sur ${labels.length} :\n${broken.join('\n')}`})
  })

  it('le diagnostic cybermalveillance charge ses iframes', async function () {
    await ServicesPage.open()
    await ServicesPage.assertDisplayed()

    // L'entrée du diagnostic s'ouvre déjà dans le parcours précédent ; l'entrée s'ouvre ; ici le contenu embarqué : chaque source d'iframe doit répondre.
    const sources = await ServicesPage.openCyberDiagnostic()
    expect(sources.length).toBeGreaterThan(0)
    for (const source of sources) {
      const status = await statusOf(source, `${new URL(await browser.getUrl()).origin}/`)
      const where = describeTarget({host: new URL(source).host, path: new URL(source).pathname})
      if (status === null || status >= 400) throw new AssertionError({message: `Iframe du diagnostic cybermalveillance : ${where} répond ${status}`})
    }
  })
})
