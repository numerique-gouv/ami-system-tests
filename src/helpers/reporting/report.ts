import logger from '@wdio/logger'

const log = logger('test')

/** Étapes du scénario courant, écrites dans le dump d'un test en échec pour savoir où il s'est arrêté. */
let steps: string[] = []

export function step(label: string): void {
  steps.push(label)
  log.info(`    · ${label}`)
}

export function resetSteps(): void {
  steps = []
}

export function currentSteps(): string[] {
  return [...steps]
}
