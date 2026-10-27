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
 * Nommage : préfixe `mobile_` (Android et iOS), `webapp_` (Chrome). Les suites ne mélangent jamais les deux familles.
 * authentification.smoke.test.ts est listé en premier pour établir l'état authentifié.
 *
 * Chaque scénario doit être capable de s'authentifier seul pour être lancé en solo.
 * Donc, si vous voulez tester l'authentification dans votre suite, ils doivent être placés en premier :
 * dès qu'un autre fichier de test passe, vous serez déjà authentifié.
 */
export const testSuites: Record<string, string[]> = {
    /** Alias de `mobile_all` (historique) : tous les tests mobiles, authentification d'abord. */
    all: [
        r('src/tests/mobile/authentification.smoke.test.ts'),
        r('src/tests/mobile/**/*.test.ts'),
    ],

    /** Tous les tests mobiles (Android et iOS), authentification d'abord. */
    mobile_all: [
        r('src/tests/mobile/authentification.smoke.test.ts'),
        r('src/tests/mobile/**/*.test.ts'),
    ],

    /**
     * Specs webapp de premier niveau. Volontairement SANS `nonreg/` : `nonreg/passkey.usage.test.ts` exige une session vierge
     * (voir `webapp_nonreg`, qui la place en premier).
     */
    webapp_all: [
        r('src/tests/webapp/authentification.smoke.test.ts'),
        r('src/tests/webapp/*.test.ts'),
    ],

    /**
     * Smoke webapp (préprod, et webapp de l'API en CI sur PR) : « la suite la plus courte qui prouve qu'on ne perdra pas son temps en
     * lançant une campagne manuelle » (réunion du 2026-10-06) — authentification, puis aucun lien cassé dans le catalogue, les
     * services et l'aide. Plans : src/tests/webapp/nonreg/catalogue.md.
     */
    webapp_smoke: [
        r('src/tests/webapp/authentification.smoke.test.ts'),
        r('src/tests/webapp/nonreg/catalogue.parcours.test.ts'),
    ],

    /**
     * Recette webapp automatisée (préprod) : ce qui est pénible à vérifier à la main. Plans : src/tests/webapp/nonreg/*.md.
     * D'abord le parcours passkey, qui exige une session vierge (`wdio.webapp.conf.ts` supprime le profil avant cette spec), puis les
     * specs en lecture, puis celles qui modifient le compte (zones, consentements), restaurées en `after()`.
     */
    webapp_nonreg: [
        r('src/tests/webapp/nonreg/passkey.usage.test.ts'),
        r('src/tests/webapp/nonreg/demarche-detail.usage.test.ts'),
        r('src/tests/webapp/nonreg/zones-agenda.usage.test.ts'),
        r('src/tests/webapp/nonreg/consentement.usage.test.ts'),
        r('src/tests/webapp/nonreg/deconnexion-fc.usage.test.ts'), // staging seulement : se saute ailleurs avec un motif (ENV3)
    ],

    /** Suite webapp courte (fusion/tag en CI, débogage) : authentification seule. */
    webapp_short: [
        r('src/tests/webapp/authentification.smoke.test.ts'),
    ],

    /** Suite mobile courte pour raccourcir le débogage : authentification seule. */
    mobile_short: [
        r('src/tests/mobile/authentification.smoke.test.ts'),
    ],

    /** Smoke mobile pour la CI (Android) : authentification + scénarios critiques uniquement. */
    mobile_ci: [
        r('src/tests/mobile/authentification.smoke.test.ts'),
        r('src/tests/mobile/notifications.usage.test.ts'),
        r('src/tests/mobile/demarches.usage.test.ts'),
        r('src/tests/mobile/profil.usage.test.ts'),
    ],

    /**
     * Non-régression mobile des actions usagers (PR et merge de l'API) : connexion, notifications, démarches, profil, puis les parcours qui
     * se déconnectent (déconnexion/reconnexion, suppression des modifications du profil à la déconnexion), placés en dernier.
     */
    mobile_nonreg: [
        r('src/tests/mobile/authentification.smoke.test.ts'),
        r('src/tests/mobile/notifications.usage.test.ts'),
        r('src/tests/mobile/demarches.usage.test.ts'),
        r('src/tests/mobile/profil.usage.test.ts'),
        r('src/tests/mobile/deconnexion-reconnexion.usage.test.ts'),
        r('src/tests/mobile/profil-suppression-a-la-deconnexion.usage.test.ts'),
    ],

    /** Authentification + déconnexion/reconnexion (mobile). */
    mobile_auth: [
        r('src/tests/mobile/authentification.smoke.test.ts'),
        r('src/tests/mobile/deconnexion-reconnexion.usage.test.ts'),
    ],

    /** Authentification + déconnexion/reconnexion (webapp). */
    webapp_auth: [
        r('src/tests/webapp/authentification.smoke.test.ts'),
        r('src/tests/webapp/deconnexion.usage.test.ts'),
    ],

    /** Authentification seule (mobile). */
    auth: [
        r('src/tests/mobile/authentification.smoke.test.ts'),
    ],

    /** Scénarios pilotés par l'API partenaires (mobile) : notifications et démarches. */
    api: [
        r('src/tests/mobile/notifications.usage.test.ts'),
        r('src/tests/mobile/demarches.usage.test.ts'),
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
