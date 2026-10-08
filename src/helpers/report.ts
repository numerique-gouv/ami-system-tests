import logger from '@wdio/logger'

const log = logger('test')

/**
 * Étapes d'un scénario. Remplace `AllureReporter.addStep` : l'étape est journalisée et mémorisée, puis écrite dans le dump
 * d'un test en échec (`failure-dump.ts`), pour savoir où le scénario s'est arrêté sans relire tous les logs.
 * Les annotations feature / severity / epic / story / tag d'Allure ne sont pas reprises : les titres de `describe` et de `it`
 * portent déjà la fonctionnalité.
 */
let steps: string[] = []

export function step(label: string): void {
  steps.push(label)
  log.info(`    · ${label}`)
}

/** Remet la liste à zéro au début de chaque test. */
export function resetSteps(): void {
  steps = []
}

/** Étapes du test courant, dans l'ordre. */
export function currentSteps(): string[] {
  return [...steps]
}
