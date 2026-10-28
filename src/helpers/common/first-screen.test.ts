/* eslint-disable wdio/no-floating-promise -- node:test (describe/it renvoient des promesses sans les attendre) */
import {describe, it} from 'node:test'
import assert from 'node:assert/strict'
import {describeFirstScreenTimeout, isLoginCallbackUrl, pickFirstScreen} from './first-screen'

describe('first-screen', () => {
  it('reconnaît la route login-callback, avec ou sans paramètres', () => {
    assert.equal(isLoginCallbackUrl('https://ami.example/login-callback?code=***'), true)
    assert.equal(isLoginCallbackUrl('https://ami.example/#/login-callback'), true)
    assert.equal(isLoginCallbackUrl('https://ami.example/#/welcome/zones'), false)
  })

  it('retient le premier écran visible dans l\'ordre fourni', () => {
    const probed = [
      {screen: {name: 'accueil'}, shown: false},
      {screen: {name: 'passkey'}, shown: true},
      {screen: {name: 'zones'}, shown: true},
    ]
    assert.equal(pickFirstScreen(probed)?.name, 'passkey')
  })

  it('retourne null quand rien n\'est visible', () => {
    assert.equal(pickFirstScreen([{screen: {name: 'zones'}, shown: false}]), null)
  })

  it('décrit l\'échec : écrans attendus, durée, URL', () => {
    const msg = describeFirstScreenTimeout(['accueil', 'passkey'], 'https://ami.example/login-callback', 25400)
    assert.match(msg, /accueil, passkey/)
    assert.match(msg, /25s/)
    assert.match(msg, /login-callback/)
  })
})
