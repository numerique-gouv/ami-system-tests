/* eslint-disable no-console */
/**
 * Résolution à blanc des suites nommées de test-suites.ts : affiche la liste plate de specs de chaque suite (ou de celle passée en
 * argument), sans lancer WebdriverIO. Usage : `just list-suite [NOM]` ou `npx ts-node --project tsconfig.json src/scripts/list-suite.ts [NOM]`.
 * Code de sortie 1 si une suite est inconnue, vide ou mélange des specs mobiles et webapp.
 */
import path from 'path'
import {suiteSpecs, testSuites} from '../../test-suites'

const names = process.argv.slice(2).length > 0 ? process.argv.slice(2) : Object.keys(testSuites)
let failed = false
for (const name of names) {
  try {
    const specs = suiteSpecs(name).map(spec => path.relative(process.cwd(), spec))
    const families = new Set(specs.map(spec => spec.split(path.sep)[2]))
    const mixed = families.size > 1
    console.log(`${name} (${specs.length} specs${mixed ? ', MÉLANGE mobile/webapp' : ''})`)
    for (const spec of specs) console.log(`  ${spec}`)
    if (mixed || specs.length === 0) failed = true
  } catch (err) {
    console.error(`${name} : ${(err as Error).message}`)
    failed = true
  }
}
process.exit(failed ? 1 : 0)
