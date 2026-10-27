import fs, {globSync} from 'fs'
import path from 'path'
import logger from '@wdio/logger'

const log = logger('scenario')

const r = (p: string) => path.resolve(__dirname, p)

/**
 * Suites de tests nommées pour `just test-android-suite <nom>` / `just test-ios-suite <nom>` / `just test-webci-suite <nom>`.
 *
 * Chaque suite est une LISTE PLATE de specs (ou de globs), équivalente à `--spec a --spec b` en ligne de commande :
 * WebdriverIO lance un worker (donc une session WebDriver) par fichier. Les anciens groupes imbriqués (`[[a, b]]`), qui
 * fusionnaient les specs en un seul worker, ont été retirés : une suite ne change plus la façon dont les specs sont exécutées,
 * elle ne fait que les désigner. L'ordre est celui de la liste (`maxInstances: 1` : un worker à la fois).
 *
 * L'état de l'app est conservé d'une spec à l'autre sans session partagée : profil Chrome du run (webapp, cf. wdio.webapp.conf.ts)
 * ou app non redémarrée (Android). Les specs qui exigent une session vierge (authentication, nonreg/passkey) vident ce profil
 * avant leur démarrage (`beforeSession`).
 *
 * Nommage : préfixe `mobile_` (Android et iOS), `webapp_` (Chrome), puis `short` (authentification seule, mise au point de la CI),
 * `smoke` (catégorie smoke : valider un déploiement), `usage` (smoke + usage : PR/merge/tag webapp) ou `all` (tout). Les suites ne
 * mélangent jamais les deux familles. authentification.smoke.test.ts est listé en premier pour établir l'état authentifié.
 * Tableau suite → déclencheur : CONTRIBUTING.md, section « Suites nommées ».
 *
 * Chaque scénario doit être capable de s'authentifier seul pour être lancé en solo.
 * Donc, si vous voulez tester l'authentification dans votre suite, ils doivent être placés en premier :
 * dès qu'un autre fichier de test passe, vous serez déjà authentifié.
 */
export const testSuites: Record<string, string[]> = {
    // ─── Mobile (Android + iOS) ─────────────────────────────────────────────────────────────────────────────────────────

    /**
     * CI, mise au point : authentification seule (quelques minutes). Sert à construire ou déboguer un workflow sans payer une
     * campagne complète ; c'est aussi la valeur par défaut des lancements manuels (workflow_dispatch).
     */
    mobile_short: [
        r('src/tests/mobile/authentification.smoke.test.ts'),
    ],

    /**
     * Hors CI, « valider un déploiement » : tous les tests de catégorie `smoke` mobiles (aujourd'hui : l'authentification seule), le
     * minimum qui prouve que l'app et son backend déployé se parlent. Défini par motif : tout nouveau `*.smoke.test.ts` y entre.
     */
    mobile_smoke: [
        r('src/tests/mobile/authentification.smoke.test.ts'),
        r('src/tests/mobile/**/*.smoke.test.ts'),
    ],

    /**
     * PR, merge et tag (API et app Android) ; hors CI, « tester un déploiement » : TOUS les tests mobiles (smoke, parcours, usage),
     * authentification d'abord pour établir l'état authentifié. Quelques dizaines de minutes.
     */
    mobile_all: [
        r('src/tests/mobile/authentification.smoke.test.ts'),
        r('src/tests/mobile/**/*.test.ts'),
    ],

    /** Alias historique de `mobile_all` (workflows-samples, anciennes docs). */
    all: [
        r('src/tests/mobile/authentification.smoke.test.ts'),
        r('src/tests/mobile/**/*.test.ts'),
    ],

    /** Scénarios pilotés par l'API partenaires (mobile) : notifications et démarches. */
    api: [
        r('src/tests/mobile/notifications.usage.test.ts'),
        r('src/tests/mobile/demarches.usage.test.ts'),
    ],

    // ─── Webapp (Chrome) ────────────────────────────────────────────────────────────────────────────────────────────────
    // Les deux specs qui exigent une session vierge (authentification.smoke et nonreg/passkey.usage : `wdio.webapp.conf.ts` vide le
    // profil Chrome avant elles, d'après leur nom de fichier) sont toujours EN PREMIER ; les autres reprennent la session ouverte.

    /** CI, mise au point : authentification seule (une minute ou deux) ; valeur par défaut des lancements manuels. */
    webapp_short: [
        r('src/tests/webapp/authentification.smoke.test.ts'),
    ],

    /**
     * Hors CI, « valider un déploiement » : tous les tests de catégorie `smoke` webapp (authentification, accueil), quelques minutes.
     * Le contrôle des liens externes (`nonreg/catalogue.parcours`) n'en fait plus partie (catégorie parcours) : il reste dans `webapp_all`.
     */
    webapp_smoke: [
        r('src/tests/webapp/authentification.smoke.test.ts'),
        r('src/tests/webapp/**/*.smoke.test.ts'),
    ],

    /**
     * PR, merge et tag : les tests smoke + usage (nonreg compris), c'est-à-dire ce que font les usagers, sans les parcours de
     * navigation exhaustifs. Dix à vingt minutes.
     */
    webapp_usage: [
        r('src/tests/webapp/authentification.smoke.test.ts'),
        r('src/tests/webapp/nonreg/passkey.usage.test.ts'),
        r('src/tests/webapp/**/*.smoke.test.ts'),
        r('src/tests/webapp/**/*.usage.test.ts'),
    ],

    /** Hors CI, « tester un déploiement » : TOUS les tests webapp (smoke, usage, parcours ; nonreg compris). */
    webapp_all: [
        r('src/tests/webapp/authentification.smoke.test.ts'),
        r('src/tests/webapp/nonreg/passkey.usage.test.ts'),
        r('src/tests/webapp/**/*.test.ts'),
    ],
}

/**
 * Liste plate des specs d'une suite nommée : les globs sont développés (ordre alphabétique pour un même glob), l'ordre des entrées
 * est conservé et un fichier déjà cité plus haut n'est pas répété. Lève une erreur si la suite est inconnue ou si une entrée ne
 * désigne aucun fichier.
 */
export function suiteSpecs(suiteName: string): string[] {
    const suite = testSuites[suiteName]
    if (!suite) throw new Error(
        `Suite inconnue : "${suiteName}". Suites disponibles : ${Object.keys(testSuites).join(', ')}`
    )
    const specs: string[] = []
    for (const entry of suite) {
        const files = /[*?[{]/.test(entry) ? globSync(entry).sort() : [entry]
        if (files.length === 0 || (files.length === 1 && !fs.existsSync(files[0]))) {
            throw new Error(`Suite "${suiteName}" : aucun fichier pour "${entry}"`)
        }
        for (const file of files) if (!specs.includes(file)) specs.push(file)
    }
    return specs
}

/**
 * Résout la valeur `specs` d'une config WDIO : suite nommée via WDIO_SUITE si définie (liste plate : un worker par spec, comme avec
 * `--spec a --spec b`), sinon `defaultGlob` propre à la plateforme appelante (mobile ou webapp — chacune a son propre arbre sous
 * src/tests/, cf. CLAUDE.md §Architecture).
 */
export function resolveSpecs(defaultGlob: string): string[] {
    const suiteName = process.env.WDIO_SUITE
    if (suiteName) {
        const specs = suiteSpecs(suiteName)
        log.warn(`On utilise la suite ${suiteName}:`, specs)
        return specs
    }
    return [defaultGlob]
}
