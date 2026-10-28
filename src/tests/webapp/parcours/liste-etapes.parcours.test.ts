import {AssertionError} from 'node:assert'
import logger from '@wdio/logger'
import ServicesPage from '../../../pages/services.page'
import StepsListPage from '../../../pages/steps-list.page'
import {getAppToStartingState} from '../../../pages/authenticate.process'
import {describeByHttp, describeTarget, isBrokenTarget, isDeferred, isExpectedUnreachable, mapWithConcurrency, type DeferredLink, type LinkTarget} from '../../../helpers/webapp/link-check'
import {step} from '../../../helpers/reporting/report'

const log = logger('test')

/** Requêtes HTTP simultanées pour le contrôle des cibles interceptées. */
const HTTP_CONCURRENCY = 6

/**
 * Listes d'étapes (« Comment faire si… ») — chaque lien fonctionne (plan : catalogue.md, scénario S1.4). Réunion du 2026-10-06,
 * 20:40–21:51 : un item à un seul lien mène directement à une page externe, un item à plusieurs liens ouvre une page intermédiaire
 * qui les liste ; « est-ce qu'on peut tester que chaque lien fonctionne ? au moins ça ».
 *
 * Seul le PARCOURS est contrôlé, pas le contenu (wording, ordre : configurable, hors de la main de l'équipe). Les listes sont
 * découvertes dynamiquement (`data-testid` préfixé `service-steps-`) : aucun libellé de liste ou d'item n'est codé en dur.
 */
describe('Non-régression — listes d’étapes', function () {
  // Délai posé ICI et non dans le corps du test : WDIO fixe son propre délai d'après le délai du test AVANT de l'exécuter
  // (@wdio/utils, executeAsync), un `this.timeout()` écrit dans un `it` ou un hook arrive trop tard et reste à 120 s.
  this.timeout(2400000)

  before(async function () {
    await getAppToStartingState()
  })

  beforeEach(async function () {
    await getAppToStartingState()
  })

  it('S1.4 — chaque lien des listes d’étapes mène à une page valide, directement ou par la page intermédiaire', async function () {
    await ServicesPage.open()
    await ServicesPage.assertDisplayed()
    const lists = await ServicesPage.stepsListLabels()
    expect(lists.length).toBeGreaterThan(0)
    log.info(`listes d'étapes : ${lists.length}`)

    const broken: string[] = []
    let followed = 0
    const check = (where: string, target: LinkTarget): void => {
      followed++
      if (target.internal) broken.push(`${where} : le lien est resté dans l'application (${target.route || target.path})`)
      else if (isBrokenTarget(target)) {
        const line = `${where} → ${describeTarget(target)} (statut ${target.status}, « ${target.title} »)`
        // Hôte de préproduction partenaire joignable seulement depuis un réseau privé : avertissement, pas un échec (décision 2026-10-15).
        if (isExpectedUnreachable(target)) log.warn(`ANOMALIE tolérée (hôte joignable seulement depuis un réseau privé) : ${line}`)
        else broken.push(line)
      }
    }

    // Cibles externes sans jeton : interceptées au clic (page non chargée, donc ni retour ni rechargement), contrôlées en HTTP après le
    // parcours, en parallèle. Chacune garde son `where`. Les adresses à jeton et les liens restés dans l'application suivent le
    // chemin habituel (clic + navigateur, puis retour).
    const deferred: {where: string, link: DeferredLink}[] = []
    /** Suit un lien ; `true` si la page a été quittée (retour nécessaire), `false` si la cible a seulement été interceptée. */
    const follow = (where: string, target: LinkTarget | DeferredLink): boolean => {
      if (isDeferred(target)) {
        deferred.push({where, link: target})
        return false
      }
      check(where, target)
      return true
    }

    for (const [l, list] of lists.entries()) {
      step(`liste ${l + 1}/${lists.length} — ${list}`)
      await ServicesPage.returnFromExternal()
      await ServicesPage.openStepsList(l)
      await StepsListPage.assertDisplayed()
      const listRoute = await StepsListPage.route()
      const sections = await StepsListPage.sections()

      for (const [s, section] of sections.entries()) {
        await StepsListPage.returnTo(listRoute)
        const sectionRoute = await StepsListPage.openSection(s)
        const items = await StepsListPage.linkItems()
        log.info(`${list} › ${section} : ${items.length} item(s) à lien`)

        for (const [i, item] of items.entries()) {
          const where = `${list} › ${section} › ${item.kind === 'direct' ? `« ${item.label} »` : `page n° ${i + 1}`}`
          if (item.kind === 'direct') {
            // Un lien direct mène tout de suite à une page externe, sans page intermédiaire.
            if (follow(where, await StepsListPage.followDirectLink(i, {deferExternal: true}))) await StepsListPage.returnTo(sectionRoute)
            continue
          }
          // Un item à plusieurs liens ouvre d'abord une page intermédiaire qui les liste.
          const itemRoute = await StepsListPage.openItemPage(i)
          const links = await StepsListPage.itemPageLinks()
          if (links.length < 2) broken.push(`${where} : page intermédiaire avec ${links.length} lien(s) (au moins 2 attendus)`)
          for (const [k, link] of links.entries()) {
            if (follow(`${where} › « ${link} »`, await StepsListPage.followItemPageLink(k, {deferExternal: true}))) await StepsListPage.returnTo(itemRoute)
          }
          await StepsListPage.returnTo(sectionRoute)
        }
      }
    }

    step(`contrôle HTTP de ${deferred.length} cible(s) interceptée(s)`)
    const described = await mapWithConcurrency(deferred, HTTP_CONCURRENCY, async ({link}) => await describeByHttp(link))
    for (const [position, {where}] of deferred.entries()) check(where, described[position])

    log.info(`liens suivis : ${followed}`)
    // Sans aucun lien suivi, le scénario ne prouverait rien : on le dit plutôt que de passer.
    if (followed === 0) throw new AssertionError({message: `Aucun item à lien dans les ${lists.length} listes d'étapes : S1.4 n'a rien vérifié`})
    if (broken.length > 0) throw new AssertionError({message: `${broken.length} lien(s) cassé(s) sur ${followed} dans les listes d'étapes :\n${broken.join('\n')}`})
  })
})
