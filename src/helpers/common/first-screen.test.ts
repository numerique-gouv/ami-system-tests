/* eslint-disable wdio/no-floating-promise -- node:test (describe/it renvoient des promesses sans les attendre) */
import {describe, it} from 'node:test'
import assert from 'node:assert/strict'
import {isBackendPageOutsideSpa, isLoginCallbackUrl} from './first-screen'

describe('first-screen', () => {
  it('reconnaît la route login-callback, avec ou sans paramètres', () => {
    assert.equal(isLoginCallbackUrl('https://ami.example/login-callback?code=***'), true)
    assert.equal(isLoginCallbackUrl('https://ami.example/#/login-callback'), true)
    assert.equal(isLoginCallbackUrl('https://ami.example/#/welcome/zones'), false)
  })

  it('distingue une page serveur du backend de la SPA et des autres origines', () => {
    const backend = 'https://ami.example'
    assert.equal(isBackendPageOutsideSpa('https://ami.example/demarches/E2E-1/v2#/', backend), true)
    assert.equal(isBackendPageOutsideSpa('https://ami.example/', backend), false)
    assert.equal(isBackendPageOutsideSpa('https://ami.example/#/followup', backend), false)
    assert.equal(isBackendPageOutsideSpa('https://ami.example/?id_token=***#/login-callback', backend), false)
    assert.equal(isBackendPageOutsideSpa('https://ami.example/?login_redirect_url=https%3A%2F%2Fami.example%2Fdemarches%2F1&id_token=***#/login-callback', backend), true)
    assert.equal(isBackendPageOutsideSpa('https://fcp-low.example/api/v2/authorize', backend), false)
    assert.equal(isBackendPageOutsideSpa('about:blank', backend), false)
  })
})
