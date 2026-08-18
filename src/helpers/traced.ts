import logger from '@wdio/logger'

// Logger nommé dédié : permet de l'activer/désactiver indépendamment du
// reste (voir `logLevels['page-object']` dans wdio.base.conf.ts) sans
// changer le niveau global 'warn' qui filtre le bruit Appium.
const log = logger('page-object')

export function traced<T extends object>(instance: T, label: string): T {
  return new Proxy(instance, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver)
      if (typeof value !== 'function' || typeof prop !== 'string') return value
      return function (...args: unknown[]): unknown {
        const params = args.length
          ? ` (${args.map(a => JSON.stringify(a)).join(', ')})`
          : ''
        log.info(`call ${label}.${prop}${params}`)
        return (value as (...a: unknown[]) => unknown).apply(target, args)
      }
    },
  })
}
