import path from 'path'
import logger from '@wdio/logger'

const log = logger('scenario')

const r = (p: string) => path.resolve(__dirname, p)

/**
 * Suites de tests nommées pour `just test-android-suite <nom>` / `just test-ios-suite <nom>`.
 *
 * Chaque suite est un tableau de groupes (tableaux imbriqués WDIO) :
 * les fichiers d'un même groupe partagent une session Appium — l'app est lancée
 * une seule fois et l'état (authentification, données) est conservé entre fichiers.
 *
 * authentication.test.ts est toujours listé en premier pour établir l'état
 * authentifié avant les autres specs (WDIO déduplique si le glob le couvre aussi).
 *
 * Ajouter une suite : une nouvelle entrée string[][] suffit, sans toucher aux configs WDIO.
 *
 * Chaque scénario doit être capable de s'authentifier seul pour être lancé en solo.
 * Donc, si vous voulez tester l'authentification dans votre suite, ils doivent être placés en premier :
 * dès qu'un autre fichier de test passe, vous serez déjà authentifié.
 */
export const testSuites: Record<string, string[][]> = {
    /** Tous les tests en session partagée — auth une seule fois. */
    all: [[
        r('src/tests/mobile/authentication.test.ts'),
        r('src/tests/mobile/**/*.test.ts'),
    ]],

    mobile_all: [[
        r('src/tests/mobile/authentication.test.ts'),
        r('src/tests/mobile/**/*.test.ts'),
    ]],

    webapp_all: [[
        r('src/tests/webapp/authentication.test.ts'),
        r('src/tests/webapp/**/*.test.ts'),
    ]],

    /** Suite courte pour raccourcir le débogage en CI. */
    short: [[
        r('src/tests/mobile/authentication.test.ts'),
    ]],

    /** Smoke suite CI : authentification + scénarios critiques uniquement. */
    CI: [[
        r('src/tests/mobile/authentication.test.ts'),
        r('src/tests/mobile/notifications.test.ts'),
        r('src/tests/mobile/demarches.test.ts'),
        r('src/tests/mobile/profile.test.ts'),
    ]],

    /** Authentification + déconnexion/reconnexion (mobile). */
    mobile_auth: [[
        r('src/tests/mobile/authentication.test.ts'),
        r('src/tests/mobile/login_logout_login.test.ts'),
    ]],

    /** Authentification + déconnexion/reconnexion (webapp). */
    webapp_auth: [[
        r('src/tests/webapp/authentication.test.ts'),
        r('src/tests/webapp/deconnexion.test.ts'),
    ]],

    /** Tous les tests d'authentification en session séparée. */
    auth: [[
        r('src/tests/mobile/authentication.test.ts'),
    ]],

    api: [[
        r('src/tests/mobile/notifications.test.ts'),
        r('src/tests/mobile/demarches.test.ts'),
    ]],
}

/**
 * Résout la valeur `specs` d'une config WDIO : suite nommée via WDIO_SUITE si définie,
 * sinon `defaultGlob` propre à la plateforme appelante (mobile ou webapp — chacune a son
 * propre arbre sous src/tests/, cf. CLAUDE.md §Architecture).
 */
export function resolveSpecs(defaultGlob: string): string[] | string[][] {
    const suiteName = process.env.WDIO_SUITE
    if (suiteName) {
        const suite = testSuites[suiteName]
        if (!suite) throw new Error(
            `Suite inconnue : "${suiteName}". Suites disponibles : ${Object.keys(testSuites).join(', ')}`
        )
        log.warn(`On utilise la suite ${suiteName}:`, suite)
        return suite
    }
    return [defaultGlob]
}
