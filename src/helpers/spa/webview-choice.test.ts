/* eslint-disable wdio/no-floating-promise -- node:test (describe/it renvoient des promesses sans les attendre) */
import assert from 'node:assert/strict'
import {describe, it} from 'node:test'
import {isUnambiguous, lastVisible} from './webview-choice'

describe('lastVisible', () => {
  it('prend la dernière WebView visible', () => {
    assert.equal(lastVisible(['a', 'b', 'c'], [true, true, false]), 'b')
  })
  it('prend la seule WebView visible, même si elle n\'est pas la dernière', () => {
    assert.equal(lastVisible(['accueil', 'notifications'], [true, false]), 'accueil')
  })
  it('à défaut de visible, prend la dernière de la liste', () => {
    assert.equal(lastVisible(['a', 'b'], [false, false]), 'b')
  })
  it('une seule WebView : elle-même', () => {
    assert.equal(lastVisible(['a'], [true]), 'a')
    assert.equal(lastVisible(['a'], [false]), 'a')
  })
  it('liste vide : undefined', () => {
    assert.equal(lastVisible([], []), undefined)
  })
})

describe('isUnambiguous', () => {
  it('vrai pour exactement une visible', () => {
    assert.equal(isUnambiguous([false, true]), true)
  })
  it('faux pour aucune ou plusieurs', () => {
    assert.equal(isUnambiguous([false, false]), false)
    assert.equal(isUnambiguous([true, true]), false)
  })
})
