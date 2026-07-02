import path from 'path'

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
 */
export const testSuites: Record<string, string[][]> = {
  /** 
   * Chaque scénario doit être capable de s'authentifier seul pour être lancé en solo.
   * Donc, si vous voulez tester l'authentification dans votre suite, ils doivent être placés en premiers.
   * Dès qu'un autre fichier de test passe, vous serez déjà authentifiés
   */
  /** Tous les tests en session partagée — auth une seule fois. */
  all: [[
    r('src/tests/authentication.test.ts'),
    r('src/tests/**/*.test.ts'),
  ]],

  /** Smoke suite CI : authentification + scénarios critiques uniquement. */
  CI: [[
    r('src/tests/authentication.test.ts'),
    r('src/tests/notifications.test.ts'),
    r('src/tests/demarches.test.ts'),
    r('src/tests/profile.test.ts'),
  ]],
  
  /** Tous les tests d'authentifications en session séparées. */
  auth: [[
    r('src/tests/authentication.test.ts'),
//  ],[
//    r('src/tests/authentication_2.test.ts'),
  ],
  ],

}
