import {AssertionError} from 'node:assert'
import logger from '@wdio/logger'
import ServicesPage from '../../../pages/services.page'
import StepsListPage from '../../../pages/steps-list.page'
import {getAppToStartingState} from '../../../pages/authenticate.process'
import {describeDeferred, describeTarget, isBrokenTarget, isDeferred, isExpectedUnreachable, toleratedUnreachableWarning, type DeferredLink, type LinkTarget} from '../../../helpers/webapp/link-check'
import {step} from '../../../helpers/reporting/report'

const log = logger('test')

/**
 * Listes d'étapes (« Comment faire si… ») : chaque lien fonctionne. Un item à un seul lien mène directement à une page externe, un item à
 * plusieurs liens ouvre une page intermédiaire qui les liste. Seul le parcours est contrôlé, pas le contenu (configurable, hors de la main de
 * l'équipe) : les listes sont découvertes dynamiquement (`data-testid` préfixé `service-steps-`), aucun libellé n'est codé en dur.
 */
describe('Non-régression — listes d’étapes', function () {
  this.timeout(2400000)

  beforeEach(async function () {
    await getAppToStartingState()
  })

  it('chaque lien des listes d’étapes mène à une page valide, directement ou par la page intermédiaire', async function () {
    await ServicesPage.open()
    await ServicesPage.assertDisplayed()
    const lists = await ServicesPage.stepsListLabels()
    expect(lists).not.toHaveLength(0)

    const broken: string[] = []
    let followed = 0
    const check = (where: string, target: LinkTarget): void => {
      followed++
      if (target.internal) broken.push(`${where} : le lien est resté dans l'application (${target.route || target.path})`)
      else if (isBrokenTarget(target)) {
        const line = `${where} → ${describeTarget(target)} (statut ${target.status}, « ${target.title} »)`
        if (isExpectedUnreachable(target)) log.warn(toleratedUnreachableWarning(line))
        else broken.push(line)
      }
    }

    // Cibles externes sans jeton : interceptées au clic puis contrôlées en HTTP après le parcours ; les autres sont suivies par le navigateur, puis retour.
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
    const described = await describeDeferred(deferred)
    for (const [position, {where}] of deferred.entries()) check(where, described[position])

    // Sans aucun lien suivi, le scénario ne prouverait rien : on le dit plutôt que de passer.
    if (followed === 0) throw new AssertionError({message: `Aucun item à lien dans les ${lists.length} listes d'étapes : ce parcours n'a rien vérifié`})
    if (broken.length > 0) throw new AssertionError({message: `${broken.length} lien(s) cassé(s) sur ${followed} dans les listes d'étapes :\n${broken.join('\n')}`})
  })
})
