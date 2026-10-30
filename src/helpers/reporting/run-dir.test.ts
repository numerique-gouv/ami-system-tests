/* eslint-disable wdio/no-floating-promise -- node:test (describe/it renvoient des promesses sans les attendre) */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { runDirName, runScope } from './run-dir'

describe('runScope', () => {
  it('nomme le run d\'après la suite native (--suite NOM ou --suite=NOM)', () => {
    assert.equal(runScope(['node', 'wdio', 'run', 'wdio.webapp.conf.ts', '--suite', 'webapp_smoke']), 'webapp_smoke')
    assert.equal(runScope(['node', 'wdio', 'run', 'wdio.webapp.conf.ts', '--suite=webapp_usage']), 'webapp_usage')
  })
  it('à défaut, premier --spec puis +N', () => {
    assert.equal(runScope(['--spec', 'src/tests/webapp/accueil.smoke.test.ts']), 'accueil.smoke')
    assert.equal(runScope(['--spec=a.test.ts', '--spec', 'b.test.ts']), 'a+1')
  })
  it('sans suite ni spec : all', () => {
    assert.equal(runScope(['node', 'wdio']), 'all')
  })
})

describe('runDirName', () => {
  it('<horodatage>_<plateforme>_<suite>', () => {
    assert.equal(runDirName('webapp', 0, ['--suite', 'webapp_smoke']), '1970-01-01T00-00-00-000Z_webapp_webapp_smoke')
  })
})
