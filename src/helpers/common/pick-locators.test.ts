/* eslint-disable wdio/no-floating-promise -- node:test (describe/it renvoient des promesses sans les attendre) */
import {describe, it} from 'node:test'
import assert from 'node:assert/strict'
import {chooseLocators} from './pick-locators'

const variants = {web: 'w', android: 'a'}

describe('chooseLocators', () => {
  it('web : dans une WebView ou en webapp', () => {
    assert.equal(chooseLocators('P', variants, 'web', 'android'), 'w')
    assert.equal(chooseLocators('P', variants, 'web', 'webapp'), 'w')
  })

  it('natif : la variante de la plateforme', () => {
    assert.equal(chooseLocators('P', variants, 'native', 'android'), 'a')
  })

  it('natif sans variante pour la plateforme : erreur qui renvoie vers inWebContext', () => {
    assert.throws(() => chooseLocators('P', variants, 'native', 'ios'), /P n'a pas de locators ios : l'appeler dans un inWebContext/)
  })

  it('web absent : erreur', () => {
    assert.throws(() => chooseLocators('P', {android: 'a'}, 'web', 'android'), /P n'a pas de locators web/)
  })
})
