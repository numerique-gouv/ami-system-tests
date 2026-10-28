/* eslint-disable wdio/no-floating-promise -- node:test (describe/it renvoient des promesses sans les attendre) */
import {describe, it} from 'node:test'
import assert from 'node:assert/strict'
import {describeFirstScreenTimeout, isBackendPageOutsideSpa, isLoginCallbackUrl, pickFirstScreen} from './first-screen'

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

  it('distingue une page serveur du backend de la SPA et des autres origines', () => {
    const backend = 'https://ami.example'
    assert.equal(isBackendPageOutsideSpa('https://ami.example/demarches/E2E-1/v2#/', backend), true)
    assert.equal(isBackendPageOutsideSpa('https://ami.example/', backend), false)
    assert.equal(isBackendPageOutsideSpa('https://ami.example/#/followup', backend), false)
    assert.equal(isBackendPageOutsideSpa('https://ami.example/?id_token=***#/login-callback', backend), false)
    assert.equal(isBackendPageOutsideSpa('https://fcp-low.example/api/v2/authorize', backend), false)
    assert.equal(isBackendPageOutsideSpa('about:blank', backend), false)
  })
})
